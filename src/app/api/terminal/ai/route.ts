import { NextRequest, NextResponse } from "next/server";
import { callLLM, type ChatMessage } from "@/lib/llm-router";
import type { ProviderId } from "@/lib/providers";
import { requireUser } from "@/lib/auth";

/**
 * Terminal AI — the `/ask` / `?mode` half of the MEDUSA terminal.
 *
 * One non-streamed completion that turns a natural-language question together
 * with the terminal transcript into a short explanation plus runnable shell
 * suggestions. The server parses the fenced bash blocks out of the reply and
 * hands them back as `commands` — the terminal renders them as Run/Insert
 * chips so answers never need hand-copying.
 */

export const maxDuration = 120;

interface AiBody {
  question?: string;
  cwd?: string;
  backend?: string;
  platform?: string;
  provider?: ProviderId;
  model?: string;
  vault?: Record<ProviderId, { key?: string; endpoint?: string; connected?: boolean } | string>;
  transcript?: string[];
  reasoningEffort?: "off" | "low" | "medium" | "high" | "extra-high";
}

function vaultKeyFor(vault: AiBody["vault"], id: string): string | null {
  const v = vault?.[id as ProviderId];
  if (typeof v === "string") return v || null;
  return v?.key ?? null;
}

const SYSTEM = `You are the AI assistant inside the MEDUSA OS terminal ("godseye").
Ground every answer in the recent transcript the user supplies and the platform/backend facts:
- Platform matters for commands (Windows desktop → PowerShell/cmd semantics; cloud sandbox → Debian GNU/Linux bash).
- Be concise: 2-6 short lines of explanation, no preamble, no restating the question.
- After the explanation, include at most 3 candidate commands in bash fenced blocks (one command per block). Commands must be copy-paste ready and adaptive to the platform shown in the facts.
- If the request is not solvable or safe, say so plainly and give the closest safe command.
- Never wrap the whole answer in one fence, never add commentary inside fences.`;

function extractCommands(markdown: string): { reply: string; commands: string[] } {
  const commands: string[] = [];
  const reply = markdown.replace(/```(?:bash|sh|shell|powershell|pwsh|bat|cmd)[^\n]*\n([\s\S]*?)```/g, (_m, body: string) => {
    for (const line of body.trim().split("\n")) {
      const cmd = line.trim();
      if (cmd && !cmd.startsWith("#")) commands.push(cmd);
    }
    return "";
  });
  return { reply: reply.trim(), commands: commands.slice(0, 3) };
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as AiBody | null;
  const question = body?.question?.trim();
  if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });
  if (!body?.provider || !body?.model) return NextResponse.json({ error: "provider and model required" }, { status: 400 });

  const apiKey = vaultKeyFor(body.vault, body.provider);
  if (!apiKey) {
    return NextResponse.json({ error: `No API key for ${body.provider}. Connect it in Providers Vault.` }, { status: 401 });
  }
  const endpointEntry = body.vault?.[body.provider];
  const endpointOverride =
    endpointEntry && typeof endpointEntry === "object" && typeof endpointEntry.endpoint === "string" && endpointEntry.endpoint.trim()
      ? { baseUrl: endpointEntry.endpoint.trim() }
      : undefined;

  const transcript = (body.transcript ?? []).filter((l) => typeof l === "string").slice(-40).join("\n").slice(0, 4000);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        `Facts: platform=${body.platform || (body.backend === "cloud" ? "linux-cloud" : "unknown")}, backend=${body.backend || "unknown"}, cwd=${body.cwd || "/"}.`,
        transcript ? `Recent terminal transcript (oldest → newest):\n${transcript}` : "No prior transcript.",
        `Question: ${question}`,
      ].join("\n\n"),
    },
  ];

  try {
    const result = await callLLM(
      {
        provider: body.provider,
        model: body.model,
        messages,
        temperature: 0.2,
        maxTokens: 600,
        reasoningEffort: body.reasoningEffort === undefined ? "medium" : body.reasoningEffort,
      },
      apiKey,
      endpointOverride
    );
    const { reply, commands } = extractCommands(result.content || "");
    return NextResponse.json({
      ok: true,
      reply: reply || result.content || "(empty answer)",
      commands,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      usage: result.usage,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message || e) }, { status: 502 });
  }
}
