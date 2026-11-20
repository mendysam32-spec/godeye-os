import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { appendEvent } from "@/lib/traces";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.runId !== "string" || typeof body.type !== "string") {
    return NextResponse.json({ error: "runId and type required" }, { status: 400 });
  }
  const event = await appendEvent({
    uid: user.id,
    runId: body.runId,
    type: body.type,
    payload: body.payload,
  });
  return NextResponse.json({ event, ok: !!event });
}
