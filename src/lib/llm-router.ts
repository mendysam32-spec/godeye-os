import { PROVIDERS, CAPABLE_MODELS_RE, isValidApiKey, type ProviderId, type ProviderModel } from "./providers";
import {
  asParts, budgetParts, flattenText, isBinaryPart,
  openAIParts, anthropicParts, googleParts, cohereParts,
  type MessageContent,
} from "./content";

export type ChatRole = "system" | "user" | "assistant" | "tool";
export interface ChatMessage {
  role: ChatRole;
  /** plain string, or typed parts (text / image / document) for multimodal turns */
  content: MessageContent;
  tool_calls?: { id: string; type?: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface LLMCall {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
  reasoningEffort?: "off" | "low" | "medium" | "high" | "extra-high";
  /** request a real upstream token stream; deltas are pushed to `onDelta` */
  stream?: boolean;
  onDelta?: (text: string) => void;
  /** aborts the upstream request (client hung up) */
  signal?: AbortSignal;
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type LLMUsage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };

export interface LLMResult {
  provider: ProviderId;
  model: string;
  content: string;
  usage?: LLMUsage;
  latencyMs: number;
  toolCalls?: ToolCallResult[];
  /** true when the provider had to be called without streaming or binary parts */
  degraded?: boolean;
  /** which capability the provider rejected, so callers can explain the fallback */
  degradedReason?: "stream" | "parts";
}

function providerConfig(provider: ProviderId) {
  const p = PROVIDERS.find(x => x.id === provider);
  if (!p) throw new Error(`Unknown provider ${provider}`);
  return p;
}

// OpenAI-style tools ({type:"function", function:{name, description, parameters}})
// as passed by the API route from MEDUSA_TOOLS. Providers that speak their own
// tool format translate them below.
interface WireTool { type?: string; function?: { name?: string; description?: string; parameters?: unknown } }
function wireTools(tools?: unknown[]): WireTool[] {
  if (!Array.isArray(tools)) return [];
  return tools.filter((t): t is WireTool => !!t && typeof t === "object");
}
function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  try {
    const p = JSON.parse(String(raw ?? "{}"));
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

// ------------------------------------------------------------- stream plumbing

/** Parse a `text/event-stream` body into parsed `data:` payloads. Tolerates
 *  comment lines, multi-line frames and partial chunks at the buffer edge.
 *
 *  Frames stay opaque here on purpose: every provider ships a different JSON
 *  shape and each consumer below narrows the fields it actually needs. Typing
 *  this as `Record<string, unknown>` would push a cast into all five call
 *  sites and buy no safety. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function* sseEvents(res: Response): AsyncGenerator<any> {
  const body = res.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const raw of frame.split("\n")) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            yield JSON.parse(payload);
          } catch {
            /* keep-alive / non-JSON frame */
          }
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/** Providers that omit usage on streamed replies still need a number for the
 *  per-user token limit. ~4 chars/token is close enough for accounting. */
function estimateUsage(prompt: MessageContent[], completion: string): LLMUsage | undefined {
  if (!completion) return undefined;
  const promptChars = prompt.reduce((n, m) => n + flattenText(m).length, 0);
  const completionTokens = Math.max(1, Math.ceil(completion.length / 4));
  const promptTokens = Math.ceil(promptChars / 4);
  return { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens };
}

/** Normalize the per-provider usage shapes (OpenAI, Anthropic, Gemini, Cohere)
 *  into one shape for the token ledger. Providers spell these differently and
 *  all four arrive as unvalidated JSON, so the input stays wide. */
function normalizeUsage(u: Record<string, unknown> | null | undefined): LLMUsage | undefined {
  if (!u) return undefined;
  const prompt = Number(u.prompt_tokens ?? u.input_tokens ?? 0);
  const completion = Number(u.completion_tokens ?? u.output_tokens ?? 0);
  const total = Number(u.total_tokens ?? prompt + completion);
  if (!prompt && !completion && !total) return undefined;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total };
}

/** `Retry-After` header → milliseconds (seconds form or HTTP-date form). */
function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

/** Quotas that cannot recover inside one request (daily/monthly free caps). */
function isDailyCap(reason: string, waitMs: number | null): boolean {
  if (waitMs !== null && waitMs > 65_000) return true;
  return /(per[- ]day|daily limit|per[- ]month|monthly limit|usage limit for the day)/.test(reason);
}

/** Turn raw rate-limit payloads into a message that tells the user what to do. */
function friendlyRateLimit(provider: string, body: string): string {
  let detail = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const message = typeof parsed.error === "object" && parsed.error !== null ? parsed.error.message : typeof parsed.error === "string" ? parsed.error : parsed.message;
    if (message) detail = message;
  } catch {
    /* keep the raw slice */
  }
  if (isDailyCap(detail.toLowerCase(), null)) {
    return `${provider}: free-tier daily limit reached for this model — try another model, wait for the reset, or add a small credit balance to the provider account. (${detail.slice(0, 240)})`;
  }
  return `${provider}: rate limited — free tiers only allow a few requests per minute. Wait a moment and retry, or switch model. (${detail.slice(0, 240)})`;
}

function hasBinaryContent(messages: ChatMessage[]): boolean {
  return messages.some((m) => asParts(m.content).some(isBinaryPart));
}

// Reasoning effort → provider-native budgets.
// off = no thinking params (fastest). extra-high = max depth for hard tasks.
export function reasoningBudget(effort?: LLMCall["reasoningEffort"]): number | null {
  switch (effort) {
    case "low": return 1024;
    case "medium": return 4096;
    case "high": return 12000;
    case "extra-high": return 24000;
    default: return null;
  }
}

export function reasoningEffortForWire(effort?: LLMCall["reasoningEffort"]): "low" | "medium" | "high" | "xhigh" | null {
  switch (effort) {
    case "low": return "low";
    case "medium": return "medium";
    case "high": return "high";
    case "extra-high": return "xhigh";
    default: return null;
  }
}

// Extra token headroom when thinking deeply — reasoning tokens eat output budget.
export function maxTokensForEffort(base: number, effort?: LLMCall["reasoningEffort"]): number {
  const budget = reasoningBudget(effort) ?? 0;
  return base + budget;
}
// OpenAI-compatible call (covers OpenAI, Nvidia NIM, OpenRouter, OmeRoute, Together, Mistral, Perplexity-ish)
async function callOpenAICompatible(call: LLMCall, apiKey: string, baseUrl: string, overrideBaseUrl?: string): Promise<LLMResult> {
  const t0 = Date.now();
  // NVCF deployment URLs (https://api.nvcf.nvidia.com/v2/nvcf/deployments/functions/{id}/versions/{v})
  // are invoked directly — do NOT append /chat/completions.
  const rawBase = (overrideBaseUrl || baseUrl).replace(/\/+$/, "");
  const isNvcf = /api\.nvcf\.nvidia\.com/.test(rawBase);
  const url = isNvcf ? rawBase : `${rawBase}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  // OpenRouter requires extra headers for ranking
  if (call.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://medusa.sandpgroup.com";
    headers["X-Title"] = "MEDUSA OS";
  }
  // AgentRouter rejects generic clients with `401 unauthorized client detected`.
  // It only serves requests that carry the OpenAI-SDK / Roo Code identity headers.
  if (call.provider === "agentrouter") {
    headers["X-Stainless-OS"] = "Linux";
    headers["X-Stainless-Arch"] = "x64";
    headers["X-Stainless-Lang"] = "js";
    headers["X-Stainless-Runtime"] = "node";
    headers["X-Stainless-Runtime-Version"] = "v22.22.1";
    headers["HTTP-Referer"] = "https://github.com/RooVetGit/Roo-Cline";
    headers["X-Title"] = "Roo Code";
    headers["User-Agent"] = "RooCode/3.53.0";
  }

  const effortWire = reasoningEffortForWire(call.reasoningEffort);
  const budget = reasoningBudget(call.reasoningEffort);
  const isReasoningModel = /(o1|o3|o4|gpt-5|thinking|r1|reason|nemotron|gemini-2\.5|claude-4)/i.test(call.model);

  const toMessage = (m: ChatMessage, textOnly: boolean): Record<string, unknown> => {
    const parts = asParts(m.content);
    const binary = parts.some(isBinaryPart);
    const out: Record<string, unknown> = { role: m.role };
    if (!binary) {
      out.content = typeof m.content === "string" ? m.content : flattenText(m.content);
    } else if (textOnly) {
      out.content = [{ type: "text", text: flattenText(m.content) }];
    } else {
      const wire = openAIParts(budgetParts(parts));
      out.content = wire.length ? wire : flattenText(m.content);
    }
    if (m.tool_calls) out.tool_calls = m.tool_calls;
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    return out;
  };

  const wantedMax = maxTokensForEffort(call.maxTokens ?? 2048, call.reasoningEffort);
  const baseBody = (stream: boolean, textOnly: boolean, maxTokens: number): Record<string, unknown> => ({
    model: call.model,
    messages: call.messages.map((m) => toMessage(m, textOnly)),
    // o-series / reasoning models only accept temperature 1 — omit otherwise
    ...(!isReasoningModel ? { temperature: call.temperature ?? 0.5 } : {}),
    max_tokens: maxTokens,
    ...(call.tools && call.tools.length ? { tools: call.tools, tool_choice: "auto" } : {}),
    // OpenAI o-series + gpt-5 thinking
    ...(effortWire && isReasoningModel ? { reasoning_effort: effortWire === "xhigh" ? "high" : effortWire } : {}),
    // OpenRouter unified reasoning param
    ...(call.provider === "openrouter" && effortWire ? { reasoning: { effort: effortWire === "xhigh" ? "high" : effortWire, exclude: false } } : {}),
    // OmeRoute / Together / NVIDIA DeepSeek-R1 style: higher effort = more tokens
    ...(budget && (call.provider === "omeroute" || call.provider === "together" || call.provider === "nvidia") ? { extra_body: { reasoning_budget: budget } } : {}),
    ...(stream ? { stream: true } : {}),
    // only the gateways that document it — others 400 on the unknown field
    ...(stream && (call.provider === "openai" || call.provider === "openrouter") ? { stream_options: { include_usage: true } } : {}),
  });

  // Many OpenAI-compatible gateways accept neither `stream: true` nor multimodal
  // content arrays. Rather than surfacing a raw 400, degrade one dimension at a
  // time and retry so the answer still lands. Transient failures also get a
  // short retry: free-tier models (OpenRouter free pool) rate-limit aggressively
  // and a single 429 should never kill the whole reply.
  const binary = hasBinaryContent(call.messages);
  let dropStream = false;
  let dropParts = false;
  let tokenShrink: 0 | 1 | 2 = 0; // model rejected max_tokens → retry smaller
  let res: Response | null = null;
  let errText = "";
  let errStatus = 0;
  let rateRetries = 0;
  let serverRetries = 0;
  let networkRetries = 0;

  // Abort-aware backoff sleep, so a cancelled chat never waits out a timer.
  const sleepMs = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (call.signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(() => {
        call.signal?.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      call.signal?.addEventListener("abort", onAbort, { once: true });
    });

  for (let attempt = 0; attempt < 9; attempt++) {
    const streaming = !!call.stream && !dropStream;
    const maxTokens = tokenShrink === 0 ? wantedMax : tokenShrink === 1 ? Math.min(wantedMax, 4096) : Math.min(wantedMax, 2048);
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(baseBody(streaming, dropParts, maxTokens)),
        signal: call.signal,
      });
    } catch (error) {
      if (call.signal?.aborted) throw error;
      errStatus = 0;
      errText = (error as Error)?.message || "network error";
      if (networkRetries < 1) {
        networkRetries++;
        await sleepMs(1500);
        continue;
      }
      throw new Error(`${call.provider}: connection failed — ${errText.slice(0, 200)}`);
    }
    if (res.ok) break;
    errText = await res.text().catch(() => "");
    errStatus = res.status;
    const reason = errText.toLowerCase();

    // Free tiers rate-limit hard (per-minute and daily caps). A short wait and
    // retry rescues per-minute bumps; a daily cap never recovers inside one
    // request, so fail fast with a clear message instead of stalling.
    if (errStatus === 429) {
      const waitMs = retryAfterMs(res.headers.get("retry-after"));
      if (isDailyCap(reason, waitMs)) break;
      if (rateRetries < 2) {
        rateRetries++;
        await sleepMs(Math.min(waitMs ?? rateRetries * 12_000, 60_000));
        continue;
      }
      break;
    }
    // Provider hiccup or capacity error — quick exponential backoff.
    if (errStatus >= 500 && serverRetries < 2) {
      serverRetries++;
      await sleepMs(1200 * serverRetries);
      continue;
    }
    // Only shape-level rejections are worth degrading: a bad key or an
    // exhausted paid quota fails identically every time.
    const shapeError = errStatus === 400 || errStatus === 404 || errStatus === 415 || errStatus === 422;
    if (shapeError && streaming && /stream/.test(reason)) { dropStream = true; continue; }
    if (shapeError && !dropParts && binary && /(content|image|file|multimodal|vision|unsupported|not support|invalid)/.test(reason)) { dropParts = true; continue; }
    // Some models reject large max_tokens outright; retry smaller, twice max.
    if (shapeError && tokenShrink < 2 && /(max_tokens|max tokens|too large|context length)/.test(reason)) {
      tokenShrink = (tokenShrink + 1) as 1 | 2;
      continue;
    }
    break;
  }

  if (!res || !res.ok) {
    if (errStatus === 429) throw new Error(friendlyRateLimit(call.provider, errText));
    throw new Error(`${call.provider} ${errStatus}: ${errText.slice(0, 800)}`);
  }
  const degradedReason: "stream" | "parts" | undefined = dropStream ? "stream" : dropParts ? "parts" : undefined;
  const degraded = degradedReason !== undefined;
  const degradedFields = degraded ? { degraded: true, degradedReason } : {};

  if (call.stream && !dropStream) {
    // --- token streaming ---
    let text = "";
    let usage: LLMUsage | undefined;
    const acc = new Map<number, { id: string; name: string; args: string }>();
    for await (const ev of sseEvents(res)) {
      if (ev?.error) {
        const msg = typeof ev.error === "string" ? ev.error : ev.error?.message || JSON.stringify(ev.error);
        throw new Error(`${call.provider}: ${msg}`);
      }
      if (ev?.usage) usage = normalizeUsage(ev.usage) ?? usage;
      const choice = ev?.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta || choice.message || {};
      const piece = typeof delta.content === "string" ? delta.content : typeof choice.text === "string" ? choice.text : "";
      if (piece) {
        text += piece;
        call.onDelta?.(piece);
      }
      for (const tc of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
        const slot = acc.get(tc.index ?? 0) ?? { id: "", name: "", args: "" };
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name = tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
        acc.set(tc.index ?? 0, slot);
      }
    }
    const toolCalls: ToolCallResult[] | undefined = acc.size
      ? [...acc.values()].filter((t) => t.name).map((t) => ({ id: t.id || `call_${t.name}`, name: t.name, arguments: parseArgs(t.args) }))
      : undefined;
    return {
      provider: call.provider,
      model: call.model,
      content: text,
      usage: usage ?? estimateUsage(call.messages.map((m) => m.content), text),
      latencyMs: Date.now() - t0,
      ...(toolCalls ? { toolCalls } : {}),
      ...degradedFields,
    };
  }

  // --- single-shot response ---
  const json: any = await res.json();
  const message = json.choices?.[0]?.message;
  const content = message?.content ?? json.choices?.[0]?.text ?? "";
  let toolCalls: ToolCallResult[] | undefined;
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length) {
    toolCalls = message.tool_calls.map((tc: { id: string; function?: { name?: string; arguments?: string } }) => {
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(tc.function?.arguments || "{}");
        if (parsed && typeof parsed === "object") args = parsed;
      } catch { /* keep empty */ }
      return { id: tc.id, name: tc.function?.name, arguments: args };
    });
  }
  return {
    provider: call.provider,
    model: call.model,
    content: content ?? "",
    usage: normalizeUsage(json.usage),
    latencyMs: Date.now() - t0,
    ...(toolCalls ? { toolCalls } : {}),
    ...degradedFields,
  };
}

async function callAnthropic(call: LLMCall, apiKey: string): Promise<LLMResult> {
  const t0 = Date.now();
  // Anthropic messages API
  const system = call.messages.filter(m => m.role === "system").map(m => flattenText(m.content)).filter(Boolean).join("\n\n");
  const tools = wireTools(call.tools).map((t) => ({
    name: t.function?.name ?? "",
    description: t.function?.description,
    input_schema: t.function?.parameters ?? { type: "object", properties: {} },
  })).filter((t) => t.name);

  const messages: any[] = [];
  for (const m of call.messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: flattenText(m.content) }] });
    } else if (m.role === "assistant" && m.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: [
          ...(flattenText(m.content) ? [{ type: "text", text: flattenText(m.content) }] : []),
          ...m.tool_calls.map((tc) => ({ type: "tool_use", id: tc.id, name: tc.function?.name ?? "", input: parseArgs(tc.function?.arguments) })),
        ],
      });
    } else {
      // Anthropic rejects an empty content array, so fall back to a string.
      const parts = anthropicParts(budgetParts(asParts(m.content)));
      messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: parts.length ? parts : flattenText(m.content) });
    }
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: call.model,
      max_tokens: maxTokensForEffort(call.maxTokens ?? 2048, call.reasoningEffort),
      system: system || undefined,
      messages,
      ...(() => {
        const budget = reasoningBudget(call.reasoningEffort);
        // Extended thinking needs temperature 1 and a budget < max_tokens
        if (budget) {
          return { thinking: { type: "enabled", budget_tokens: Math.min(budget, (call.maxTokens ?? 2048) + budget - 1000) }, temperature: 1 };
        }
        return { temperature: call.temperature ?? 0.5 };
      })(),
      ...(tools.length ? { tools, tool_choice: { type: "auto" } } : {}),
      ...(call.stream ? { stream: true } : {}),
    }),
    signal: call.signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${txt.slice(0, 800)}`);
  }

  if (call.stream) {
    // message_start → content_block_* deltas → message_delta (usage) → stop
    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    const blocks = new Map<number, { type: string; id: string; name: string; json: string }>();
    for await (const ev of sseEvents(res)) {
      if (ev?.type === "error") throw new Error(`anthropic: ${ev.error?.message || "stream error"}`);
      if (ev?.type === "message_start") {
        inputTokens = ev.message?.usage?.input_tokens ?? 0;
        outputTokens = ev.message?.usage?.output_tokens ?? 0;
      } else if (ev?.type === "content_block_start") {
        const cb = ev.content_block || {};
        blocks.set(ev.index ?? 0, { type: cb.type || "text", id: cb.id || "", name: cb.name || "", json: "" });
      } else if (ev?.type === "content_block_delta") {
        const slot = blocks.get(ev.index ?? 0);
        if (ev.delta?.type === "text_delta" && ev.delta.text) {
          text += ev.delta.text;
          call.onDelta?.(ev.delta.text);
        } else if (ev.delta?.type === "input_json_delta" && slot) {
          slot.json += ev.delta.partial_json || "";
        }
        // thinking_delta is deliberately dropped — it is not the answer
      } else if (ev?.type === "message_delta") {
        outputTokens = ev.usage?.output_tokens ?? outputTokens;
      }
    }
    const uses = [...blocks.values()].filter((b) => b.type === "tool_use" && b.name);
    const toolCalls: ToolCallResult[] | undefined = uses.length
      ? uses.map((b) => ({ id: b.id || `call_${b.name}`, name: b.name, arguments: parseArgs(b.json) }))
      : undefined;
    const usage = inputTokens || outputTokens
      ? { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens }
      : estimateUsage(call.messages.map((m) => m.content), text);
    return {
      provider: call.provider,
      model: call.model,
      content: text,
      usage,
      latencyMs: Date.now() - t0,
      ...(toolCalls ? { toolCalls } : {}),
    };
  }

  const json: any = await res.json();
  const blocks: any[] = Array.isArray(json.content) ? json.content : [];
  const content = blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text || "").join("");
  const uses = blocks.filter((b: any) => b?.type === "tool_use");
  const toolCalls: ToolCallResult[] | undefined = uses.length
    ? uses.map((b: any) => ({ id: b.id, name: b.name, arguments: parseArgs(b.input) }))
    : undefined;
  const inputTokens = json.usage?.input_tokens ?? 0;
  const outputTokens = json.usage?.output_tokens ?? 0;
  return {
    provider: call.provider,
    model: call.model,
    content,
    usage: json.usage ? { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens } : undefined,
    latencyMs: Date.now() - t0,
    ...(toolCalls ? { toolCalls } : {}),
  };
}

async function callGoogle(call: LLMCall, apiKey: string): Promise<LLMResult> {
  const t0 = Date.now();
  const system = call.messages.filter(m => m.role === "system").map(m => flattenText(m.content)).filter(Boolean).join("\n\n");
  const tools = wireTools(call.tools).map((t) => ({
    name: t.function?.name ?? "",
    description: t.function?.description,
    parameters: t.function?.parameters ?? { type: "object", properties: {} },
  })).filter((t) => t.name);

  // Gemini alternates model/user turns and a function call must be answered by
  // a functionResponse whose name matches the call. Track call id -> name.
  const lastCallName = new Map<string, string>();
  const contents: { role: "user" | "model"; parts: unknown[] }[] = [];
  for (const m of call.messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      contents.push({ role: "user", parts: [{ functionResponse: { name: m.tool_call_id ? lastCallName.get(m.tool_call_id) ?? "tool" : "tool", response: { output: flattenText(m.content) } } }] });
    } else if (m.role === "assistant" && m.tool_calls?.length) {
      for (const tc of m.tool_calls) lastCallName.set(tc.id, tc.function?.name ?? "tool");
      contents.push({
        role: "model",
        parts: m.tool_calls.map((tc) => ({ functionCall: { name: tc.function?.name ?? "tool", args: parseArgs(tc.function?.arguments) } })),
      });
    } else {
      const parts = googleParts(budgetParts(asParts(m.content)));
      contents.push({ role: m.role === "assistant" ? "model" : "user", parts: parts.length ? parts : [{ text: flattenText(m.content) }] });
    }
  }

  // Gemini generateContent
  const streaming = !!call.stream;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(call.model)}:generateContent${streaming ? "?alt=sse&" : "?"}key=${encodeURIComponent(apiKey)}`;
  const thinkingBudget = reasoningBudget(call.reasoningEffort);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        temperature: call.temperature ?? 0.5,
        maxOutputTokens: maxTokensForEffort(call.maxTokens ?? 2048, call.reasoningEffort),
        ...(thinkingBudget ? { thinkingConfig: { thinkingBudget, includeThoughts: false } } : {}),
      },
    }),
    signal: call.signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`google ${res.status}: ${txt.slice(0, 800)}`);
  }

  const readChunks = async (): Promise<{ text: string; usage?: LLMUsage; calls: ToolCallResult[] }> => {
    let text = "";
    let usage: LLMUsage | undefined;
    const calls: ToolCallResult[] = [];
    const consume = (chunk: any) => {
      const parts: any[] = chunk?.candidates?.[0]?.content?.parts ?? [];
      const piece = parts.filter((p: any) => typeof p?.text === "string").map((p: any) => p.text).join("");
      if (piece) {
        text += piece;
        call.onDelta?.(piece);
      }
      parts.filter((p: any) => p?.functionCall).forEach((p: any) => {
        calls.push({ id: `call_${calls.length}`, name: p.functionCall.name, arguments: parseArgs(p.functionCall.args) });
      });
      const md = chunk?.usageMetadata;
      if (md) {
        const prompt = md.promptTokenCount ?? 0;
        const completion = md.candidatesTokenCount ?? 0;
        if (prompt || completion) usage = { prompt_tokens: prompt, completion_tokens: completion, total_tokens: md.totalTokenCount ?? prompt + completion };
      }
    };
    if (streaming) {
      for await (const ev of sseEvents(res)) consume(ev);
    } else {
      consume(await res.json());
    }
    return { text, usage, calls };
  };

  const { text, usage, calls } = await readChunks();
  return {
    provider: call.provider,
    model: call.model,
    content: text,
    usage: usage ?? estimateUsage(call.messages.map((m) => m.content), text),
    latencyMs: Date.now() - t0,
    ...(calls.length ? { toolCalls: calls } : {}),
  };
}

async function callCohere(call: LLMCall, apiKey: string): Promise<LLMResult> {
  const t0 = Date.now();
  const tools = wireTools(call.tools).map((t) => ({
    type: "function",
    function: {
      name: t.function?.name ?? "",
      description: t.function?.description,
      parameters: t.function?.parameters ?? { type: "object", properties: {} },
    },
  })).filter((t) => t.function.name);

  const messages: any[] = [];
  for (const m of call.messages) {
    if (m.role === "assistant" && m.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: flattenText(m.content) ? [{ type: "text", text: flattenText(m.content) }] : [],
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function?.name ?? "", arguments: String(tc.function?.arguments ?? "{}") },
        })),
      });
    } else if (m.role === "tool") {
      messages.push({
        role: "tool",
        tool_call_id: m.tool_call_id ?? "",
        content: [{ type: "text", text: flattenText(m.content) }],
      });
    } else {
      messages.push({ role: m.role, content: cohereParts(budgetParts(asParts(m.content))) });
    }
  }

  // Cohere v2 chat (native tool support).
  const res = await fetch("https://api.cohere.ai/v2/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: call.model,
      messages,
      ...(tools.length ? { tools } : {}),
      temperature: call.temperature ?? 0.5,
      max_tokens: maxTokensForEffort(call.maxTokens ?? 2048, call.reasoningEffort),
      ...(call.stream ? { stream: true } : {}),
    }),
    signal: call.signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`cohere ${res.status}: ${txt.slice(0, 800)}`);
  }
  if (call.stream) {
    // content-delta frames carry the answer; tool-call-delta frames carry args.
    let text = "";
    let usage: LLMUsage | undefined;
    const calls = new Map<number, { id: string; name: string; args: string }>();
    for await (const ev of sseEvents(res)) {
      if (ev?.type === "content-delta") {
        const piece = ev.delta?.message?.content?.text;
        if (piece) {
          text += piece;
          call.onDelta?.(piece);
        }
      } else if (ev?.type === "tool-call-delta") {
        const slot = calls.get(ev.index ?? 0) ?? { id: "", name: "", args: "" };
        const tc = ev.delta?.tool_call || {};
        if (tc.id) slot.id = tc.id;
        if (tc.name) slot.name = tc.name;
        if (tc.parameters) slot.args += tc.parameters;
        calls.set(ev.index ?? 0, slot);
      } else if (ev?.type === "tool-call-end") {
        for (const tc of ev.delta?.tool_calls ?? []) {
          const slot = calls.get(tc.index ?? 0) ?? { id: "", name: "", args: "" };
          if (tc.id) slot.id = tc.id;
          if (tc.function?.name) slot.name = tc.function.name;
          if (tc.function?.arguments) slot.args += tc.function.arguments;
          calls.set(tc.index ?? 0, slot);
        }
      } else if (ev?.usage) {
        const input = ev.usage.tokens?.input_tokens ?? ev.usage.billed_units?.input_tokens ?? 0;
        const output = ev.usage.tokens?.output_tokens ?? ev.usage.billed_units?.output_tokens ?? 0;
        if (input || output) usage = { prompt_tokens: input, completion_tokens: output, total_tokens: input + output };
      }
    }
    const toolCalls: ToolCallResult[] | undefined = calls.size
      ? [...calls.values()].filter((t) => t.name).map((t) => ({ id: t.id || `call_${t.name}`, name: t.name, arguments: parseArgs(t.args) }))
      : undefined;
    return {
      provider: call.provider,
      model: call.model,
      content: text,
      usage: usage ?? estimateUsage(call.messages.map((m) => m.content), text),
      latencyMs: Date.now() - t0,
      ...(toolCalls ? { toolCalls } : {}),
    };
  }

  const j: any = await res.json();
  const blocks: any[] = Array.isArray(j.message?.content) ? j.message.content : [];
  const plan = typeof j.message?.tool_plan === "string" ? j.message.tool_plan : "";
  const content = blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text || "").join("");
  const calls = blocks.flatMap((b: any) => (b?.type === "tool_calls" ? b.tool_calls ?? [] : []));
  const toolCalls: ToolCallResult[] | undefined = calls.length
    ? calls.map((tc: any) => ({ id: tc.id, name: tc.function?.name, arguments: parseArgs(tc.function?.arguments) }))
    : undefined;
  const inputTokens = j.usage?.tokens?.input_tokens ?? j.usage?.input_tokens ?? 0;
  const outputTokens = j.usage?.tokens?.output_tokens ?? j.usage?.output_tokens ?? 0;
  return {
    provider: call.provider,
    model: call.model,
    content: plan ? `${plan}\n\n${content}`.trim() : content,
    usage: j.usage && (inputTokens || outputTokens) ? { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens } : undefined,
    latencyMs: Date.now() - t0,
    ...(toolCalls ? { toolCalls } : {}),
  };
}

export async function callLLM(call: LLMCall, apiKey: string, opts?: { baseUrl?: string }): Promise<LLMResult> {
  if (!isValidApiKey(apiKey)) {
    throw new Error("API key contains spaces, line breaks or non-ASCII characters — re-copy it from the provider dashboard.");
  }
  const cfg = providerConfig(call.provider);
  // route by provider type
  if (call.provider === "anthropic") return callAnthropic(call, apiKey);
  if (call.provider === "google") return callGoogle(call, apiKey);
  if (call.provider === "cohere") return callCohere(call, apiKey);
  // default OpenAI-compatible (covers nvidia, openrouter, omeroute, openai, mistral, together, perplexity)
  return callOpenAICompatible(call, apiKey, cfg.baseUrl, opts?.baseUrl);
}

// Fetch the live model list a provider exposes for a given API key.
// Covers OpenAI-compatible /v1/models (nvidia, openrouter, omeroute, openai,
// mistral, together, perplexity, agentrouter, cohere...) plus anthropic and google.
// NVCF deployment URLs are single-function endpoints with no /models listing.
// Models are flagged `image`/`video` when they can generate media so the chat
// UI can dispatch to the real generation pipeline.
export async function fetchProviderModels(provider: ProviderId, apiKey: string, endpoint?: string): Promise<ProviderModel[]> {
  if (!isValidApiKey(apiKey)) return [];
  const cfg = providerConfig(provider);
  try {
    const rawBase = (endpoint || cfg.baseUrl).replace(/\/+$/, "");
    if (/api\.nvcf\.nvidia\.com/.test(rawBase)) return [];
    // Exclude non-dialog families (embeddings, audio, re-rankers...) but NOT
    // image/video generation models — those are surfaced so they can be used.
    const skip = /(embed|embedding|reward|rerank|ranker|guard|tts|asr|whisper|speech|tokeniz)/i;

    let url: string;
    let headers: Record<string, string>;
    if (provider === "anthropic") {
      url = `${rawBase}/v1/models`;
      headers = { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    } else if (provider === "google") {
      url = `${rawBase}/models?key=${encodeURIComponent(apiKey)}`;
      headers = { "Content-Type": "application/json" };
    } else {
      url = `${rawBase}/models`;
      headers = { Authorization: `Bearer ${apiKey}` };
      // AgentRouter only serves clients that carry the OpenAI-SDK / Roo Code identity headers.
      if (provider === "agentrouter") {
        headers["X-Stainless-OS"] = "Linux";
        headers["X-Stainless-Arch"] = "x64";
        headers["X-Stainless-Lang"] = "js";
        headers["X-Stainless-Runtime"] = "node";
        headers["X-Stainless-Runtime-Version"] = "v22.22.1";
        headers["HTTP-Referer"] = "https://github.com/RooVetGit/Roo-Cline";
        headers["X-Title"] = "Roo Code";
        headers["User-Agent"] = "RooCode/3.53.0";
      }
    }

    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const json: unknown = await res.json();

    const asList = json as { data?: unknown[]; models?: unknown[] };
    const items: unknown[] = Array.isArray(json) ? json : asList.data ?? asList.models ?? [];

    const seen = new Set<string>();
    const out: ProviderModel[] = [];
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const m = raw as Record<string, unknown>;
      let id = String(m.id ?? m.name ?? "").trim();
      if (id.startsWith("models/")) id = id.slice("models/".length);
      if (!id || seen.has(id) || skip.test(id)) continue;
      seen.add(id);
      const ctx = (m.context_length as number) ??
        (m.max_model_len as number) ??
        (m.max_context_length as number) ??
        (m.context_window as number) ??
        (m.inputTokenLimit as number) ??
        (m.context as number);
      const modalities = Array.isArray(m.modalities) ? (m.modalities as string[]).map(x => String(x).toLowerCase()) : [];
      const mods = Array.isArray(m.output_modalities) ? (m.output_modalities as string[]).map(x => String(x).toLowerCase()) : [];
      const arch = (m.architecture && typeof m.architecture === "object" ? m.architecture : {}) as Record<string, unknown>;
      const inputs = Array.isArray(arch.input_modalities) ? (arch.input_modalities as unknown[]).map(x => String(x).toLowerCase()) : [];
      const flags = [...modalities, ...mods, ...inputs];
      const image = flags.includes("image") || /(dall-e|gpt-image|imagen|sdxl|flux|stable-diffusion|schnell|image-generation)/i.test(id);
      const video = flags.some(f => /video|modality\.video/i.test(f)) || /(sora|veo|kling|pika|luma|runway|video-generation)/i.test(id);
      const reasoning = /(o1|o3|o4|gpt-5|thinking|deepseek-r1|\br1\b|nemotron|reasoning|gemini-2\.5|claude-4|sonar-reasoning)/i.test(id);
      const vision = inputs.includes("image") || inputs.includes("file") || CAPABLE_MODELS_RE.vision.test(id);
      // OpenRouter (and a few compatible gateways) report per-token pricing.
      // Zero prompt + zero completion is the only reliable "free" signal for
      // live lists that do not use the `:free` suffix.
      const pricing = (m.pricing && typeof m.pricing === "object" ? m.pricing : {}) as Record<string, unknown>;
      const priceOf = (v: unknown): number | null => {
        const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
        return Number.isFinite(n) ? n : null;
      };
      const promptPrice = priceOf(pricing.prompt);
      const completionPrice = priceOf(pricing.completion);
      const pricedFree = promptPrice === 0 && completionPrice === 0;
      const pricedPaid = (promptPrice !== null && promptPrice > 0) || (completionPrice !== null && completionPrice > 0);
      const idFree = /:free$/i.test(id);
      out.push({
        id,
        name: id.split("/").pop() ?? id,
        context: ctx ? `${Math.max(1, Math.round(Number(ctx) / 1024))}K` : undefined,
        ...(image ? { image: true } : {}),
        ...(video ? { video: true } : {}),
        ...(reasoning ? { reasoning: true } : {}),
        ...(vision ? { vision: true } : {}),
        ...(idFree || pricedFree ? { free: true } : pricedPaid ? { free: false } : {}),
      });
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  } catch {
    return [];
  }
}

export async function testProviderKey(provider: ProviderId, apiKey: string, endpoint?: string): Promise<{ ok: boolean; message: string }> {
  try {
    const model = PROVIDERS.find(p => p.id === provider)?.models[0].id;
    if (!model) throw new Error("No model for provider");
    const r = await callLLM({ provider, model, messages: [{ role: "user", content: "Reply with OK" }], maxTokens: 5, temperature: 0 }, apiKey, endpoint ? { baseUrl: endpoint } : undefined);
    return { ok: !!r.content, message: r.content.slice(0, 200) || "Connected" };
  } catch (e: any) {
    return { ok: false, message: e.message || "Failed" };
  }
}
