import { NextRequest, NextResponse } from "next/server";
import { callLLM, type ChatMessage } from "@/lib/llm-router";
import type { ProviderId } from "@/lib/providers";
import { requireUser } from "@/lib/auth";

interface AgentInput {
  id: string;
  name: string;
  role: string;
  provider: ProviderId;
  model: string;
  systemPrompt?: string;
  temperature?: number;
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { prompt, agents, vault, settings, reasoningEffort } = body as {
    prompt: string;
    agents: AgentInput[];
    vault: Record<string, { key?: string; provider?: string } | string>;
    settings?: { agentBehavior?: string; codeStyle?: string; reasoningEffort?: string };
    reasoningEffort?: "off" | "low" | "medium" | "high" | "extra-high";
  };

  if (!prompt || !agents?.length) return NextResponse.json({ error: "prompt and agents required" }, { status: 400 });

  // normalize vault: can be Record<ProviderId, {key, connected}> or Record<ProviderId, string>
  function getKey(provider: ProviderId): string | null {
    const v: any = (vault as any)?.[provider];
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v.key === "string") return v.key;
    if (typeof v.apiKey === "string") return v.apiKey;
    return null;
  }

  const behaviorHint =
    settings?.agentBehavior === "creative" ? "Be imaginative and propose variants."
    : settings?.agentBehavior === "precise" ? "Be precise, cite steps, avoid speculation."
    : settings?.agentBehavior === "autonomous" ? "Act autonomously, produce final deliverable without asking questions."
    : "Balance creativity and precision.";

  const codeStyleHint =
    settings?.codeStyle === "concise" ? "Code style: concise, minimal comments."
    : settings?.codeStyle === "verbose" ? "Code style: verbose, explain tradeoffs."
    : "Code style: documented, with JSDoc and README snippet.";

  const effort = (reasoningEffort || (settings as any)?.reasoningEffort || "medium") as "off" | "low" | "medium" | "high" | "extra-high";
  const depthHint =
    effort === "extra-high"
      ? "Use maximum reasoning depth: decompose into sub-problems, solve each with verification, cross-check consistency, then deliver."
      : effort === "high"
        ? "Think step-by-step: explore approaches, verify constraints and edge cases, then deliver."
        : effort === "low" || effort === "off"
          ? "Answer directly and concisely."
          : "Think briefly step-by-step, then deliver.";

  // fan-out: run all agents in parallel, each with its provider key
  const tasks = agents.map(async (agent) => {
    const apiKey = getKey(agent.provider);
    if (!apiKey) {
      return {
        agentId: agent.id,
        agentName: agent.name,
        provider: agent.provider,
        model: agent.model,
        error: `No API key for ${agent.provider}. Connect it in Providers Vault.`,
        content: "",
      };
    }

    const isCodeRole = /engineer|architect|coder|developer|code/i.test(agent.role);
    const system: ChatMessage[] = [
      {
        role: "system",
        content: `You are ${agent.name} — ${agent.role} in GodEye OS by S&P Group.\n${agent.systemPrompt || ""}\n\nWorkforce context: ${behaviorHint} ${codeStyleHint}\nReasoning depth (${effort}): ${depthHint}\n${isCodeRole ? "Output: production-ready code block(s) + brief notes. Use markdown fenced code. For large builds: file map first, then modules, then tests." : "Output: polished content (markdown) ready to ship. For research: facts → analysis → synthesis with key details surfaced."}\nAlways be concise and deliver a finished artifact, not a plan.`,
      },
      { role: "user", content: prompt },
    ];

    try {
      const vEntry = (vault as Record<string, { key?: string; provider?: string; endpoint?: string } | string>)?.[agent.provider];
      const endpointOverride = vEntry && typeof vEntry === "object" && typeof vEntry.endpoint === "string" && vEntry.endpoint.trim()
        ? { baseUrl: vEntry.endpoint.trim() }
        : undefined;
      const r = await callLLM(
        {
          provider: agent.provider,
          model: agent.model,
          messages: system,
          temperature: agent.temperature ?? (effort === "high" || effort === "extra-high" ? 0.3 : 0.5),
          maxTokens: (isCodeRole ? 3000 : 2000) + (effort === "extra-high" ? 4000 : effort === "high" ? 2000 : 0),
          reasoningEffort: effort,
        },
        apiKey,
        endpointOverride
      );
      return {
        agentId: agent.id,
        agentName: agent.name,
        provider: agent.provider,
        model: agent.model,
        content: r.content,
        usage: r.usage,
        latencyMs: r.latencyMs,
      };
    } catch (e: any) {
      return {
        agentId: agent.id,
        agentName: agent.name,
        provider: agent.provider,
        model: agent.model,
        error: e.message || "LLM call failed",
        content: "",
      };
    }
  });

  const results = await Promise.all(tasks);

  // optional merge: if at least one succeeded, ask cheapest successful to synthesize? For now return fan-out
  const succeeded = results.filter(r => !("error" in r) || !(r as any).error).length;
  return NextResponse.json({
    ok: true,
    prompt,
    succeeded,
    total: results.length,
    results,
    meta: { behavior: settings?.agentBehavior, codeStyle: settings?.codeStyle, reasoningEffort: effort },
  });
}
