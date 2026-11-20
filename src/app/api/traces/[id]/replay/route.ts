import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { newId } from "@/lib/foundation";
import { buildReplaySpec } from "@/lib/replay";
import { appendEvent, getRun, replayInput, startRun } from "@/lib/traces";

/**
 * Prepare a divergence branch. The returned `runId` is created up front so the
 * subsequent `/api/chat` call reuses it and the whole branch stays one run.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id } = await params;

  const detail = await getRun(user.id, id);
  if (!detail) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  let spec;
  try {
    spec = buildReplaySpec(detail.run, replayInput(detail.run), {
      provider: typeof body.provider === "string" ? body.provider : null,
      model: typeof body.model === "string" ? body.model : null,
      reasoningEffort: typeof body.reasoningEffort === "string" ? body.reasoningEffort : null,
      temperature: typeof body.temperature === "number" ? body.temperature : null,
      contextNote: typeof body.contextNote === "string" ? body.contextNote : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "Invalid replay overrides" }, { status: 400 });
  }

  const runId = newId("run");
  await startRun({
    id: runId,
    uid: user.id,
    kind: "chat",
    prompt: spec.prompt,
    inputSnapshot: spec,
    provider: spec.provider,
    model: spec.model,
    mode: spec.mode,
    chatId: spec.chatId,
    parentRunId: id,
    replayOf: spec.replayOf,
    divergence: spec.divergence,
  });
  await appendEvent({
    uid: user.id,
    runId: id,
    type: "replay.forked",
    payload: { childRunId: runId, divergence: spec.divergence },
  });
  await appendEvent({
    uid: user.id,
    runId,
    type: "replay.started",
    payload: { parentRunId: id, replayOf: spec.replayOf, divergence: spec.divergence },
  });

  return NextResponse.json({ runId, spec });
}
