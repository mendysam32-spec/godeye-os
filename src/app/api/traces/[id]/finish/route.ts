import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { appendEvent, finishRun } from "@/lib/traces";
import type { RunStatus } from "@/lib/foundation";

const STATUSES: RunStatus[] = ["completed", "failed", "aborted"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const status = STATUSES.includes(body.status as RunStatus) ? body.status as RunStatus : "completed";
  const error = typeof body.error === "string" ? body.error : null;
  const run = await finishRun(user.id, id, status, error);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  await appendEvent({
    uid: user.id,
    runId: id,
    type: `run.${status}`,
    payload: { error, endedAt: run.endedAt },
  });
  return NextResponse.json({ run });
}
