import { PROVIDERS, type ProviderId } from "./providers";

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage { role: ChatRole; content: string; }

export interface LLMCall {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResult {
  provider: ProviderId;
  model: string;
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  latencyMs: number;
}

function providerConfig(provider: ProviderId) {
  const p = PROVIDERS.find(x => x.id === provider);
  if (!p) throw new Error(`Unknown provider ${provider}`);
  return p;
}

// OpenAI-compatible call (covers OpenAI, Nvidia NIM, OpenRouter, OmeRoute, Groq, Together, Mistral, Perplexity-ish)
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

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: call.model,
      messages: call.messages,
      temperature: call.temperature ?? 0.5,
      max_tokens: call.maxTokens ?? 2048,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${call.provider} ${res.status}: ${txt.slice(0, 800)}`);
  }
  const json: any = await res.json();
  const content = json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? "";
  return {
    provider: call.provider,
    model: call.model,
    content,
    usage: json.usage,
    latencyMs: Date.now() - t0,
  };
}

async function callAnthropic(call: LLMCall, apiKey: string): Promise<LLMResult> {
  const t0 = Date.now();
  // Anthropic messages API
  const system = call.messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const messages = call.messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
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
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`anthropic ${res.status}: ${txt.slice(0, 800)}`);
  }
  const json: any = await res.json();
  const content = (json.content || []).map((c: any) => c.text || "").join("");
  return {
    provider: call.provider,
    model: call.model,
    content,
    usage: json.usage ? { prompt_tokens: json.usage.input_tokens, completion_tokens: json.usage.output_tokens, total_tokens: (json.usage.input_tokens + json.usage.output_tokens) } : undefined,
    latencyMs: Date.now() - t0,
  };
}

async function callGoogle(call: LLMCall, apiKey: string): Promise<LLMResult> {
  const t0 = Date.now();
  // Gemini generateContent - flatten messages
  const prompt = call.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(call.model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: call.temperature ?? 0.5, maxOutputTokens: call.maxTokens ?? 2048 },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`google ${res.status}: ${txt.slice(0, 800)}`);
  }
  const json: any = await res.json();
  const content = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  return { provider: call.provider, model: call.model, content, latencyMs: Date.now() - t0 };
}

export async function callLLM(call: LLMCall, apiKey: string, opts?: { baseUrl?: string }): Promise<LLMResult> {
  const cfg = providerConfig(call.provider);
  // route by provider type
  if (call.provider === "anthropic") return callAnthropic(call, apiKey);
  if (call.provider === "google") return callGoogle(call, apiKey);
  if (call.provider === "cohere") {
    // Cohere chat
    const t0 = Date.now();
    const res = await fetch("https://api.cohere.ai/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: call.model, message: call.messages[call.messages.length - 1]?.content, preamble: call.messages.find(m => m.role === "system")?.content }),
    });
    if (!res.ok) throw new Error(`cohere ${res.status}: ${await res.text().catch(() => "")}`);
    const j: any = await res.json();
    return { provider: call.provider, model: call.model, content: j.text || j.reply || "", latencyMs: Date.now() - t0 };
  }
  // default OpenAI-compatible (covers nvidia, openrouter, omeroute, openai, groq, mistral, together, perplexity)
  return callOpenAICompatible(call, apiKey, cfg.baseUrl, opts?.baseUrl);
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
