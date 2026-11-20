import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mergeMemoryBranch } from "@/lib/memory";

/** Merge a fork's insights into a target branch, preserving provenance. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id: sourceId } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const targetId = typeof body.targetId === "string" ? body.targetId : "main";
  const result = await mergeMemoryBranch(user.id, sourceId, targetId);
  return NextResponse.json(result);
}
