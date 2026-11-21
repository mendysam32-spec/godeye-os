import { NextRequest, NextResponse } from "next/server";
import type { ProviderId } from "@/lib/providers";
import { requireUser } from "@/lib/auth";
import { runAgentRuntime, type RuntimeAgentInput } from "@/lib/agent-runtime";

/**
 * Workforce entry point. The fan-out is now driven by the agent runtime
 * (scheduler + structured messages + verifiers + traces + cost ledger). The
 * response keeps the original `results` shape so the dashboard needs no change.
 */

function budgetUsd(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 1_000_000) : undefined;
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const rawAgents = Array.isArray(body.agents) ? body.agents : [];
  if (!prompt.trim() || !rawAgents.length) {
    return NextResponse.json({ error: "prompt and agents required" }, { status: 400 });
  }

  const agents: RuntimeAgentInput[] = rawAgents.flatMap((value): RuntimeAgentInput[] => {
    if (!value || typeof value !== "object") return [];
    const a = value as Record<string, unknown>;
    if (typeof a.id !== "string" || typeof a.model !== "string" || typeof a.provider !== "string") return [];
    return [{
      id: a.id,
      name: typeof a.name === "string" ? a.name : "Agent",
      role: typeof a.role === "string" ? a.role : "Assistant",
      provider: a.provider as ProviderId,
      model: a.model,
      systemPrompt: typeof a.systemPrompt === "string" ? a.systemPrompt : "",
      temperature: typeof a.temperature === "number" ? a.temperature : undefined,
      priority: typeof a.priority === "number" ? a.priority : 0,
      dependsOn: Array.isArray(a.dependsOn) ? a.dependsOn.filter((d): d is string => typeof d === "string") : [],
      quotaTokens: typeof a.quotaTokens === "number" ? a.quotaTokens : undefined,
      quotaMs: typeof a.quotaMs === "number" ? a.quotaMs : undefined,
      budgetUsd: budgetUsd(a.budgetUsd),
    }];
  });
  if (!agents.length) return NextResponse.json({ error: "No valid agents supplied" }, { status: 400 });

  const settings = body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
    ? body.settings as { agentBehavior?: string; codeStyle?: string }
    : undefined;
  const verifierRaw = body.verifier && typeof body.verifier === "object" && !Array.isArray(body.verifier)
    ? body.verifier as Record<string, unknown>
    : {};
  const observerRaw = verifierRaw.observer && typeof verifierRaw.observer === "object" && !Array.isArray(verifierRaw.observer)
    ? verifierRaw.observer as Record<string, unknown>
    : null;
  const observer: RuntimeAgentInput | undefined = observerRaw &&
    typeof observerRaw.id === "string" && typeof observerRaw.model === "string" && typeof observerRaw.provider === "string"
    ? {
        id: observerRaw.id,
        name: typeof observerRaw.name === "string" ? observerRaw.name : "Observer",
        role: typeof observerRaw.role === "string" ? observerRaw.role : "Verifier",
        provider: observerRaw.provider as ProviderId,
        model: observerRaw.model,
        budgetUsd: budgetUsd(observerRaw.budgetUsd),
      }
    : undefined;

  const result = await runAgentRuntime({
    uid: user.id,
    prompt,
    agents,
    vault: (body.vault ?? {}) as Record<string, { key?: string; apiKey?: string; endpoint?: string } | string | undefined>,
    settings,
    reasoningEffort: (body.reasoningEffort as "off" | "low" | "medium" | "high" | "extra-high") || undefined,
    runId: typeof body.runId === "string" ? body.runId : undefined,
    mode: body.mode === "fanout" ? "fanout" : "pipeline",
    concurrency: typeof body.concurrency === "number" ? body.concurrency : undefined,
    evolve: body.evolve === true,
    verifier: {
      minChars: typeof verifierRaw.minChars === "number" ? verifierRaw.minChars : undefined,
      maxChars: typeof verifierRaw.maxChars === "number" ? verifierRaw.maxChars : undefined,
      requireSections: Array.isArray(verifierRaw.requireSections)
        ? verifierRaw.requireSections.filter((s): s is string => typeof s === "string")
        : undefined,
      observer,
    },
  });

  return NextResponse.json({
    ok: result.ok,
    prompt: result.prompt,
    succeeded: result.succeeded,
    total: result.total,
    results: result.results,
    runId: result.runId,
    messages: result.messages,
    consensus: result.consensus,
    meta: result.meta,
  });
}
