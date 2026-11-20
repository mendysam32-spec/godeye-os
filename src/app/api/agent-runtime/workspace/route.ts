import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listWorkspace, writeWorkspaceValue } from "@/lib/agent-runtime";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const runId = req.nextUrl.searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
  return NextResponse.json({ workspace: await listWorkspace(user.id, runId) });
}

/** Optimistic-concurrency write: pass `expectRevision` to get 409 on conflict. */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const runId = typeof body.runId === "string" ? body.runId : "";
  const key = typeof body.key === "string" ? body.key : "";
  const value = body.value && typeof body.value === "object" && !Array.isArray(body.value)
    ? body.value as Record<string, unknown>
    : {};
  if (!runId || !key) return NextResponse.json({ error: "runId and key are required" }, { status: 400 });
  const expectRevision = typeof body.expectRevision === "number" ? body.expectRevision : null;
  const result = await writeWorkspaceValue({
    uid: user.id, runId, key, value, expectRevision,
    label: typeof body.label === "string" ? body.label : undefined,
  });
  if (result.conflict) {
    return NextResponse.json({ error: "Workspace revision changed", current: result.entry }, { status: 409 });
  }
  return NextResponse.json({ entry: result.entry });
}
