/**
 * Model-agnostic runtime planner (roadmap Phase 2 item 9).
 *
 * Turns an explicit model selection + declarative, validated policy + vault
 * credentials into a bounded attempt chain. It never invents endpoints or
 * keys, never accepts model output as authority, and defaults to blocking
 * cross-provider and local→remote fallback (prompt/attachment containment).
 */

import {
  getProvider, isProviderId, isValidProviderCredential, providerAuthMode,
  modelCapabilities, isReasoningModel, modelSupportsTools, modelSupportsStreaming,
  type ProviderId, type ProviderModel,
} from "./providers";
import { validateProviderEndpoint, endpointAllowsLocal } from "./provider-endpoints";
import {
  listRuntimeModelPolicies, listRuntimeProviderConfigs,
  type RuntimeCapability,
} from "./runtime-config";
import { getRoutingRecommendationPolicy, type RoutingPolicy } from "./improvement";

export type RuntimeVault =
  | Record<string, string | {
    key?: string;
    apiKey?: string;
    connected?: boolean;
    endpoint?: string;
    models?: ProviderModel[];
  } | undefined>
  | null
  | undefined;

export type RuntimeCandidateSource = "request" | "policy" | "durable" | "discovered" | "catalog";

export interface RuntimeCandidate {
  provider: ProviderId;
  model: string;
  endpoint?: string;
  /** Kept server-side only — never serialize a RuntimePlan to the client. */
  apiKey?: string;
  source: RuntimeCandidateSource;
  local: boolean;
  capabilities: RuntimeCapability[];
}

export interface RuntimePlanInput {
  uid: string;
  requested: { provider: ProviderId; model: string };
  vault: RuntimeVault;
  taskClass: string;
  requirements?: RuntimeCapability[];
  /** Replays/divergence keep the original model and skip steering entirely. */
  skipPolicy?: boolean;
  freeModels?: string[];
  policy?: RoutingPolicy | null;
  planner?: Record<string, unknown> | null;
  /** Server policy (never a client field): allow loopback/private endpoints. */
  allowLocal?: boolean;
}

export interface RuntimePlan {
  taskClass: string;
  primary: RuntimeCandidate;
  fallbacks: RuntimeCandidate[];
  attempts: RuntimeCandidate[];
  maxAttempts: number;
  allowCrossProviderFallback: boolean;
  allowLocalToRemoteFallback: boolean;
  reason: string;
  /** Human-readable reasons candidates were skipped. Contains no secrets. */
  blocked: string[];
}

interface RawCandidate {
  provider: ProviderId;
  model: string;
  source: RuntimeCandidateSource;
}

function clipModel(value: unknown): string {
  return String(value ?? "").trim().slice(0, 200).replace(/[^\w./:+\-]/g, "");
}

function capabilitiesFor(provider: ProviderId, model: string, dynamic?: ProviderModel[]): RuntimeCapability[] {
  const caps = modelCapabilities(provider, model, dynamic);
  const out: RuntimeCapability[] = [];
  if (caps.image) out.push("image");
  if (caps.video) out.push("video");
  if (caps.vision) out.push("vision");
  if (isReasoningModel(model, dynamic)) out.push("reasoning");
  if (modelSupportsTools(provider, model, dynamic)) out.push("tools");
  if (modelSupportsStreaming(model, dynamic)) out.push("streaming");
  if (getProvider(provider)?.localOnly) out.push("local");
  return out;
}

interface VaultAccess {
  apiKey: string;
  endpoint?: string;
  models?: ProviderModel[];
  usable: boolean;
  reason?: string;
}

function vaultAccess(vault: RuntimeVault, provider: ProviderId, allowLocal: boolean): VaultAccess {
  const entry = vault?.[provider];
  const rawKey = typeof entry === "string"
    ? entry
    : typeof entry === "object" && entry
      ? (typeof entry.key === "string" ? entry.key : typeof entry.apiKey === "string" ? entry.apiKey : "")
      : "";
  const cfg = getProvider(provider);
  // Strip the non-secret vault sentinel for `auth: "none"` runtimes so no
  // bogus Bearer header is ever sent to a local model server.
  const apiKey = providerAuthMode(cfg) === "none"
    ? ""
    : typeof rawKey === "string" ? rawKey.trim() : "";
  if (!isValidProviderCredential(provider, apiKey)) {
    return { apiKey: "", usable: false, reason: `${provider}: credentials do not satisfy the provider auth policy` };
  }
  const rawEndpoint = entry && typeof entry === "object" && typeof entry.endpoint === "string" ? entry.endpoint.trim() : "";
  let endpoint: string | undefined;
  if (rawEndpoint) {
    const result = validateProviderEndpoint(rawEndpoint, { allowLocal });
    if (!result.ok) return { apiKey: "", usable: false, reason: `${provider}: ${result.error}` };
    endpoint = result.url;
  }
  if (cfg?.endpointRequired && !endpoint) {
    return { apiKey: "", usable: false, reason: `${provider}: configure an endpoint in the Providers Vault first` };
  }
  const models = entry && typeof entry === "object" && Array.isArray(entry.models) ? entry.models : undefined;
  return { apiKey, endpoint, models, usable: true };
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
}

export async function buildRuntimePlan(input: RuntimePlanInput): Promise<RuntimePlan> {
  const { uid, taskClass } = input;
  if (!isProviderId(input.requested.provider)) {
    throw new Error(`Unknown provider ${String(input.requested.provider)}`);
  }
  const requestedModel = clipModel(input.requested.model);
  if (!requestedModel) throw new Error("A model is required");
  const allowLocal = input.allowLocal ?? endpointAllowsLocal();
  const requirements = (input.requirements ?? []).slice(0, 7);
  const skipPolicy = input.skipPolicy === true;
  const planner = input.planner ?? null;
  const policy = input.policy !== undefined
    ? input.policy
    : skipPolicy ? null : await getRoutingRecommendationPolicy(uid, taskClass).catch(() => null);

  const [configs, durablePolicies] = await Promise.all([
    listRuntimeProviderConfigs(uid).catch(() => []),
    listRuntimeModelPolicies(uid).catch(() => []),
  ]);
  // Only rows explicitly marked disabled block a provider; an empty config
  // table means "use the catalog as-is" so existing installs keep working.
  const disabledProviders = new Set(configs.filter((c) => !c.enabled).map((c) => c.provider));
  const configPriority = new Map(configs.map((c) => [c.provider, c.priority]));
  const relevantPolicies = durablePolicies
    .filter((p) => p.enabled && p.taskClass === taskClass)
    .sort((a, b) => b.priority - a.priority);

  const preferLocal = (policy?.preferLocal ?? planner?.preferLocal) === true;
  const allowCrossProviderFallback = (policy?.allowCrossProviderFallback ?? planner?.allowCrossProviderFallback) === true;
  const allowLocalToRemoteFallback = (policy?.allowLocalToRemoteFallback ?? planner?.allowLocalToRemoteFallback) === true;
  // A replay/divergence run must use exactly the originally recorded model —
  // no policy steering and no model swapping, even on quota errors.
  const maxAttempts = skipPolicy
    ? 1
    : boundedInt(policy?.maxAttempts ?? planner?.maxRuntimeAttempts ?? relevantPolicies[0]?.maxAttempts, 3, 1, 4);

  // Priority order: explicit user choice → merged routing policy (an explicit,
  // validated decision) → durable per-task policies → discovered free models →
  // static catalog models. Model text never appears in this list.
  const raw: RawCandidate[] = [
    { provider: input.requested.provider, model: requestedModel, source: "request" },
  ];
  if (!skipPolicy) {
    if (policy) {
      raw.push({ provider: policy.provider, model: policy.model, source: "policy" });
      for (const fb of policy.fallbacks) raw.push({ provider: fb.provider, model: fb.model, source: "policy" });
    }
    for (const p of relevantPolicies) {
      // A durable policy with explicit requirements only applies to runs that
      // actually ask for those capabilities.
      if (!p.requiredCapabilities.every((c) => requirements.includes(c))) continue;
      raw.push({ provider: p.provider, model: p.model, source: "durable" });
      for (const fb of p.fallbacks) raw.push({ provider: fb.provider, model: fb.model, source: "durable" });
    }
    const primaryProvider = raw[0].provider;
    const entry = input.vault?.[primaryProvider];
    const dynamic = entry && typeof entry === "object" && Array.isArray(entry.models) ? entry.models : undefined;
    const clientFree = Array.isArray(input.freeModels)
      ? input.freeModels.filter((id): id is string => typeof id === "string" && !!id).map(clipModel).filter(Boolean)
      : [];
    const staticFree = (getProvider(primaryProvider)?.models ?? [])
      .filter((m) => m.free === true || m.id.endsWith(":free") || m.local === true)
      .map((m) => m.id);
    for (const model of [...new Set([...clientFree, ...(dynamic || []).filter((m) => m.free).map((m) => m.id), ...staticFree])]) {
      raw.push({ provider: primaryProvider, model, source: "discovered" });
    }
    for (const m of getProvider(primaryProvider)?.models ?? []) {
      raw.push({ provider: primaryProvider, model: m.id, source: "catalog" });
    }
  }

  const blocked: string[] = [];
  const seen = new Set<string>();
  const usable: RuntimeCandidate[] = [];
  for (const item of raw) {
    const key = `${item.provider}:${item.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isProviderId(item.provider) || disabledProviders.has(item.provider)) {
      blocked.push(`${key}: provider unavailable`);
      continue;
    }
    const access = vaultAccess(input.vault, item.provider, allowLocal);
    if (!access.usable) {
      blocked.push(access.reason || `${key}: unusable`);
      continue;
    }
    const local = getProvider(item.provider)?.localOnly === true;
    const capabilities = capabilitiesFor(item.provider, item.model, access.models);
    const missing = requirements.filter((r) => !capabilities.includes(r));
    // The explicit user choice is never blocked by capability hints — the app
    // degrades gracefully (text-only attachments, no tool calls, etc.). Only
    // automatically-selected fallbacks must satisfy the requirements.
    if (missing.length && item.source !== "request") {
      blocked.push(`${key}: missing ${missing.join(",")}`);
      continue;
    }
    usable.push({
      provider: item.provider,
      model: item.model,
      endpoint: access.endpoint,
      apiKey: access.apiKey,
      source: item.source,
      local,
      capabilities,
    });
  }

  // Keep local candidates first when local preference is enabled, but always
  // preserve the explicit request as the first attempt.
  const primary = usable.find((c) => c.source === "request") ?? usable[0];
  if (!primary) {
    throw new Error(blocked[0] || "No usable model candidate — check the provider vault and runtime policy");
  }
  const rest = usable.filter((c) => c !== primary);
  if (preferLocal) rest.sort((a, b) => Number(b.local) - Number(a.local) || (configPriority.get(b.provider) ?? 0) - (configPriority.get(a.provider) ?? 0));

  const fallbacks: RuntimeCandidate[] = [];
  for (const candidate of rest) {
    const crossProvider = candidate.provider !== primary.provider;
    const localToRemote = primary.local && !candidate.local;
    if (crossProvider && !allowCrossProviderFallback) {
      blocked.push(`${candidate.provider}:${candidate.model}: cross-provider fallback is disabled`);
      continue;
    }
    if (localToRemote && !allowLocalToRemoteFallback) {
      blocked.push(`${candidate.provider}:${candidate.model}: local→remote fallback is disabled`);
      continue;
    }
    fallbacks.push(candidate);
  }

  return {
    taskClass,
    primary,
    fallbacks,
    attempts: [primary, ...fallbacks].slice(0, maxAttempts),
    maxAttempts,
    allowCrossProviderFallback,
    allowLocalToRemoteFallback,
    reason: skipPolicy
      ? "requested model only (replay/divergence)"
      : policy
        ? `requested model + merged routing policy for ${taskClass}`
        : `requested model + catalog/discovered fallbacks for ${taskClass}`,
    blocked: blocked.slice(0, 20),
  };
}
