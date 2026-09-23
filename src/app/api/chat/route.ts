import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm-router";
import type { ProviderId } from "@/lib/providers";
import type { ChatMode } from "@/lib/store";
import { authedRecord, saveState } from "@/lib/auth";
import { GODEYE_TOOLS, isToolProvider } from "@/lib/tools";

const MODE_PROMPTS: Record<ChatMode, string> = {
  coding: "You are an expert coder in GodEye OS. Output production-ready code with fenced blocks, file paths, and minimal explanation. Follow user's code style. Be concise and runnable. For large apps: plan file structure first, then implement module by module, flag edge cases and tests.",
  image: "You are an image generation assistant. Describe the image in vivid detail for generation. If provider supports image generation, output a prompt ready for DALL-E/MJ/Stable Diffusion. Otherwise describe what would be generated.",
  plan: "You are a planning agent. Break the request into steps, dependencies, risks and timeline. Output a clear plan with phases, owners and milestones in markdown. For complex projects, decompose into connected workstreams and sequence them.",
  search: "You are a research/search agent. Synthesize from knowledge, cite sources when possible, summarize key facts, trade-offs and next steps. Be factual and grounded. Connect information across sources and highlight what matters.",
  chat: "You are a helpful AI assistant in GodEye OS by S&P Group. Be clear, concise and helpful.",
  research: "You are a deep research agent. Go deep, structure findings with headings, tables and citations pattern, surface unknowns and propose next experiments. Handle large documents: extract key facts, compare claims, identify gaps.",
  terminal: "You are a terminal assistant. Output commands to run, expected output, and explanation. Use bash/code blocks. Be exact. For debugging, reason step-by-step: hypothesis → command → expected signal.",
  video: "You are a video generation assistant. Describe the video you would create: setting, subject, camera motion and pacing, in a vivid generation-ready prompt. If the provider supports video generation, output a prompt ready for Sora/Veo/Kling. Otherwise describe what would be generated.",
};

const REASONING_BOOSTERS: Record<string, string> = {
  low: "Answer directly with minimal deliberation.",
  medium: "Think step-by-step before answering. Show key reasoning briefly, then the final answer.",
  high: "Reason deeply and step-by-step: restate the problem, explore 2-3 approaches, verify constraints and edge cases, then deliver the final answer with rationale. For code: architecture → implementation → tests. For research: facts → analysis → synthesis.",
  "extra-high":
    "Use maximum reasoning depth. Work through the problem methodically: 1) restate goals and constraints, 2) break into sub-problems, 3) solve each with verification, 4) cross-check consistency, 5) consider failure modes and alternatives, 6) deliver the final artifact plus a short reasoning trace. For large codebases: file map first, then diffs. For large documents/data: extract → correlate → conclude. Never skip hard conditions.",
};

export async function POST(req: NextRequest) {
  const auth = await authedRecord(req);
  if (!auth) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { state, user } = auth;

  const isAdmin = user.role === "admin";
  const tokenLimit = isAdmin ? 0 : (user.tokenLimit ?? 0);
  if (tokenLimit > 0 && (user.tokensUsed ?? 0) >= tokenLimit) {
    return NextResponse.json({
      error: `You have reached your token limit (${user.tokensUsed}/${tokenLimit}). Ask the admin to raise your limit.`,
    }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { messages, provider, model, mode, referenceFiles, vault, settings, stream, toolsEnabled, reasoningEffort } = body as {
    messages: { role: "user" | "assistant" | "system" | "tool"; content: string; tool_calls?: { id: string; type?: string; function: { name: string; arguments: string } }[]; tool_call_id?: string }[];
    provider: ProviderId;
    model: string;
    mode?: ChatMode;
    referenceFiles?: { name: string; content: string; type: string }[];
    vault?: Record<string, any>;
    settings?: any;
    stream?: boolean;
    toolsEnabled?: boolean;
    reasoningEffort?: "off" | "low" | "medium" | "high" | "extra-high";
  };

  if (!messages?.length || !provider || !model) {
    return NextResponse.json({ error: "messages, provider, model required" }, { status: 400 });
  }

  function getKey(p: ProviderId): string | null {
    const v: any = vault?.[p];
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v.key === "string") return v.key;
    return null;
  }
  const apiKey = getKey(provider);
  if (!apiKey) {
    return NextResponse.json({ error: `No API key for ${provider}. Connect it in Providers Vault.` }, { status: 401 });
  }
  const vaultEntry = (vault as Record<string, { key?: string; connected?: boolean; endpoint?: string } | string> | undefined)?.[provider];
  const endpointOverride = vaultEntry && typeof vaultEntry === "object" && typeof vaultEntry.endpoint === "string" && vaultEntry.endpoint.trim()
    ? { baseUrl: vaultEntry.endpoint.trim() }
    : undefined;

  const modePrompt = MODE_PROMPTS[(mode as ChatMode) || "chat"] || MODE_PROMPTS.chat;
  const behavior = settings?.agentBehavior ? `Behavior: ${settings.agentBehavior}.` : "";
  const codeStyle = settings?.codeStyle ? `Code style: ${settings.codeStyle}.` : "";
  const effort = reasoningEffort || settings?.reasoningEffort || "medium";
  const reasoningBooster = effort !== "off" ? REASONING_BOOSTERS[effort] || REASONING_BOOSTERS.medium : "";

  // Large-context handling: deep modes get bigger reference windows.
  // high / extra-high can ingest full question banks, big docs, spreadsheets.
  const perFileBudget = effort === "extra-high" ? 40000 : effort === "high" ? 25000 : 12000;
  let referenceBlock = "";
  if (referenceFiles?.length) {
    referenceBlock = "\n\nReference files:\n" + referenceFiles.map(f => `--- ${f.name} (${f.type}) ---\n${f.content.slice(0, perFileBudget)}`).join("\n\n");
  }

  const systemMsg = {
    role: "system" as const,
    content: `${modePrompt}\n${behavior} ${codeStyle}\n${reasoningBooster}\nYou are running inside GodEye OS by S&P Group. Current mode: ${mode || "chat"}.\nReasoning effort: ${effort}.\nProvider: ${provider}, Model: ${model}.${referenceBlock}`.trim(),
  };

  const llmMessages = [systemMsg, ...messages.map(m => ({
    role: m.role,
    content: m.content,
    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
  }))];

  const toolsEnabledActually = !!toolsEnabled && isToolProvider(provider);
  const tools = toolsEnabledActually ? GODEYE_TOOLS : undefined;
  const baseMax = mode === "coding" ? 4000 : mode === "research" ? 3500 : 2500;
  const effortBonus = effort === "extra-high" ? 4000 : effort === "high" ? 2000 : 0;
  const llmOpts = {
    temperature: mode === "coding" && (effort === "high" || effort === "extra-high") ? 0.3 : 0.6,
    maxTokens: baseMax + effortBonus,
    tools,
    reasoningEffort: effort as "off" | "low" | "medium" | "high" | "extra-high",
  };

  function recordUsage(usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) {
    const total = usage?.total_tokens;
    if (!isAdmin && total) {
      user.tokensUsed = (user.tokensUsed ?? 0) + total;
      user.updatedAt = new Date().toISOString();
    }
  }

  // streaming via SSE if requested
  if (stream) {
    // For simplicity, we do non-streaming then fake stream chunks - providers not all stream same
    // If client wants real streaming, we'd pipe provider stream. For now chunked response:
    try {
      const r = await callLLM({ provider, model, messages: llmMessages, ...llmOpts }, apiKey, endpointOverride);
      recordUsage(r.usage);
      await saveState(state);
      if (r.toolCalls?.length) {
        return NextResponse.json({ toolCalls: r.toolCalls, usage: r.usage, latencyMs: r.latencyMs, provider, model, mode });
      }
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          const words = r.content.split(/(\s+)/);
          for (const w of words) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: w })}\n\n`));
            await new Promise(res => setTimeout(res, 12));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, usage: r.usage, latencyMs: r.latencyMs })}\n\n`));
          controller.close();
        },
      });
      return new NextResponse(readable, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  try {
    const r = await callLLM({ provider, model, messages: llmMessages, ...llmOpts }, apiKey, endpointOverride);
    recordUsage(r.usage);
    await saveState(state);
    if (r.toolCalls?.length) {
      return NextResponse.json({ toolCalls: r.toolCalls, usage: r.usage, latencyMs: r.latencyMs, provider, model, mode });
    }
    return NextResponse.json({ content: r.content, usage: r.usage, latencyMs: r.latencyMs, provider, model, mode });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "LLM failed" }, { status: 500 });
  }
}
