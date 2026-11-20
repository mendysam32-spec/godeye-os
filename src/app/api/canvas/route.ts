import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { applyCanvasOps, listCanvas } from "@/lib/canvas";
import { DEFAULT_CANVAS_BOARD } from "@/lib/foundation";

/** Read a board including tombstones so peers can merge deletions correctly. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const boardId = (req.nextUrl.searchParams.get("boardId") || DEFAULT_CANVAS_BOARD).slice(0, 80);
  const state = await listCanvas(user.id, boardId);
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}

/** Push local CRDT registers. Ownership is always derived from the session. */
export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const nodes = Array.isArray(body.nodes) ? body.nodes.filter((n): n is Record<string, unknown> => !!n && typeof n === "object") : [];
  const edges = Array.isArray(body.edges) ? body.edges.filter((e): e is Record<string, unknown> => !!e && typeof e === "object") : [];
  if (!nodes.length && !edges.length) return NextResponse.json({ error: "No canvas operations supplied" }, { status: 400 });
  const boardId = typeof body.boardId === "string" && body.boardId.trim() ? body.boardId.trim().slice(0, 80) : DEFAULT_CANVAS_BOARD;
  const state = await applyCanvasOps(user.id, {
    nodes: nodes.map((n) => ({ ...n, boardId: n.boardId ? String(n.boardId).slice(0, 80) : boardId })),
    edges: edges.map((e) => ({ ...e, boardId: e.boardId ? String(e.boardId).slice(0, 80) : boardId })),
  });
  return NextResponse.json(state);
}
