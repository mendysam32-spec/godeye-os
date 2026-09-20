import { PROVIDERS, type ProviderId, type ProviderModel } from "./providers";

export type ChatRole = "system" | "user" | "assistant" | "tool";
export interface ChatMessage {
  role: ChatRole;
  content: string;
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
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResult {
  provider: ProviderId;
  model: string;
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  latencyMs: number;
  toolCalls?: ToolCallResult[];
}

function providerConfig(provider: ProviderId) {
  const p = PROVIDERS.find(x => x.id === provider);
  if (!p) throw new Error(`Unknown provider ${provider}`);
  return p;
}

// OpenAI-style tools ({type:"function", function:{name, description, parameters}})
// as passed by the API route from GODEYE_TOOLS. Providers that speak their own
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
    headers["HTTP-Referer"] = "https://godeye.sandpgroup.com";
    headers["X-Title"] = "GodEye OS";
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

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: call.model,
      messages: call.messages,
      temperature: call.temperature ?? 0.5,
      max_tokens: call.maxTokens ?? 2048,
      ...(call.tools && call.tools.length ? { tools: call.tools, tool_choice: "auto" } : {}),
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${call.provider} ${res.status}: ${txt.slice(0, 800)}`);
  }
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
    usage: json.usage,
    latencyMs: Date.now() - t0,
    ...(toolCalls ? { toolCalls } : {}),
  };
}

async function callAnthropic(call: LLMCall, apiKey: string): Promise<LLMResult> {
  const t0 = Date.now();
  // Anthropic messages API
  const system = call.messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const tools = wireTools(call.tools).map((t) => ({
    name: t.function?.name ?? "",
    description: t.function?.description,
    input_schema: t.function?.parameters ?? { type: "object", properties: {} },
  })).filter((t) => t.name);

  const messages: any[] = [];
  for (const m of call.messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: String(m.content ?? "") }] });
    } else if (m.role === "assistant" && m.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: [
          ...(m.content ? [{ type: "text", text: m.content }] : []),
          ...m.tool_calls.map((tc) => ({ type: "tool_use", id: tc.id, name: tc.function?.name ?? "", input: parseArgs(tc.function?.arguments) })),
        ],
      });
    } else {
      messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content ?? "") });
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
      max_tokens: call.maxTokens ?? 2048,
      system: system || undefined,
      messages,
      temperature: call.temperature ?? 0.5,
      ...(tools.length ? { tools, tool_choice: { type: "auto" } } : {}),
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${txt.slice(0, 800)}`);
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
  const system = call.messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
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
      contents.push({ role: "user", parts: [{ functionResponse: { name: m.tool_call_id ? lastCallName.get(m.tool_call_id) ?? "tool" : "tool", response: { output: String(m.content ?? "") } } }] });
    } else if (m.role === "assistant" && m.tool_calls?.length) {
      for (const tc of m.tool_calls) lastCallName.set(tc.id, tc.function?.name ?? "tool");
      contents.push({
        role: "model",
        parts: m.tool_calls.map((tc) => ({ functionCall: { name: tc.function?.name ?? "tool", args: parseArgs(tc.function?.arguments) } })),
      });
    } else {
      contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content ?? "") }] });
    }
  }

  // Gemini generateContent
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(call.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(tools.length ? { tools: [{ functionDeclarations: tools }] } : {}),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { temperature: call.temperature ?? 0.5, maxOutputTokens: call.maxTokens ?? 2048 },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`google ${res.status}: ${txt.slice(0, 800)}`);
  }
  const json: any = await res.json();
  const parts: any[] = json.candidates?.[0]?.content?.parts ?? [];
  const content = parts.filter((p: any) => typeof p?.text === "string").map((p: any) => p.text).join("");
  const calls = parts.filter((p: any) => p?.functionCall).map((p: any, i: number) => ({
    id: `call_${i}`,
    name: p.functionCall.name,
    arguments: parseArgs(p.functionCall.args),
  }));
  const promptTokens = json.usageMetadata?.promptTokenCount ?? 0;
  const completionTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
  return {
    provider: call.provider,
    model: call.model,
    content,
    usage: json.usageMetadata ? { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } : undefined,
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
        content: m.content ? [{ type: "text", text: String(m.content) }] : [],
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
        content: [{ type: "text", text: String(m.content ?? "") }],
      });
    } else {
      messages.push({ role: m.role, content: [{ type: "text", text: String(m.content ?? "") }] });
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
      max_tokens: call.maxTokens ?? 2048,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`cohere ${res.status}: ${txt.slice(0, 800)}`);
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
export async function fetchProviderModels(provider: ProviderId, apiKey: string, endpoint?: string): Promise<ProviderModel[]> {
  const cfg = providerConfig(provider);
  try {
    const rawBase = (endpoint || cfg.baseUrl).replace(/\/+$/, "");
    if (/api\.nvcf\.nvidia\.com/.test(rawBase)) return [];
    const skip = /(embed|embedding|reward|rerank|ranker|guard|tts|asr|whisper|speech|tokeniz|dalle|midjourney|stable|sdxl|flux|text-embed)/i;

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
      out.push({ id, name: id.split("/").pop() ?? id, context: ctx ? `${Math.max(1, Math.round(Number(ctx) / 1024))}K` : undefined });
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
