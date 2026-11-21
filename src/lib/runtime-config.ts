/**
 * Durable runtime-router policy. Declarative and user-scoped only:
 * - no API keys, secrets, or raw endpoint URLs (endpoints stay in the vault);
 * - no executable code or model-authored authority;
 * - full-row upserts and single-predicate reads so the dev JSON shim works.
 */

import { ensureFoundationSchema, getChatDb, type D1Like } from "./d1";
import { getProvider, isProviderId, providerAuthMode, providerKind, type ProviderId } from "./providers";
import { fingerprintEndpoint } from "./provider-endpoints";

export const RUNTIME_CAPABILITIES = ["vision", "tools", "streaming", "reasoning", "local", "image", "video"] as const;
export type RuntimeCapability = (typeof RUNTIME_CAPABILITIES)[number];

const MAX_MODEL_ID = 200;
const MAX_TASK_CLASS = 80;

export const isRuntimeCapability = (value: unknown): value is RuntimeCapability =>
  typeof value === "string" && (RUNTIME_CAPABILITIES as readonly string[]).includes(value);

export interface RuntimeProviderConfig {
  id: string;
  uid: string;
  provider: ProviderId;
  providerKind: string;
  authMode: string;
  enabled: boolean;
  priority: number;
  endpointPolicy: "catalog" | "custom";
  healthStatus: string;
  healthCheckedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderConfigInput {
  provider: ProviderId;
  enabled?: boolean;
  priority?: number;
  endpointPolicy?: "catalog" | "custom";
  metadata?: Record<string, unknown>;
}

export interface RuntimeModelPolicy {
  id: string;
  uid: string;
  taskClass: string;
  provider: ProviderId;
  model: string;
  enabled: boolean;
  priority: number;
  requiredCapabilities: RuntimeCapability[];
  fallbacks: { provider: ProviderId; model: string }[];
  maxAttempts: number;
  localOnly: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ModelPolicyInput {
  taskClass: string;
  provider: ProviderId;
  model: string;
  enabled?: boolean;
  priority?: number;
  requiredCapabilities?: unknown;
  fallbacks?: unknown;
  maxAttempts?: number;
  localOnly?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RuntimeHealthCheck {
  id: string;
  uid: string;
  provider: ProviderId;
  model: string;
  endpointFingerprint: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
}

interface Row {
  id: string;
  uid: string;
  provider: string;
  provider_kind: string;
  auth_mode: string;
  enabled: number | string;
  priority: number | string;
  endpoint_policy: string;
  health_status: string;
  health_checked_at: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
  task_class?: string;
  model?: string;
  required_capabilities?: string | null;
  fallback_json?: string | null;
  max_attempts?: number | string;
  local_only?: number | string;
  endpoint_fingerprint?: string;
  ok?: number | string;
  status_code?: number | string | null;
  latency_ms?: number | string | null;
  error?: string | null;
  checked_at?: string;
}

async function db(): Promise<D1Like | null> {
  const handle = await getChatDb();
  if (!handle) return null;
  await ensureFoundationSchema(handle);
  return handle;
}

function clip(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** Only primitive values; never accept nested/executable metadata. */
function safeMetadata(value: unknown): Record<string, unknown> {
  const raw = parseObject(value);
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(raw).slice(0, 8)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(key)) continue;
    if (typeof item === "string") out[key] = clip(item, 200);
    else if (typeof item === "number" && Number.isFinite(item)) out[key] = item;
    else if (typeof item === "boolean") out[key] = item;
  }
  return out;
}

const safeModelId = (value: unknown): string =>
  clip(value, MAX_MODEL_ID).replace(/[^\w./:+\-]/g, "");

const safeTaskClass = (value: unknown): string =>
  clip(value, MAX_TASK_CLASS).replace(/[^\w-]/g, "") || "general";

const providerConfigId = (uid: string, provider: ProviderId): string =>
  `rpc_${uid}:${provider}`;

const modelPolicyId = (uid: string, taskClass: string, provider: ProviderId, model: string): string =>
  `rpm_${uid}:${taskClass}:${provider}:${model}`;

/* ------------------------------------------------------- provider config --- */

function mapProviderRow(r: Row): RuntimeProviderConfig {
  return {
    id: r.id,
    uid: r.uid,
    provider: isProviderId(r.provider) ? r.provider : "custom-openai",
    providerKind: r.provider_kind,
    authMode: r.auth_mode,
    enabled: Number(r.enabled) === 1,
    priority: Number(r.priority) || 0,
    endpointPolicy: r.endpoint_policy === "custom" ? "custom" : "catalog",
    healthStatus: r.health_status || "unknown",
    healthCheckedAt: r.health_checked_at || null,
    metadata: parseObject(r.metadata),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function saveRuntimeProviderConfig(uid: string, input: ProviderConfigInput): Promise<RuntimeProviderConfig | null> {
  if (!isProviderId(input.provider)) throw new Error("Unknown provider");
  const handle = await db();
  if (!handle) return null;
  const cfg = getProvider(input.provider);
  const now = new Date().toISOString();
  const existing = (await handle
    .prepare("SELECT * FROM runtime_provider_config WHERE id = ?1")
    .bind(providerConfigId(uid, input.provider))
    .first<Row>()) ?? null;
  const row: RuntimeProviderConfig = {
    id: providerConfigId(uid, input.provider),
    uid,
    provider: input.provider,
    providerKind: providerKind(cfg),
    authMode: providerAuthMode(cfg),
    enabled: input.enabled !== false,
    priority: num(input.priority, 0, -100, 100),
    endpointPolicy: input.endpointPolicy === "custom" ? "custom" : "catalog",
    healthStatus: existing?.health_status ?? "unknown",
    healthCheckedAt: existing?.health_checked_at ?? null,
    metadata: safeMetadata(input.metadata),
    createdAt: existing?.created_at ?? now,
    updatedAt: now,
  };
  await handle
    .prepare(`INSERT INTO runtime_provider_config
      (id, uid, provider, provider_kind, auth_mode, enabled, priority, endpoint_policy,
       health_status, health_checked_at, metadata, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`)
    .bind(
      row.id, row.uid, row.provider, row.providerKind, row.authMode,
      row.enabled ? 1 : 0, row.priority, row.endpointPolicy, row.healthStatus,
      row.healthCheckedAt, JSON.stringify(row.metadata), row.createdAt, row.updatedAt,
    )
    .run();
  return row;
}

export async function listRuntimeProviderConfigs(uid: string): Promise<RuntimeProviderConfig[]> {
  const handle = await db();
  if (!handle) return [];
  const { results } = await handle
    .prepare("SELECT * FROM runtime_provider_config WHERE uid = ?1")
    .bind(uid)
    .all<Row>();
  return results.map(mapProviderRow).filter((r) => r.uid === uid).sort((a, b) => b.priority - a.priority);
}

/* ---------------------------------------------------------- model policy --- */

function mapPolicyRow(r: Row): RuntimeModelPolicy {
  let fallbacks: { provider: ProviderId; model: string }[] = [];
  try {
    const parsed: unknown = JSON.parse(r.fallback_json || "[]");
    if (Array.isArray(parsed)) {
      fallbacks = parsed.flatMap((item): { provider: ProviderId; model: string }[] => {
        if (!item || typeof item !== "object") return [];
        const f = item as Record<string, unknown>;
        if (!isProviderId(f.provider)) return [];
        const model = safeModelId(f.model);
        return model ? [{ provider: f.provider, model }] : [];
      }).slice(0, 4);
    }
  } catch { /* keep empty */ }
  let capabilities: RuntimeCapability[] = [];
  try {
    const parsed: unknown = JSON.parse(r.required_capabilities || "[]");
    if (Array.isArray(parsed)) capabilities = parsed.filter(isRuntimeCapability).slice(0, 7);
  } catch { /* keep empty */ }
  return {
    id: r.id,
    uid: r.uid,
    taskClass: r.task_class || "general",
    provider: isProviderId(r.provider) ? r.provider : "custom-openai",
    model: r.model || "",
    enabled: Number(r.enabled) === 1,
    priority: Number(r.priority) || 0,
    requiredCapabilities: capabilities,
    fallbacks,
    maxAttempts: num(r.max_attempts, 3, 1, 4),
    localOnly: Number(r.local_only) === 1,
    metadata: parseObject(r.metadata),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function saveRuntimeModelPolicy(uid: string, input: ModelPolicyInput): Promise<RuntimeModelPolicy | null> {
  if (!isProviderId(input.provider)) throw new Error("Unknown provider");
  const model = safeModelId(input.model);
  if (!model) throw new Error("Model is required");
  const handle = await db();
  if (!handle) return null;
  const taskClass = safeTaskClass(input.taskClass);
  const now = new Date().toISOString();
  const id = modelPolicyId(uid, taskClass, input.provider, model);
  const existing = (await handle.prepare("SELECT * FROM runtime_model_policy WHERE id = ?1").bind(id).first<Row>()) ?? null;

  const capabilities = Array.isArray(input.requiredCapabilities)
    ? input.requiredCapabilities.filter(isRuntimeCapability).slice(0, 7)
    : [];
  const fallbacks = Array.isArray(input.fallbacks)
    ? input.fallbacks.flatMap((item): { provider: ProviderId; model: string }[] => {
      if (!item || typeof item !== "object") return [];
      const f = item as Record<string, unknown>;
      if (!isProviderId(f.provider)) return [];
      const fbModel = safeModelId(f.model);
      return fbModel ? [{ provider: f.provider, model: fbModel }] : [];
    }).slice(0, 4)
    : [];
  const row: RuntimeModelPolicy = {
    id,
    uid,
    taskClass,
    provider: input.provider,
    model,
    enabled: input.enabled !== false,
    priority: num(input.priority, 0, -100, 100),
    requiredCapabilities: capabilities,
    fallbacks,
    maxAttempts: num(input.maxAttempts, 3, 1, 4),
    localOnly: input.localOnly === true,
    metadata: safeMetadata(input.metadata),
    createdAt: existing?.created_at ?? now,
    updatedAt: now,
  };
  await handle
    .prepare(`INSERT INTO runtime_model_policy
      (id, uid, task_class, provider, model, enabled, priority, required_capabilities,
       fallback_json, max_attempts, local_only, metadata, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`)
    .bind(
      row.id, row.uid, row.taskClass, row.provider, row.model, row.enabled ? 1 : 0,
      row.priority, JSON.stringify(row.requiredCapabilities), JSON.stringify(row.fallbacks),
      row.maxAttempts, row.localOnly ? 1 : 0, JSON.stringify(row.metadata), row.createdAt, row.updatedAt,
    )
    .run();
  return row;
}

export async function listRuntimeModelPolicies(uid: string): Promise<RuntimeModelPolicy[]> {
  const handle = await db();
  if (!handle) return [];
  const { results } = await handle
    .prepare("SELECT * FROM runtime_model_policy WHERE uid = ?1")
    .bind(uid)
    .all<Row>();
  return results
    .map(mapPolicyRow)
    .filter((r) => r.uid === uid)
    .sort((a, b) => a.taskClass.localeCompare(b.taskClass) || b.priority - a.priority);
}

export async function deleteRuntimeModelPolicy(uid: string, id: string): Promise<boolean> {
  const handle = await db();
  if (!handle) return false;
  const row = await handle.prepare("SELECT * FROM runtime_model_policy WHERE id = ?1").bind(clip(id, 300)).first<Row>();
  if (!row || row.uid !== uid) return false;
  await handle.prepare("DELETE FROM runtime_model_policy WHERE id = ?1").bind(row.id).run();
  return true;
}

/* ---------------------------------------------------------- health checks --- */

export async function recordRuntimeHealthCheck(
  uid: string,
  input: {
    provider: ProviderId;
    model?: string;
    endpoint?: string;
    ok: boolean;
    statusCode?: number | null;
    latencyMs?: number | null;
    error?: string | null;
  },
): Promise<RuntimeHealthCheck | null> {
  if (!isProviderId(input.provider)) return null;
  const handle = await db();
  if (!handle) return null;
  const now = new Date().toISOString();
  const row: RuntimeHealthCheck = {
    id: `rhc_${uid}:${input.provider}:${now}:${Math.random().toString(36).slice(2, 8)}`,
    uid,
    provider: input.provider,
    model: safeModelId(input.model).slice(0, MAX_MODEL_ID),
    endpointFingerprint: fingerprintEndpoint(input.endpoint),
    ok: !!input.ok,
    statusCode: Number.isFinite(input.statusCode) ? num(input.statusCode, 0, 0, 599) : null,
    latencyMs: Number.isFinite(input.latencyMs) ? num(input.latencyMs, 0, 0, 600_000) : null,
    error: input.error ? clip(input.error, 400) : null,
    checkedAt: now,
  };
  await handle
    .prepare(`INSERT INTO runtime_health_checks
      (id, uid, provider, model, endpoint_fingerprint, ok, status_code, latency_ms, error, checked_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
    .bind(
      row.id, row.uid, row.provider, row.model, row.endpointFingerprint,
      row.ok ? 1 : 0, row.statusCode, row.latencyMs, row.error, row.checkedAt,
    )
    .run();

  const existing = await listRuntimeHealthChecks(uid);
  for (const stale of existing.slice(40)) {
    await handle.prepare("DELETE FROM runtime_health_checks WHERE id = ?1").bind(stale.id).run().catch(() => null);
  }
  return row;
}

export async function listRuntimeHealthChecks(uid: string): Promise<RuntimeHealthCheck[]> {
  const handle = await db();
  if (!handle) return [];
  const { results } = await handle
    .prepare("SELECT * FROM runtime_health_checks WHERE uid = ?1")
    .bind(uid)
    .all<Row>();
  return results
    .filter((r) => r.uid === uid && isProviderId(r.provider))
    .map((r) => ({
      id: r.id,
      uid: r.uid,
      provider: r.provider as ProviderId,
      model: r.model || "",
      endpointFingerprint: r.endpoint_fingerprint || "",
      ok: Number(r.ok) === 1,
      statusCode: r.status_code == null ? null : Number(r.status_code),
      latencyMs: r.latency_ms == null ? null : Number(r.latency_ms),
      error: r.error || null,
      checkedAt: r.checked_at || "",
    }))
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
}
