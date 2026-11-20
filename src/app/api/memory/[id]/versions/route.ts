import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listMemoryVersions, revertMemory } from "@/lib/memory";

/** Git-like history for a single memory record. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id } = await params;
  const versions = await listMemoryVersions(user.id, id);
  return NextResponse.json({ versions });
}

/** Restore an older commit as a new commit; history is never rewritten. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const version = Number(body.version);
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: "A positive integer version is required" }, { status: 400 });
  }
  const memory = await revertMemory(user.id, id, version);
  if (!memory) return NextResponse.json({ error: "Memory or version not found" }, { status: 404 });
  const versions = await listMemoryVersions(user.id, id);
  return NextResponse.json({ memory, versions });
}
