import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, clearSessionCookie, deleteSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token) await deleteSession(token);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}