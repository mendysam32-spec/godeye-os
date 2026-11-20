import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { newId, type RunKind } from "@/lib/foundation";
import { listRuns, startRun } from "@/lib/traces";

const RUN_KINDS: RunKind[] = ["chat", "workforce", "media", "terminal", "skill"];

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
  const runs = await listRuns(user.id, limit);
  return NextResponse.json({ runs });
}

/** Start (or reuse) a run id before a non-chat pipeline, e.g. media generation. */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.prompt !== "string") {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }
  const kind = RUN_KINDS.includes(body.kind as RunKind) ? body.kind as RunKind : "chat";
  const run = await startRun({
    id: typeof body.id === "string" && body.id ? body.id : newId("run"),
    uid: user.id,
    kind,
    prompt: body.prompt,
    inputSnapshot: body.inputSnapshot,
    provider: typeof body.provider === "string" ? body.provider : null,
    model: typeof body.model === "string" ? body.model : null,
    mode: typeof body.mode === "string" ? body.mode : null,
    chatId: typeof body.chatId === "string" ? body.chatId : null,
  });
  return NextResponse.json({ run });
}
