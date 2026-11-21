/**
 * Usage ledger. `AuthUser.tokensUsed` stays as the small quota fast path; this
 * table is the reporting source of truth and adds a best-effort dollar cost.
 */

import { ensureFoundationSchema, getChatDb, type D1Like } from "./d1";
import { chargeUsageEvent } from "./economy";
import { newId, type UsageEvent, type UsageKind, type UsageSummary } from "./foundation";
import type { LLMUsage } from "./llm-router";
import { estimateChatCost } from "./pricing";
import { getProvider, type ProviderId } from "./providers";

interface UsageRow {
  id: string;
  uid: string;
  run_id: string | null;
  kind: string;
  provider: string;
  model: string;
  prompt_tokens: number | string;
  completion_tokens: number | string;
  total_tokens: number | string;
  cost_usd: number | string;
  currency: string;
  pricing_source: string | null;
  latency_ms: number | string | null;
  created_at: string;
  metadata: string | null;
}

export interface RecordUsageInput {
  uid: string;
  runId?: string | null;
  kind?: UsageKind;
  provider: ProviderId;
  model: string;
  usage?: LLMUsage;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  /** Explicit cost for non-token surfaces (image/video/terminal tools). */
  costUsd?: number;
  pricingSource?: string;
}

async function foundationDb(): Promise<D1Like | null> {
  const db = await getChatDb();
  if (!db) return null;
  await ensureFoundationSchema(db);
  return db;
}

function mapRow(r: UsageRow): UsageEvent {
  let metadata: Record<string, unknown> | undefined;
  try {
    metadata = r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : undefined;
  } catch {
    metadata = undefined;
  }
  return {
    id: r.id,
    uid: r.uid,
    runId: r.run_id ?? null,
    kind: (r.kind as UsageKind) || "chat",
    provider: r.provider,
    model: r.model,
    promptTokens: Number(r.prompt_tokens) || 0,
    completionTokens: Number(r.completion_tokens) || 0,
    totalTokens: Number(r.total_tokens) || 0,
    costUsd: Number(r.cost_usd) || 0,
    currency: "USD",
    pricingSource: r.pricing_source || "unknown",
    latencyMs: r.latency_ms == null ? null : Number(r.latency_ms),
    createdAt: r.created_at,
    metadata,
  };
}

export async function recordUsageEvent(input: RecordUsageInput): Promise<UsageEvent | null> {
  const db = await foundationDb();
  const promptTokens = Math.max(0, input.usage?.prompt_tokens ?? 0);
  const completionTokens = Math.max(0, input.usage?.completion_tokens ?? 0);
  const totalTokens = Math.max(0, input.usage?.total_tokens ?? promptTokens + completionTokens);
  // Local runtimes and self-hosted custom endpoints have no catalog price.
  // Record zero rather than guessing a positive charge.
  const runtime = getProvider(input.provider);
  const localPrice = runtime?.localOnly || input.provider === "custom-openai"
    ? { costUsd: 0, source: runtime?.localOnly ? "local" : "custom", rate: { input: 0, output: 0 } }
    : null;
  const price = localPrice ?? (input.costUsd != null && Number.isFinite(input.costUsd)
    ? {
      costUsd: Math.max(0, input.costUsd),
      source: input.pricingSource || "custom-estimate",
      rate: { input: 0, output: 0 },
    }
    : estimateChatCost({
      provider: input.provider,
      model: input.model,
      promptTokens,
      completionTokens,
    }));
  const event: UsageEvent = {
    id: newId("usage"),
    uid: input.uid,
    runId: input.runId ?? null,
    kind: input.kind ?? "chat",
    provider: input.provider,
    model: input.model,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd: price.costUsd,
    currency: "USD",
    pricingSource: price.source,
    latencyMs: input.latencyMs ?? null,
    createdAt: new Date().toISOString(),
    metadata: input.metadata,
  };
  if (!db) return event;
  await db
    .prepare(`INSERT INTO usage_events
      (id, uid, run_id, kind, provider, model, prompt_tokens, completion_tokens, total_tokens,
       cost_usd, currency, pricing_source, latency_ms, created_at, metadata)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`)
    .bind(
      event.id, event.uid, event.runId, event.kind, event.provider, event.model,
      event.promptTokens, event.completionTokens, event.totalTokens, event.costUsd,
      event.currency, event.pricingSource, event.latencyMs, event.createdAt,
      event.metadata ? JSON.stringify(event.metadata) : null,
    )
    .run();
  // Economic layer: every usage event is mirrored into the wallet ledger so
  // cost accounting cannot drift from the authoritative usage table. Best
  // effort — a ledger failure must never fail an already-completed model call.
  await chargeUsageEvent(event).catch(() => null);
  return event;
}

export async function listUsageEvents(uid: string, limit = 200): Promise<UsageEvent[]> {
  const db = await foundationDb();
  if (!db) return [];
  const { results } = await db
    .prepare("SELECT * FROM usage_events WHERE uid = ?1 ORDER BY created_at DESC")
    .bind(uid)
    .all<UsageRow>();
  return results.map(mapRow).slice(0, Math.max(1, Math.min(1000, limit)));
}

export function summarizeUsage(events: UsageEvent[]): UsageSummary {
  const providers = new Map<string, { tokens: number; costUsd: number; events: number }>();
  const models = new Map<string, { provider: string; model: string; tokens: number; costUsd: number; events: number }>();
  const summary: UsageSummary = {
    events: events.length,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    byProvider: [],
    byModel: [],
  };
  for (const e of events) {
    summary.totalTokens += e.totalTokens;
    summary.promptTokens += e.promptTokens;
    summary.completionTokens += e.completionTokens;
    summary.costUsd += e.costUsd;
    const p = providers.get(e.provider) ?? { tokens: 0, costUsd: 0, events: 0 };
    p.tokens += e.totalTokens;
    p.costUsd += e.costUsd;
    p.events += 1;
    providers.set(e.provider, p);
    const key = `${e.provider}/${e.model}`;
    const m = models.get(key) ?? { provider: e.provider, model: e.model, tokens: 0, costUsd: 0, events: 0 };
    m.tokens += e.totalTokens;
    m.costUsd += e.costUsd;
    m.events += 1;
    models.set(key, m);
  }
  summary.costUsd = Math.round(summary.costUsd * 1_000_000) / 1_000_000;
  summary.byProvider = [...providers.entries()]
    .map(([provider, v]) => ({ provider, ...v, costUsd: Math.round(v.costUsd * 1_000_000) / 1_000_000 }))
    .sort((a, b) => b.costUsd - a.costUsd);
  summary.byModel = [...models.values()]
    .map((v) => ({ ...v, costUsd: Math.round(v.costUsd * 1_000_000) / 1_000_000 }))
    .sort((a, b) => b.costUsd - a.costUsd);
  return summary;
}
