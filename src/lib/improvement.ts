/**
 * Self-improvement core loop for roadmap Phase 2 item 7.
 *
 * Execute → Record → Analyze → Synthesize → Propose Improvement → Validate →
 * Merge → Genome++. This module deliberately reuses traces, usage, runtime and
 * genome records instead of inventing a second source of truth. Everything it
 * writes is bounded, user-scoped and declarative: prompt instructions, JSON
 * tool specs, model routing preferences or allowlisted config patches. It never
 * stores or evaluates executable code.
 */

import { ensureFoundationSchema, getChatDb, type D1Like } from "./d1";
import {
  MAX_SKILL_BODY_CHARS,
  isImprovementPatternStatus,
  isImprovementProposalStatus,
  isImprovementProposalType,
  type ExecutionEvent,
  type ExecutionRun,
  type ImprovementConfigRecord,
  type ImprovementCycleResult,
  type ImprovementFindingSeverity,
  type ImprovementPattern,
  type ImprovementProposal,
  type ImprovementProposalType,
  type ImprovementValidation,
  type ModelPreference,
  type PostMortemFinding,
  type PostMortemMetrics,
  type PostMortemRecord,
  type VerificationCheck,
} from "./foundation";

interface PostMortemRow {
  id: string;
  uid: string;
  run_id: string;
  kind: string;
  status: string;
  prompt: string;
  task_class: string;
  summary: string;
  findings: string;
  metrics: string;
  signals: string;
  created_at: string;
}

interface PatternRow {
  id: string;
  uid: string;
  key: string;
  title: string;
  description: string;
  task_class: string;
  pain: string;
  occurrences: number | string;
  run_ids: string;
  avg_cost_usd: number | string;
  avg_latency_ms: number | string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ProposalRow {
  id: string;
  uid: string;
  type: string;
  status: string;
  title: string;
  rationale: string;
  evidence: string;
  payload: string;
  validation: string;
  pattern_id: string | null;
  skill_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PreferenceRow {
  id: string;
  uid: string;
  run_id: string;
  task_class: string;
  provider: string;
  model: string;
  outcome: string;
  score: number | string;
  tokens: number | string;
  cost_usd: number | string;
  latency_ms: number | string;
  created_at: string;
}

interface ConfigRow {
  id: string;
  uid: string;
  key: string;
  value: string;
  proposal_id: string | null;
  updated_at: string;
}

interface UsageLike {
  id: string;
  uid: string;
  runId: string | null;
  provider: string;
  model: string;
  totalTokens: number;
  costUsd: number;
  latencyMs: number | null;
}

interface TaskLike {
  id: string;
  runId: string;
  status: string;
  error: string | null;
}

interface CandidateStat {
  taskClass: string;
  provider: string;
  model: string;
  samples: number;
  successes: number;
  avgScore: number;
  avgCostUsd: number;
  avgLatencyMs: number;
}

const EMPTY_VALIDATION: ImprovementValidation = { passed: false, checks: [], validatedAt: null };

const ARCHITECTURE_ALLOWLIST: Record<string, Record<string, "boolean" | "number" | "string">> = {
  "architecture.scheduler": {
    maxConcurrency: "number",
    preferShortTasks: "boolean",
    priorityWeight: "number",
  },
  "architecture.memory-indexer": {
    maxItems: "number",
    minScore: "number",
    hybridWeight: "number",
  },
  "architecture.planner": {
    preVerifyModelCapacity: "boolean",
    fallbackAfterAttempts: "number",
    verifierRequired: "boolean",
  },
};

const DANGEROUS_CODE = /\b(eval|new Function|child_process|require\(|import\(|process\.env|globalThis|Function\(|setTimeout\(|setInterval\()\b/i;

async function foundationDb(): Promise<D1Like | null> {
  const db = await getChatDb();
  if (!db) return null;
  await ensureFoundationSchema(db);
  return db;
}

function clip(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function number(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function parseObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseArray(raw: string | null): unknown[] {
  try {
    const value = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function parseStringArray(raw: string | null): string[] {
  return parseArray(raw).filter((value): value is string => typeof value === "string");
}

function parseFindings(raw: string | null): PostMortemFinding[] {
  const severities: ImprovementFindingSeverity[] = ["info", "warning", "critical"];
  return parseArray(raw).flatMap((item): PostMortemFinding[] => {
    if (!item || typeof item !== "object") return [];
    const f = item as Record<string, unknown>;
    const evidence = f.evidence && typeof f.evidence === "object" && !Array.isArray(f.evidence)
      ? f.evidence as Record<string, unknown>
      : undefined;
    return [{
      code: clip(f.code, 80) || "finding",
      severity: severities.includes(f.severity as ImprovementFindingSeverity)
        ? f.severity as ImprovementFindingSeverity
        : "info",
      detail: clip(f.detail, 600),
      ...(evidence ? { evidence } : {}),
    }];
  });
}

function parseChecks(raw: unknown): VerificationCheck[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): VerificationCheck[] => {
    if (!item || typeof item !== "object") return [];
    const c = item as Record<string, unknown>;
    return [{
      name: clip(c.name, 100) || "check",
      passed: !!c.passed,
      ...(typeof c.detail === "string" ? { detail: clip(c.detail, 400) } : {}),
    }];
  });
}

function parseValidation(raw: string | null): ImprovementValidation {
  const value = parseObject(raw);
  return {
    passed: !!value.passed,
    checks: parseChecks(value.checks),
    validatedAt: typeof value.validatedAt === "string" ? value.validatedAt : null,
  };
}

function mapPostMortem(r: PostMortemRow): PostMortemRecord {
  const rawMetrics = parseObject(r.metrics);
  const rawSignals = parseObject(r.signals);
  const metrics: PostMortemMetrics = {
    durationMs: Math.max(0, number(rawMetrics.durationMs)),
    eventCount: Math.max(0, number(rawMetrics.eventCount)),
    errorCount: Math.max(0, number(rawMetrics.errorCount)),
    fallbackCount: Math.max(0, number(rawMetrics.fallbackCount)),
    retryCount: Math.max(0, number(rawMetrics.retryCount)),
    toolCalls: Math.max(0, number(rawMetrics.toolCalls)),
    verifierFailures: Math.max(0, number(rawMetrics.verifierFailures)),
    memoryRecalls: Math.max(0, number(rawMetrics.memoryRecalls)),
    tokens: Math.max(0, number(rawMetrics.tokens)),
    costUsd: roundCost(Math.max(0, number(rawMetrics.costUsd))),
    success: !!rawMetrics.success,
  };
  return {
    id: r.id,
    uid: r.uid,
    runId: r.run_id,
    kind: (r.kind || "chat") as ExecutionRun["kind"],
    status: (r.status || "running") as ExecutionRun["status"],
    prompt: r.prompt ?? "",
    taskClass: r.task_class || "general",
    summary: r.summary ?? "",
    findings: parseFindings(r.findings),
    metrics,
    signals: rawSignals,
    createdAt: r.created_at,
  };
}

function mapPattern(r: PatternRow): ImprovementPattern {
  return {
    id: r.id,
    uid: r.uid,
    key: r.key,
    title: r.title,
    description: r.description ?? "",
    taskClass: r.task_class,
    pain: r.pain,
    occurrences: Math.max(1, number(r.occurrences, 1)),
    runIds: parseStringArray(r.run_ids),
    avgCostUsd: roundCost(Math.max(0, number(r.avg_cost_usd))),
    avgLatencyMs: Math.max(0, number(r.avg_latency_ms)),
    status: isImprovementPatternStatus(r.status) ? r.status : "open",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapProposal(r: ProposalRow): ImprovementProposal {
  return {
    id: r.id,
    uid: r.uid,
    type: isImprovementProposalType(r.type) ? r.type : "skill",
    status: isImprovementProposalStatus(r.status) ? r.status : "proposed",
    title: r.title,
    rationale: r.rationale ?? "",
    evidence: parseObject(r.evidence),
    payload: parseObject(r.payload),
    validation: parseValidation(r.validation),
    patternId: r.pattern_id ?? null,
    skillId: r.skill_id ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapPreference(r: PreferenceRow): ModelPreference {
  return {
    id: r.id,
    uid: r.uid,
    runId: r.run_id,
    taskClass: r.task_class,
    provider: r.provider,
    model: r.model,
    outcome: r.outcome === "success" ? "success" : "failure",
    score: clamp(number(r.score), 0, 1),
    tokens: Math.max(0, number(r.tokens)),
    costUsd: roundCost(Math.max(0, number(r.cost_usd))),
    latencyMs: Math.max(0, number(r.latency_ms)),
    createdAt: r.created_at,
  };
}

function mapConfig(r: ConfigRow): ImprovementConfigRecord {
  return {
    id: r.id,
    uid: r.uid,
    key: r.key,
    value: parseObject(r.value),
    proposalId: r.proposal_id ?? null,
    updatedAt: r.updated_at,
  };
}

function configId(uid: string, key: string): string {
  return `cfg_${hash(`${uid}:${key}`)}`;
}

/** Stable, low-cardinality label used for pattern mining and routing preference. */
export function classifyTask(prompt: string, mode?: string | null): string {
  const text = String(prompt ?? "").toLowerCase();
  const m = String(mode ?? "").toLowerCase();
  if (["image", "video", "terminal", "skill", "workforce"].includes(m)) return m;
  if (m === "coding" || /\b(code|coding|bug|debug|refactor|function|component|typescript|javascript|python|api|database|sql|build|test)\b/.test(text)) return "code";
  if (m === "research" || m === "search" || /\b(research|source|citation|compare|investigate|literature|evidence)\b/.test(text)) return "research";
  if (m === "plan" || /\b(plan|roadmap|strategy|milestone| phased|timeline|owner)\b/.test(text)) return "planning";
  if (m === "chat" && text.length < 80) return "chat";
  if (/\b(write|draft|essay|summary|rewrite|email|article|story)\b/.test(text)) return "writing";
  return "general";
}

function metricsFrom(events: ExecutionEvent[], usage: UsageLike[], run: ExecutionRun): PostMortemMetrics {
  const started = Date.parse(run.startedAt);
  const ended = run.endedAt ? Date.parse(run.endedAt) : 0;
  const lastEvent = events.reduce((max, e) => Math.max(max, Date.parse(e.createdAt) || 0), 0);
  const durationMs = Math.max(0, (Number.isFinite(ended) && ended ? ended : lastEvent || Date.now()) - (Number.isFinite(started) ? started : Date.now()));

  let errorCount = events.filter((e) => /(^|\.)(failed|error|rejected|blocked)$/i.test(e.type)).length;
  if (run.error) errorCount += 1;
  const fallbackCount = events.filter((e) => /fallback|switch|retry/i.test(e.type)).length;
  const retryCount = events.reduce((n, e) => {
    const attempt = number((e.payload as Record<string, unknown>).attempt, 0);
    return n + (/retry/i.test(e.type) || attempt > 0 ? 1 : 0);
  }, 0);
  const toolCalls = events.reduce((n, e) => {
    const payload = e.payload as Record<string, unknown>;
    const direct = Array.isArray(payload.toolCalls) ? payload.toolCalls.length : 0;
    return n + (/tool/i.test(e.type) ? 1 : 0) + direct;
  }, 0);
  const verifierFailures = events.filter((e) => {
    const payload = e.payload as Record<string, unknown>;
    return /verif|consensus|check/i.test(e.type) && (payload.passed === false || /fail|reject/i.test(String(payload.status ?? "")));
  }).length;
  const memoryRecalls = events.reduce((n, e) => {
    if (!/memory\.recall/i.test(e.type)) return n;
    return n + Math.max(1, number((e.payload as Record<string, unknown>).count, 1));
  }, 0);
  const tokens = usage.reduce((n, e) => n + Math.max(0, e.totalTokens), 0);
  const costUsd = usage.reduce((n, e) => n + Math.max(0, e.costUsd), 0);

  return {
    durationMs: Math.round(durationMs),
    eventCount: events.length,
    errorCount,
    fallbackCount,
    retryCount,
    toolCalls,
    verifierFailures,
    memoryRecalls,
    tokens,
    costUsd: roundCost(costUsd),
    success: run.status === "completed" && !run.error,
  };
}

function findingsFor(metrics: PostMortemMetrics, tasks: TaskLike[]): PostMortemFinding[] {
  const findings: PostMortemFinding[] = [];
  if (metrics.success) {
    findings.push({ code: "task-completed", severity: "info", detail: "Run reached a completed state without a recorded fatal error." });
  } else {
    findings.push({ code: "execution-failed", severity: "critical", detail: "Run ended without success; inspect the error and failure events before reusing this path." });
  }
  if (metrics.errorCount > 1) {
    findings.push({ code: "repeated-failures", severity: "critical", detail: `${metrics.errorCount} failure/error events were recorded in one run.`, evidence: { count: metrics.errorCount } });
  }
  if (metrics.fallbackCount >= 2) {
    findings.push({ code: "model-fallback-loop", severity: "warning", detail: `${metrics.fallbackCount} model fallbacks were needed — routing is probing the wrong model first.`, evidence: { count: metrics.fallbackCount } });
  } else if (metrics.fallbackCount === 1) {
    findings.push({ code: "model-fallback", severity: "info", detail: "One model fallback occurred; keep the replacement as a routing candidate.", evidence: { count: 1 } });
  }
  if (metrics.retryCount >= 2) {
    findings.push({ code: "retry-heavy", severity: "warning", detail: `${metrics.retryCount} attempts were needed for a single task.`, evidence: { count: metrics.retryCount } });
  }
  if (metrics.durationMs > 30_000) {
    findings.push({ code: "slow-run", severity: "warning", detail: `Run took ${Math.round(metrics.durationMs / 1000)}s; scheduler or planner tuning may help.`, evidence: { durationMs: metrics.durationMs } });
  }
  if (metrics.costUsd > 0.05) {
    findings.push({ code: "high-cost", severity: "warning", detail: `Run cost $${metrics.costUsd.toFixed(4)}; prefer a cheaper validated model for this task class.`, evidence: { costUsd: metrics.costUsd } });
  }
  if (metrics.verifierFailures > 0) {
    findings.push({ code: "verification-failures", severity: "warning", detail: `${metrics.verifierFailures} verifier/consensus check(s) failed.`, evidence: { count: metrics.verifierFailures } });
  }
  if (metrics.memoryRecalls >= 6) {
    findings.push({ code: "memory-heavy", severity: "info", detail: `${metrics.memoryRecalls} memory items were recalled; narrower indexing may reduce context noise.`, evidence: { count: metrics.memoryRecalls } });
  }
  if (metrics.toolCalls > 4) {
    findings.push({ code: "tool-heavy", severity: "info", detail: `${metrics.toolCalls} tool interactions were recorded — a reusable workflow may be emerging.`, evidence: { count: metrics.toolCalls } });
  }
  const failedTasks = tasks.filter((t) => t.status === "failed" || t.status === "preempted");
  if (failedTasks.length) {
    findings.push({ code: "agent-task-failed", severity: "critical", detail: `${failedTasks.length} agent task(s) failed or were preempted.`, evidence: { taskIds: failedTasks.map((t) => t.id).slice(0, 8), error: clip(failedTasks[0]?.error, 300) } });
  }
  return findings.slice(0, 12);
}

async function usageForRun(db: D1Like, uid: string, runId: string): Promise<UsageLike[]> {
  const { results } = await db
    .prepare("SELECT id, uid, run_id, provider, model, total_tokens, cost_usd, latency_ms, created_at FROM usage_events WHERE run_id = ?1")
    .bind(runId)
    .all<Record<string, unknown>>();
  return results.filter((r) => r.uid === uid).map((r) => ({
    id: String(r.id ?? ""),
    uid,
    runId: String(r.run_id ?? runId),
    provider: String(r.provider ?? "unknown"),
    model: String(r.model ?? "unknown"),
    totalTokens: number(r.total_tokens),
    costUsd: number(r.cost_usd),
    latencyMs: r.latency_ms == null ? null : number(r.latency_ms),
  })).slice(0, 100);
}

async function tasksForRun(db: D1Like, uid: string, runId: string): Promise<TaskLike[]> {
  const { results } = await db
    .prepare("SELECT id, uid, run_id, status, error FROM agent_tasks WHERE run_id = ?1")
    .bind(runId)
    .all<Record<string, unknown>>();
  return results.filter((r) => r.uid === uid).map((r) => ({
    id: String(r.id ?? ""),
    runId,
    status: String(r.status ?? "queued"),
    error: r.error == null ? null : String(r.error),
  })).slice(0, 50);
}

const POSTMORTEM_UPSERT = `INSERT INTO improvement_postmortems
  (id, uid, run_id, kind, status, prompt, task_class, summary, findings, metrics, signals, created_at)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
  ON CONFLICT(id) DO UPDATE SET
    status = excluded.status, summary = excluded.summary, findings = excluded.findings,
    metrics = excluded.metrics, signals = excluded.signals`;

const PREFERENCE_UPSERT = `INSERT INTO model_preferences
  (id, uid, run_id, task_class, provider, model, outcome, score, tokens, cost_usd, latency_ms, created_at)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
  ON CONFLICT(id) DO UPDATE SET
    outcome = excluded.outcome, score = excluded.score, tokens = excluded.tokens,
    cost_usd = excluded.cost_usd, latency_ms = excluded.latency_ms`;

/** Record (idempotently) one automatic post-mortem and its model preference data. */
export async function recordPostMortem(input: {
  run: ExecutionRun;
  events: ExecutionEvent[];
}): Promise<PostMortemRecord | null> {
  const db = await foundationDb();
  if (!db) return null;
  const { run, events } = input;
  const [usage, tasks] = await Promise.all([
    usageForRun(db, run.uid, run.id),
    tasksForRun(db, run.uid, run.id),
  ]);
  const metrics = metricsFrom(events, usage, run);
  const findings = findingsFor(metrics, tasks);
  const taskClass = classifyTask(run.prompt, run.mode);
  const headline = findings.find((f) => f.severity === "critical")
    ?? findings.find((f) => f.severity === "warning")
    ?? findings[0];
  const record: PostMortemRecord = {
    id: `pm_${run.id}`.slice(0, 180),
    uid: run.uid,
    runId: run.id,
    kind: run.kind,
    status: run.status,
    prompt: clip(run.prompt, 2_000),
    taskClass,
    summary: `${run.status === "completed" ? "Completed" : "Unsuccessful"} ${taskClass} run in ${Math.round(metrics.durationMs / 1000)}s — ${headline?.detail ?? "no findings"}`,
    findings,
    metrics,
    signals: {
      provider: run.provider,
      model: run.model,
      mode: run.mode,
      eventTypes: Object.fromEntries(events.reduce((map, e) => {
        map.set(e.type, (map.get(e.type) ?? 0) + 1);
        return map;
      }, new Map<string, number>())),
      fallbackModels: events.flatMap((e) => {
        const payload = e.payload as Record<string, unknown>;
        return typeof payload.to === "string" ? [payload.to] : [];
      }).slice(0, 8),
      agentTasks: tasks.length,
    },
    createdAt: new Date().toISOString(),
  };

  await db.prepare(POSTMORTEM_UPSERT).bind(
    record.id, record.uid, record.runId, record.kind, record.status, record.prompt,
    record.taskClass, record.summary, JSON.stringify(record.findings),
    JSON.stringify(record.metrics), JSON.stringify(record.signals), record.createdAt,
  ).run();

  const sources = usage.length
    ? usage
    : [{
      id: run.id, uid: run.uid, runId: run.id,
      provider: run.provider ?? "unknown", model: run.model ?? "unknown",
      totalTokens: metrics.tokens, costUsd: metrics.costUsd, latencyMs: metrics.durationMs,
    }];
  for (const [index, item] of sources.slice(0, 20).entries()) {
    const latencyPenalty = clamp(number(item.latencyMs) / 600_000, 0, 0.15);
    const costPenalty = clamp(number(item.costUsd) / 0.1, 0, 0.25);
    const score = metrics.success
      ? clamp(1 - latencyPenalty - costPenalty, 0.35, 1)
      : 0.05;
    const now = new Date().toISOString();
    await db.prepare(PREFERENCE_UPSERT).bind(
      `pref_${hash(`${run.id}:${item.provider}:${item.model}:${index}`)}`,
      run.uid, run.id, record.taskClass, item.provider, item.model,
      metrics.success ? "success" : "failure", Math.round(score * 1000) / 1000,
      Math.max(0, item.totalTokens), roundCost(Math.max(0, item.costUsd)),
      Math.max(0, number(item.latencyMs)), now,
    ).run();
  }
  return record;
}

export async function listPostMortems(uid: string, limit = 100): Promise<PostMortemRecord[]> {
  const db = await foundationDb();
  if (!db) return [];
  const { results } = await db
    .prepare("SELECT * FROM improvement_postmortems WHERE uid = ?1 ORDER BY created_at DESC")
    .bind(uid)
    .all<PostMortemRow>();
  return results.filter((r) => r.uid === uid).slice(0, clamp(limit, 1, 500)).map(mapPostMortem);
}

export async function listPatterns(uid: string, limit = 100): Promise<ImprovementPattern[]> {
  const db = await foundationDb();
  if (!db) return [];
  const { results } = await db
    .prepare("SELECT * FROM improvement_patterns WHERE uid = ?1 ORDER BY updated_at DESC")
    .bind(uid)
    .all<PatternRow>();
  return results.filter((r) => r.uid === uid).slice(0, clamp(limit, 1, 500)).map(mapPattern);
}

export async function listProposals(uid: string, limit = 100): Promise<ImprovementProposal[]> {
  const db = await foundationDb();
  if (!db) return [];
  const { results } = await db
    .prepare("SELECT * FROM improvement_proposals WHERE uid = ?1 ORDER BY updated_at DESC")
    .bind(uid)
    .all<ProposalRow>();
  return results.filter((r) => r.uid === uid).slice(0, clamp(limit, 1, 500)).map(mapProposal);
}

export async function listModelPreferences(uid: string, limit = 200): Promise<ModelPreference[]> {
  const db = await foundationDb();
  if (!db) return [];
  const { results } = await db
    .prepare("SELECT * FROM model_preferences WHERE uid = ?1 ORDER BY created_at DESC")
    .bind(uid)
    .all<PreferenceRow>();
  return results.filter((r) => r.uid === uid).slice(0, clamp(limit, 1, 500)).map(mapPreference);
}

export async function listImprovementConfig(uid: string): Promise<ImprovementConfigRecord[]> {
  const db = await foundationDb();
  if (!db) return [];
  const { results } = await db
    .prepare("SELECT * FROM improvement_config WHERE uid = ?1 ORDER BY updated_at DESC")
    .bind(uid)
    .all<ConfigRow>();
  return results.filter((r) => r.uid === uid).map(mapConfig);
}

function painOf(pm: PostMortemRecord): string {
  const codes = new Set(pm.findings.map((f) => f.code));
  if (codes.has("execution-failed") || codes.has("repeated-failures") || codes.has("agent-task-failed")) return "reliability";
  if (codes.has("model-fallback-loop") || codes.has("model-fallback")) return "routing";
  if (codes.has("verification-failures")) return "verification";
  if (codes.has("slow-run")) return "latency";
  if (codes.has("high-cost")) return "cost";
  if (codes.has("memory-heavy")) return "context";
  if (codes.has("tool-heavy") && pm.metrics.success) return "reusable-workflow";
  return pm.metrics.success ? "reusable-workflow" : "reliability";
}

const PATTERN_TITLES: Record<string, (taskClass: string) => string> = {
  reliability: (t) => `Reduce failures in ${t} runs`,
  routing: (t) => `Route ${t} tasks to a steadier model`,
  verification: (t) => `Add a verification gate to ${t} runs`,
  latency: (t) => `Speed up ${t} runs`,
  cost: (t) => `Lower the cost of ${t} runs`,
  context: (t) => `Narrow memory context for ${t} runs`,
  "reusable-workflow": (t) => `Reusable ${t} workflow`,
};

const PATTERN_UPSERT = `INSERT INTO improvement_patterns
  (id, uid, key, title, description, task_class, pain, occurrences, run_ids,
   avg_cost_usd, avg_latency_ms, status, created_at, updated_at)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title, description = excluded.description,
    occurrences = excluded.occurrences, run_ids = excluded.run_ids,
    avg_cost_usd = excluded.avg_cost_usd, avg_latency_ms = excluded.avg_latency_ms,
    updated_at = excluded.updated_at`;

/** Analyze retrospectives and promote repeated signals into durable patterns. */
export async function minePatterns(uid: string, minOccurrences = 2): Promise<ImprovementPattern[]> {
  const db = await foundationDb();
  if (!db) return [];
  const postmortems = await listPostMortems(uid, 500);
  const threshold = clamp(Math.floor(minOccurrences) || 2, 1, 25);
  const groups = new Map<string, { taskClass: string; pain: string; items: PostMortemRecord[] }>();
  for (const pm of postmortems) {
    const pain = painOf(pm);
    const key = `${pm.taskClass}:${pain}`;
    const group = groups.get(key) ?? { taskClass: pm.taskClass, pain, items: [] };
    group.items.push(pm);
    groups.set(key, group);
  }

  const now = new Date().toISOString();
  const patterns: ImprovementPattern[] = [];
  for (const [key, group] of groups) {
    if (group.items.length < threshold) continue;
    const id = `pat_${hash(`${uid}:${key}`)}`;
    const existing = await db.prepare("SELECT * FROM improvement_patterns WHERE id = ?1").bind(id).first<PatternRow>();
    const avgLatencyMs = Math.round(group.items.reduce((n, pm) => n + pm.metrics.durationMs, 0) / group.items.length);
    const avgCostUsd = roundCost(group.items.reduce((n, pm) => n + pm.metrics.costUsd, 0) / group.items.length);
    const title = (PATTERN_TITLES[group.pain] ?? ((t: string) => `Improve ${t} runs`))(group.taskClass);
    const pattern: ImprovementPattern = {
      id,
      uid,
      key,
      title,
      description: `Mined from ${group.items.length} ${group.taskClass} run(s) with the same ${group.pain} signal. Average latency ${Math.round(avgLatencyMs / 1000)}s and cost $${avgCostUsd.toFixed(4)}.`,
      taskClass: group.taskClass,
      pain: group.pain,
      occurrences: group.items.length,
      runIds: group.items.map((pm) => pm.runId).slice(0, 30),
      avgCostUsd,
      avgLatencyMs,
      status: existing && isImprovementPatternStatus(existing.status) ? existing.status : "open",
      createdAt: existing?.created_at ?? now,
      updatedAt: now,
    };
    await db.prepare(PATTERN_UPSERT).bind(
      pattern.id, pattern.uid, pattern.key, pattern.title, pattern.description,
      pattern.taskClass, pattern.pain, pattern.occurrences, JSON.stringify(pattern.runIds),
      pattern.avgCostUsd, pattern.avgLatencyMs, pattern.status,
      pattern.createdAt, pattern.updatedAt,
    ).run();
    patterns.push(pattern);
  }
  return patterns;
}

function candidateStats(preferences: ModelPreference[]): CandidateStat[] {
  const groups = new Map<string, CandidateStat>();
  for (const pref of preferences) {
    const key = `${pref.taskClass}:${pref.provider}:${pref.model}`;
    const stat = groups.get(key) ?? {
      taskClass: pref.taskClass,
      provider: pref.provider,
      model: pref.model,
      samples: 0,
      successes: 0,
      avgScore: 0,
      avgCostUsd: 0,
      avgLatencyMs: 0,
    };
    stat.samples += 1;
    stat.successes += pref.outcome === "success" ? 1 : 0;
    stat.avgScore += pref.score;
    stat.avgCostUsd += pref.costUsd;
    stat.avgLatencyMs += pref.latencyMs;
    groups.set(key, stat);
  }
  return [...groups.values()].map((s) => ({
    ...s,
    avgScore: Math.round((s.avgScore / s.samples) * 1000) / 1000,
    avgCostUsd: roundCost(s.avgCostUsd / s.samples),
    avgLatencyMs: Math.round(s.avgLatencyMs / s.samples),
  }));
}

function skillBody(pattern: ImprovementPattern): string {
  return [
    "## Purpose",
    `${pattern.description} Reuse only the parts that still apply to the current request.`,
    "",
    "## When to use",
    `- The task class is "${pattern.taskClass}".`,
    `- The same ${pattern.pain} signal has appeared ${pattern.occurrences} times in measured runs.`,
    "",
    "## Operating rules",
    "1. Restate the requested outcome, constraints and definition of done.",
    "2. Pick the smallest approach that satisfies those constraints; state the tradeoff in one line.",
    "3. Work from verified artifacts, not from assumed inputs. Ask for missing required inputs.",
    "4. Run the built-in verification checklist before returning a final artifact.",
    "5. If a step fails, report the failing check, the evidence and the next action instead of hiding it.",
    "",
    "## Verification checklist",
    "- The final artifact directly answers the original request.",
    "- All stated constraints and required sections are present.",
    "- Any assumptions and remaining risks are explicit.",
    "",
    "## Provenance",
    `Mined automatically by the MEDUSA self-improvement loop from runs: ${pattern.runIds.join(", ")}.`,
  ].join("\n").slice(0, MAX_SKILL_BODY_CHARS);
}

function architectureConfigFor(pattern: ImprovementPattern): { key: string; value: Record<string, unknown> } | null {
  if (pattern.pain === "latency") {
    return { key: "architecture.scheduler", value: { maxConcurrency: 2, preferShortTasks: true, priorityWeight: 0.7 } };
  }
  if (pattern.pain === "routing" || pattern.pain === "reliability") {
    return { key: "architecture.planner", value: { preVerifyModelCapacity: true, fallbackAfterAttempts: 1, verifierRequired: true } };
  }
  if (pattern.pain === "context") {
    return { key: "architecture.memory-indexer", value: { maxItems: 4, minScore: 1, hybridWeight: 0.6 } };
  }
  return null;
}

const PROPOSAL_UPSERT = `INSERT INTO improvement_proposals
  (id, uid, type, status, title, rationale, evidence, payload, validation,
   pattern_id, skill_id, created_at, updated_at)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title, rationale = excluded.rationale, evidence = excluded.evidence,
    payload = excluded.payload, validation = excluded.validation,
    status = excluded.status, skill_id = excluded.skill_id,
    updated_at = excluded.updated_at`;

async function saveProposal(uid: string, proposal: ImprovementProposal): Promise<ImprovementProposal> {
  const db = await foundationDb();
  if (db) {
    await db.prepare(PROPOSAL_UPSERT).bind(
      proposal.id, proposal.uid, proposal.type, proposal.status, proposal.title,
      proposal.rationale, JSON.stringify(proposal.evidence), JSON.stringify(proposal.payload),
      JSON.stringify(proposal.validation), proposal.patternId, proposal.skillId,
      proposal.createdAt, proposal.updatedAt,
    ).run();
  }
  return proposal;
}

async function getProposal(uid: string, id: string): Promise<ImprovementProposal | null> {
  const db = await foundationDb();
  if (!db) return null;
  const row = await db.prepare("SELECT * FROM improvement_proposals WHERE id = ?1").bind(id).first<ProposalRow>();
  return row && row.uid === uid ? mapProposal(row) : null;
}

/** Synthesize skill, routing and declarative architecture proposals from evidence. */
export async function synthesizeProposals(uid: string): Promise<ImprovementProposal[]> {
  const db = await foundationDb();
  if (!db) return [];
  const [patterns, preferences, existing] = await Promise.all([
    listPatterns(uid, 200),
    listModelPreferences(uid, 500),
    listProposals(uid, 500),
  ]);
  const existingById = new Map(existing.map((p) => [p.id, p]));
  const now = new Date().toISOString();
  const created: ImprovementProposal[] = [];

  function pushProposal(input: {
    type: ImprovementProposalType;
    key: string;
    title: string;
    rationale: string;
    evidence: Record<string, unknown>;
    payload: Record<string, unknown>;
    patternId?: string | null;
  }): void {
    const id = `imp_${hash(`${uid}:${input.type}:${input.key}`)}`;
    const prior = existingById.get(id);
    if (prior && prior.status !== "proposed") return;
    const proposal: ImprovementProposal = {
      id,
      uid,
      type: input.type,
      status: "proposed",
      title: input.title,
      rationale: input.rationale,
      evidence: input.evidence,
      payload: input.payload,
      validation: prior?.validation ?? EMPTY_VALIDATION,
      patternId: input.patternId ?? null,
      skillId: prior?.skillId ?? null,
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
    };
    existingById.set(id, proposal);
    created.push(proposal);
  }

  for (const pattern of patterns.filter((p) => p.status !== "merged")) {
    const evidence = {
      patternId: pattern.id,
      taskClass: pattern.taskClass,
      pain: pattern.pain,
      occurrences: pattern.occurrences,
      runIds: pattern.runIds,
      avgCostUsd: pattern.avgCostUsd,
      avgLatencyMs: pattern.avgLatencyMs,
    };
    const body = skillBody(pattern);
    pushProposal({
      type: "skill",
      key: pattern.id,
      title: pattern.title,
      rationale: `Turn the repeated ${pattern.pain} signal into a reusable prompt skill instead of solving it from scratch again.`,
      evidence,
      payload: {
        name: `Reusable ${pattern.taskClass} workflow`,
        description: pattern.description.slice(0, 400),
        kind: "prompt",
        body,
        tests: [{
          name: "Workflow produces a checked artifact",
          input: `Apply this ${pattern.taskClass} workflow to a representative request and return the finished artifact with its verification checklist.`,
          expectContains: [],
          maxChars: 12_000,
        }],
        dna: {
          preconditions: ["Task is within the user's authority and has a clear desired outcome"],
          postconditions: ["A finished artifact is returned", "Verification checklist results are stated"],
          sideEffects: ["none"],
          tags: ["self-improvement", pattern.taskClass, pattern.pain],
          trustScore: clamp(0.45 + pattern.occurrences * 0.05, 0.45, 0.85),
        },
      },
      patternId: pattern.id,
    });

    const config = architectureConfigFor(pattern);
    if (config) {
      pushProposal({
        type: "architecture",
        key: `${pattern.id}:${config.key}`,
        title: `Tune ${config.key.replace("architecture.", "")} for ${pattern.taskClass}`,
        rationale: `Measured ${pattern.pain} bottleneck across ${pattern.occurrences} run(s); apply a declarative, allowlisted config patch.`,
        evidence,
        payload: { key: config.key, value: config.value },
        patternId: pattern.id,
      });
    }
  }

  const stats = candidateStats(preferences);
  const byTask = new Map<string, CandidateStat[]>();
  for (const stat of stats) {
    const list = byTask.get(stat.taskClass) ?? [];
    list.push(stat);
    byTask.set(stat.taskClass, list);
  }
  for (const [taskClass, candidates] of byTask) {
    if (candidates.length < 2) continue;
    const ranked = [...candidates].sort((a, b) =>
      b.avgScore - a.avgScore || a.avgCostUsd - b.avgCostUsd || a.avgLatencyMs - b.avgLatencyMs);
    const best = ranked[0];
    const runnerUp = ranked[1];
    if (best.avgScore <= runnerUp.avgScore && best.avgCostUsd >= runnerUp.avgCostUsd) continue;
    pushProposal({
      type: "routing",
      key: taskClass,
      title: `Route ${taskClass} tasks to ${best.provider}/${best.model}`,
      rationale: `Preference data shows a better measured outcome for this model than the current alternatives.`,
      evidence: { taskClass, ranked: ranked.slice(0, 8), sampleSize: best.samples },
      payload: {
        taskClass,
        provider: best.provider,
        model: best.model,
        autoApply: true,
        avgScore: best.avgScore,
        avgCostUsd: best.avgCostUsd,
        avgLatencyMs: best.avgLatencyMs,
        sampleSize: best.samples,
      },
    });
  }

  const saved: ImprovementProposal[] = [];
  for (const proposal of created) saved.push(await saveProposal(uid, proposal));
  return saved;
}

function validateArchitecturePayload(payload: Record<string, unknown>): VerificationCheck[] {
  const key = typeof payload.key === "string" ? payload.key : "";
  const value = payload.value && typeof payload.value === "object" && !Array.isArray(payload.value)
    ? payload.value as Record<string, unknown>
    : {};
  const allowed = ARCHITECTURE_ALLOWLIST[key];
  const checks: VerificationCheck[] = [
    { name: "known-target", passed: !!allowed, detail: allowed ? undefined : `Unknown config key ${key || "(empty)"}` },
    { name: "declarative-object", passed: !!allowed && Object.keys(value).length > 0 },
  ];
  if (!allowed) return checks;
  for (const [name, entry] of Object.entries(value)) {
    const expected = allowed[name];
    const typeOk = expected === "number"
      ? typeof entry === "number" && Number.isFinite(entry)
      : expected === "boolean"
        ? typeof entry === "boolean"
        : typeof entry === "string";
    checks.push({
      name: `field:${name}`,
      passed: !!typeOk && (typeof entry !== "string" || (!DANGEROUS_CODE.test(entry) && entry.length <= 120)),
    });
  }
  const unknown = Object.keys(value).filter((k) => !allowed[k]);
  checks.push({ name: "allowlist-only", passed: unknown.length === 0, detail: unknown.length ? `Unexpected fields: ${unknown.join(", ")}` : undefined });
  return checks;
}

/** Gate a proposal with deterministic checks. Only passing proposals may merge. */
export async function validateProposal(uid: string, id: string): Promise<ImprovementProposal | null> {
  const proposal = await getProposal(uid, id);
  if (!proposal || proposal.status === "merged" || proposal.status === "rejected") return proposal;
  let checks: VerificationCheck[] = [
    { name: "title", passed: proposal.title.trim().length >= 6 },
    { name: "rationale", passed: proposal.rationale.trim().length >= 20 },
  ];

  if (proposal.type === "skill") {
    const body = typeof proposal.payload.body === "string" ? proposal.payload.body : "";
    const tests = Array.isArray(proposal.payload.tests) ? proposal.payload.tests : [];
    checks = [
      ...checks,
      { name: "name", passed: typeof proposal.payload.name === "string" && proposal.payload.name.trim().length >= 4 },
      { name: "prompt-body", passed: body.trim().length >= 80 && body.length <= MAX_SKILL_BODY_CHARS },
      { name: "has-test", passed: tests.length >= 1 },
      { name: "no-code", passed: !DANGEROUS_CODE.test(body) },
    ];
  } else if (proposal.type === "routing") {
    const p = proposal.payload;
    checks = [
      ...checks,
      { name: "task-class", passed: typeof p.taskClass === "string" && p.taskClass.trim().length >= 2 },
      { name: "provider-model", passed: typeof p.provider === "string" && typeof p.model === "string" && !!p.provider && !!p.model },
      { name: "evidence", passed: number(p.sampleSize) >= 1 && number(p.avgScore) > 0 },
    ];
  } else {
    checks = [...checks, ...validateArchitecturePayload(proposal.payload)];
  }

  const validatedAt = new Date().toISOString();
  const validation: ImprovementValidation = {
    passed: checks.every((c) => c.passed),
    checks,
    validatedAt,
  };
  const updated: ImprovementProposal = {
    ...proposal,
    status: validation.passed ? "validated" : "proposed",
    validation,
    updatedAt: validatedAt,
  };
  return saveProposal(uid, updated);
}

async function upsertConfig(uid: string, key: string, value: Record<string, unknown>, proposalId: string): Promise<ImprovementConfigRecord> {
  const db = await foundationDb();
  const record: ImprovementConfigRecord = {
    id: configId(uid, key),
    uid,
    key,
    value,
    proposalId,
    updatedAt: new Date().toISOString(),
  };
  if (db) {
    await db.prepare(`INSERT INTO improvement_config
      (id, uid, key, value, proposal_id, updated_at)
      VALUES (?1,?2,?3,?4,?5,?6)
      ON CONFLICT(id) DO UPDATE SET
        value = excluded.value, proposal_id = excluded.proposal_id, updated_at = excluded.updated_at`)
      .bind(record.id, record.uid, record.key, JSON.stringify(record.value), record.proposalId, record.updatedAt)
      .run();
  }
  return record;
}

async function markPatternMerged(uid: string, patternId: string | null): Promise<void> {
  if (!patternId) return;
  const db = await foundationDb();
  if (!db) return;
  const row = await db.prepare("SELECT * FROM improvement_patterns WHERE id = ?1").bind(patternId).first<PatternRow>();
  if (!row || row.uid !== uid) return;
  const pattern = mapPattern(row);
  await db.prepare("UPDATE improvement_patterns SET status = ?1, updated_at = ?2 WHERE id = ?3")
    .bind("merged", new Date().toISOString(), pattern.id)
    .run()
    .catch(() => null);
}

/** Merge a validated proposal. Skill proposals become candidate genome entries. */
export async function mergeProposal(uid: string, id: string): Promise<ImprovementProposal | null> {
  const proposal = await getProposal(uid, id);
  if (!proposal) return null;
  if (proposal.status === "merged") return proposal;
  if (!proposal.validation.passed) throw new Error("Proposal must pass validation before merging");

  let skillId = proposal.skillId;
  if (proposal.type === "skill" && !skillId) {
    const payload = proposal.payload;
    // Dynamic import keeps traces → improvement → skill-genome → traces from
    // becoming a static module cycle at load time.
    const { createSkillGenome } = await import("./skill-genome");
    const skill = await createSkillGenome({
      uid,
      name: String(payload.name ?? proposal.title),
      description: typeof payload.description === "string" ? payload.description : proposal.rationale,
      kind: typeof payload.kind === "string" && payload.kind === "tool" ? "tool" : "prompt",
      body: String(payload.body ?? ""),
      dna: payload.dna && typeof payload.dna === "object" && !Array.isArray(payload.dna)
        ? payload.dna as never
        : null,
      tests: Array.isArray(payload.tests) ? payload.tests as never : null,
      familyId: proposal.patternId ? `imp-${proposal.patternId}` : null,
      parentIds: proposal.patternId ? [proposal.patternId] : null,
      operator: "import",
      status: "candidate",
    });
    skillId = skill.id;
  }

  if (proposal.type === "routing") {
    const taskClass = clip(proposal.payload.taskClass, 80);
    await upsertConfig(uid, `routing.${taskClass}`, {
      provider: clip(proposal.payload.provider, 80),
      model: clip(proposal.payload.model, 160),
      autoApply: proposal.payload.autoApply !== false,
      avgScore: number(proposal.payload.avgScore),
      sampleSize: number(proposal.payload.sampleSize),
      sourceProposalId: proposal.id,
    }, proposal.id);
  }
  if (proposal.type === "architecture") {
    const key = clip(proposal.payload.key, 120);
    if (!ARCHITECTURE_ALLOWLIST[key]) throw new Error("Architecture target is not in the allowlist");
    const value = proposal.payload.value && typeof proposal.payload.value === "object" && !Array.isArray(proposal.payload.value)
      ? proposal.payload.value as Record<string, unknown>
      : {};
    await upsertConfig(uid, key, value, proposal.id);
  }

  const updated: ImprovementProposal = {
    ...proposal,
    status: "merged",
    skillId: skillId ?? null,
    updatedAt: new Date().toISOString(),
  };
  const saved = await saveProposal(uid, updated);
  await markPatternMerged(uid, proposal.patternId);
  return saved;
}

export async function rejectProposal(uid: string, id: string): Promise<ImprovementProposal | null> {
  const proposal = await getProposal(uid, id);
  if (!proposal || proposal.status === "merged") return proposal;
  return saveProposal(uid, { ...proposal, status: "rejected", updatedAt: new Date().toISOString() });
}

/** Read a merged config value. Unknown/invalid values degrade to null. */
export async function getImprovementConfigValue(uid: string, key: string): Promise<Record<string, unknown> | null> {
  const db = await foundationDb();
  if (!db) return null;
  const row = await db.prepare("SELECT * FROM improvement_config WHERE id = ?1").bind(configId(uid, key)).first<ConfigRow>();
  if (!row || row.uid !== uid) return null;
  return parseObject(row.value);
}

export async function getRoutingRecommendation(uid: string, taskClass: string): Promise<{ provider: string; model: string } | null> {
  const value = await getImprovementConfigValue(uid, `routing.${taskClass}`).catch(() => null);
  if (!value || value.autoApply === false) return null;
  const provider = typeof value.provider === "string" ? value.provider : "";
  const model = typeof value.model === "string" ? value.model : "";
  return provider && model ? { provider, model } : null;
}

/** One full Execute → … → Genome++ pass over existing records. */
export async function runImprovementCycle(uid: string, options: { minOccurrences?: number; autoMerge?: boolean } = {}): Promise<ImprovementCycleResult> {
  const autoMerge = !!options.autoMerge;
  const [postmortems, patterns] = await Promise.all([
    listPostMortems(uid, 500),
    minePatterns(uid, options.minOccurrences ?? 2),
  ]);
  const rawProposals = await synthesizeProposals(uid);
  const proposals: ImprovementProposal[] = [];
  let validated = 0;
  let merged = 0;
  for (const raw of rawProposals) {
    const validatedProposal = await validateProposal(uid, raw.id) ?? raw;
    if (validatedProposal.validation.passed) validated += 1;
    proposals.push(validatedProposal);
    if (autoMerge && validatedProposal.validation.passed) {
      const mergedProposal = await mergeProposal(uid, validatedProposal.id);
      if (mergedProposal?.status === "merged") {
        merged += 1;
        proposals[proposals.length - 1] = mergedProposal;
      }
    }
  }
  return {
    postmortems: postmortems.length,
    patterns: patterns.length,
    proposals,
    validated,
    merged,
    autoMerge,
  };
}

/** Snapshot consumed by the /improvement page and its API. */
export async function listImprovementState(uid: string) {
  const [postmortems, patterns, proposals, preferences, config] = await Promise.all([
    listPostMortems(uid, 120),
    listPatterns(uid, 120),
    listProposals(uid, 120),
    listModelPreferences(uid, 200),
    listImprovementConfig(uid),
  ]);
  return { postmortems, patterns, proposals, preferences, config };
}
