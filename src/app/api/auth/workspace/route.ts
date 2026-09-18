import { NextRequest, NextResponse } from "next/server";
import { getWorkspace, requireUser, saveWorkspace } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const data = await getWorkspace(user.id);
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
  await saveWorkspace(user.id, data);
  return NextResponse.json({ ok: true });
}