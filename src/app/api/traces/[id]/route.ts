import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getRun, replayInput } from "@/lib/traces";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(_req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id } = await params;
  const detail = await getRun(user.id, id);
  if (!detail) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json({ ...detail, replay: replayInput(detail.run) });
}
