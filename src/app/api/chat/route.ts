import { NextRequest, NextResponse } from "next/server";
import { callLLM, type ChatMessage as WireMessage } from "@/lib/llm-router";
import type { ProviderId } from "@/lib/providers";
import type { ChatMode } from "@/lib/store";
import { authedRecord, saveState } from "@/lib/auth";
import { MEDUSA_TOOLS, isToolProvider } from "@/lib/tools";
import { asParts, budgetParts, flattenText, isBinaryPart, type ContentPart } from "@/lib/content";
import { buildSkillsPrompt, requestedSkillSlug, type SkillPromptSkill } from "@/lib/skill-prompt";

// Streaming replies keep the socket open for the whole completion, including
// tool rounds, so the request needs more wall time than a normal API call.
export const maxDuration = 300;

const MODE_PROMPTS: Record<ChatMode, string> = {
  coding: "You are an expert coder in MEDUSA OS. Output production-ready code with fenced blocks, file paths, and minimal explanation. Follow user's code style. Be concise and runnable. For large apps: plan file structure first, then implement module by module, flag edge cases and tests.",
  image: "You are an image generation assistant. Describe the image in vivid detail for generation. If provider supports image generation, output a prompt ready for DALL-E/MJ/Stable Diffusion. Otherwise describe what would be generated.",
  plan: "You are a planning agent. Break the request into steps, dependencies, risks and timeline. Output a clear plan with phases, owners and milestones in markdown. For complex projects, decompose into connected workstreams and sequence them.",
  search: "You are a research/search agent. Synthesize from knowledge, cite sources when possible, summarize key facts, trade-offs and next steps. Be factual and grounded. Connect information across sources and highlight what matters.",
  chat: "You are a helpful AI assistant in MEDUSA OS by S&P Group. Be clear, concise and helpful.",
  research: "You are a deep research agent. Go deep, structure findings with headings, tables and citations pattern, surface unknowns and propose next experiments. Handle large documents: extract key facts, compare claims, identify gaps. When a document or image is attached, read it closely, ground every claim in it, and quote or cite the specific page/section you drew a fact from. Never invent content that is not in the attachment.",
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

const REASONING_EFFORTS = ["off", "low", "medium", "high", "extra-high"] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

function isReasoningEffort(v: unknown): v is ReasoningEffort {
  return typeof v === "string" && (REASONING_EFFORTS as readonly string[]).includes(v);
}

interface IncomingMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentPart[];
  tool_calls?: { id: string; type?: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface ChatBody {
  messages: IncomingMessage[];
  provider: ProviderId;
  model: string;
  mode?: ChatMode;
  vault?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  stream?: boolean;
  toolsEnabled?: boolean;
  reasoningEffort?: ReasoningEffort;
  /** Enabled skill packs — manifest text injected into the system prompt. */
  skills?: SkillPromptSkill[];
}

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

  const body = (await req.json().catch(() => null)) as ChatBody | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { messages, provider, model, mode, vault, settings, stream, toolsEnabled, reasoningEffort, skills } = body;

  if (!messages?.length || !provider || !model) {
    return NextResponse.json({ error: "messages, provider, model required" }, { status: 400 });
  }

  const vaultRecord = (vault ?? {}) as Record<string, { key?: string; connected?: boolean; endpoint?: string } | string | undefined>;
  const entry = vaultRecord[provider];
  const apiKey = typeof entry === "string" ? entry : typeof entry?.key === "string" ? entry.key : null;
  if (!apiKey) {
    return NextResponse.json({ error: `No API key for ${provider}. Connect it in Providers Vault.` }, { status: 401 });
  }
  const endpointOverride =
    entry && typeof entry === "object" && typeof entry.endpoint === "string" && entry.endpoint.trim()
      ? { baseUrl: entry.endpoint.trim() }
      : undefined;

  // Stickman films are written as one long JSON script. A tight output cap
  // truncates it mid-JSON on every model (the classic "it always hits a limit"),
  // and step-by-step thinking would eat into the same envelope while adding a
  // long silent wait — so film requests get a big budget and no thinking,
  // unless the user explicitly picked a deep effort.
  const lastUserText = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return flattenText(messages[i].content);
    }
    return "";
  })();
  const stickmanSkillOn = (skills ?? []).some(
    (s) => /stickman/i.test(s.name) || /stickman/i.test(s.instructions.slice(0, 400))
  );
  const magicDrumSkillOn = (skills ?? []).some(
    (s) => /magic[\s-]?drum/i.test(s.name) || /magic[\s-]?drum/i.test(s.instructions.slice(0, 400))
  );
  const slash = requestedSkillSlug(lastUserText);
  // Films are one long JSON spec (Stickman script / Magic Drum film.json): a tight
  // output cap truncates them mid-JSON and thinking eats the same envelope, so any
  // active film skill gets the big budget and effort clamped to off (unless the
  // user explicitly picked a deep effort).
  const filmSkillActive =
    slash === "stickman" ||
    slash === "magicdrum" ||
    slash === "magic-drum" ||
    (stickmanSkillOn && /stickman/i.test(lastUserText)) ||
    (magicDrumSkillOn && /magic[\s-]?drum|magicdrum|animated (film|short|movie|story|cartoon)|\bcartoon\b/i.test(lastUserText));

  // ---- system prompt -------------------------------------------------------
  const effort = isReasoningEffort(reasoningEffort)
    ? reasoningEffort
    : isReasoningEffort(settings?.reasoningEffort)
      ? settings.reasoningEffort
      : "off";
  // Films never benefit from chain-of-thought; clamp medium/low to off (deep
  // explicit choices are respected).
  const filmEffort = filmSkillActive && (effort === "medium" || effort === "low") ? "off" : effort;
  const modePrompt = MODE_PROMPTS[(mode as ChatMode) || "chat"] || MODE_PROMPTS.chat;
  const behavior = settings?.agentBehavior ? `Behavior: ${settings.agentBehavior}.` : "";
  const codeStyle = settings?.codeStyle ? `Code style: ${settings.codeStyle}.` : "";
  const reasoningBooster = filmEffort !== "off" ? REASONING_BOOSTERS[filmEffort] || REASONING_BOOSTERS.medium : "";

  // Tell the model what it was actually given — a bare "see attached" is worse
  // than naming the files, and a stripped attachment must never look like a
  // successful one.
  const inventory: string[] = [];
  let binaryCount = 0;
  for (const m of messages) {
    if (m.role !== "user") continue;
    for (const p of asParts(m.content)) {
      if (p.type === "document") inventory.push(`document "${p.name || p.mime}"`);
      else if (p.type === "image") binaryCount++;
    }
  }
  const attachNote = [
    inventory.length ? `Attached documents: ${inventory.join(", ")}.` : "",
    binaryCount ? `${binaryCount} image${binaryCount > 1 ? "s" : ""} attached.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const systemMsg: WireMessage = {
    role: "system",
    content:
      `${modePrompt}\n${behavior} ${codeStyle}\n${reasoningBooster}\n` +
      `You are running inside MEDUSA OS by S&P Group. Current mode: ${mode || "chat"}.\n` +
      `Reasoning effort: ${filmEffort}.\nProvider: ${provider}, Model: ${model}.` +
      (attachNote ? `\n${attachNote}` : "") +
      (() => {
        const block = buildSkillsPrompt(skills);
        return block ? `\n\n${block}` : "";
      })(),
  };

  const llmMessages: WireMessage[] = [
    systemMsg,
    ...messages.map((m) => ({
      role: m.role,
      // clamp every turn, not just the newest — one oversized attachment
      // anywhere in history would fail the whole request
      content: m.role === "user" && isBinaryOrParts(m.content) ? budgetParts(asParts(m.content)) : m.content,
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    })),
  ];

  const toolsEnabledActually = !!toolsEnabled && isToolProvider(provider);
  const baseMax = mode === "coding" ? 4000 : mode === "research" ? 3500 : 2500;
  const effortBonus = filmEffort === "extra-high" ? 4000 : filmEffort === "high" ? 2000 : 0;
  const llmOpts = {
    temperature: mode === "coding" && (filmEffort === "high" || filmEffort === "extra-high") ? 0.3 : 0.6,
    // Films are one long script — 8k output tokens instead of the default cap.
    maxTokens: filmSkillActive ? 8000 : baseMax + effortBonus,
    tools: toolsEnabledActually ? MEDUSA_TOOLS : undefined,
    reasoningEffort: filmEffort,
  };

  function recordUsage(usage?: { total_tokens?: number }) {
    const total = usage?.total_tokens;
    if (!isAdmin && total) {
      user.tokensUsed = (user.tokensUsed ?? 0) + total;
      user.updatedAt = new Date().toISOString();
    }
  }

  // ---- streaming -----------------------------------------------------------
  // The response is created before the provider call so the client can render
  // progress (and, later, document parsing / OCR) during the wait instead of
  // staring at a frozen spinner for the full completion.
  if (stream) {
    const encoder = new TextEncoder();
    let closed = false;
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (payload: Record<string, unknown>) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          } catch {
            closed = true;
          }
        };
        try {
          emit({ type: "stage", stage: "thinking", label: `Thinking — ${model}` });
          const r = await callLLM(
            { provider, model, messages: llmMessages, ...llmOpts, stream: true, signal: req.signal, onDelta: (t) => emit({ delta: t }) },
            apiKey,
            endpointOverride,
          );
          recordUsage(r.usage);
          await saveState(state);
          if (r.degraded) {
            emit({ type: "notice", message: r.degradedReason === "stream" ? "Provider rejected streaming — continuing without it" : "Provider rejected one or more attachments — continuing with text only" });
          }
          if (r.toolCalls?.length) {
            emit({ type: "toolCalls", toolCalls: r.toolCalls, usage: r.usage, latencyMs: r.latencyMs });
          }
          emit({ type: "done", content: r.content, usage: r.usage, latencyMs: r.latencyMs, provider, model, mode });
        } catch (e: unknown) {
          if ((e as Error)?.name === "AbortError") {
            emit({ type: "aborted" });
          } else {
            emit({ type: "error", error: (e as Error)?.message || "LLM failed" });
          }
        } finally {
          try {
            if (!closed) controller.close();
          } catch {
            /* already torn down by the client */
          }
        }
      },
      cancel() {
        closed = true;
      },
    });
    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ---- one-shot JSON -------------------------------------------------------
  try {
    const r = await callLLM({ provider, model, messages: llmMessages, ...llmOpts, signal: req.signal }, apiKey, endpointOverride);
    recordUsage(r.usage);
    await saveState(state);
    if (r.toolCalls?.length) {
      return NextResponse.json({ toolCalls: r.toolCalls, usage: r.usage, latencyMs: r.latencyMs, provider, model, mode });
    }
    return NextResponse.json({ content: r.content, usage: r.usage, latencyMs: r.latencyMs, provider, model, mode });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error)?.message || "LLM failed" }, { status: 500 });
  }
}

function isBinaryOrParts(content: string | ContentPart[]): boolean {
  if (typeof content === "string") return false;
  const parts = asParts(content);
  return parts.some(isBinaryPart) || content.length > 1;
}
