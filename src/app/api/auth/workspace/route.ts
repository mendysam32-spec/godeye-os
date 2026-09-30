import { NextRequest, NextResponse } from "next/server";
import { getWorkspace, requireUser, saveWorkspace } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const stored = await getWorkspace(user.id);
  const data = { ...(stored as Record<string, unknown>) };
  // Chats are owned by /api/chat/sync since Phase 1. Legacy workspaces still
  // carry a whole chat array; serve it exactly once so the client can import
  // it into D1, then drop it so it can never clobber merged chat state.
  if (Array.isArray(data.chats)) {
    delete data.chats;
    await saveWorkspace(user.id, data);
  }
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const data = body?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ ok: false, error: "Invalid workspace payload" }, { status: 400 });
  }
  if ("chats" in data) {
    const rest = { ...(data as Record<string, unknown>) };
    delete rest.chats;
    await saveWorkspace(user.id, rest);
    return NextResponse.json({ ok: true });
  }
  await saveWorkspace(user.id, data);
  return NextResponse.json({ ok: true });
}