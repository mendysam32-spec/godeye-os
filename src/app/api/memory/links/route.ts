import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isMemoryRelation } from "@/lib/foundation";
import { getMemoryGraph, linkMemories, unlinkMemories } from "@/lib/memory";

/** The queryable memory graph: nodes plus typed edges. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  return NextResponse.json(await getMemoryGraph(user.id));
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const fromId = typeof body.fromId === "string" ? body.fromId : "";
  const toId = typeof body.toId === "string" ? body.toId : "";
  if (!fromId || !toId) return NextResponse.json({ error: "fromId and toId are required" }, { status: 400 });
  const relation = isMemoryRelation(body.relation) ? body.relation : "related";
  const weight = typeof body.weight === "number" && Number.isFinite(body.weight) ? body.weight : 1;
  const link = await linkMemories(user.id, fromId, toId, relation, weight);
  if (!link) return NextResponse.json({ error: "Could not create link" }, { status: 400 });
  return NextResponse.json({ link });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const ok = await unlinkMemories(user.id, id);
  return NextResponse.json({ ok });
}
