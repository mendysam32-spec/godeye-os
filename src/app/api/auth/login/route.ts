import { NextRequest, NextResponse } from "next/server";
import {
  OWNER_EMAIL,
  createSession,
  ensureSeed,
  getState,
  lockAccount,
  saveState,
  sanitizeUser,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  await ensureSeed();
  const { username, password } = await req.json().catch(() => ({}));
  const uname = String(username || "").trim();
  const pass = String(password || "");

  if (!uname || !pass) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const state = await getState();
  const user = state.users.find((u) => u.username.toLowerCase() === uname.toLowerCase());

  if (!user) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  if (!user.enabled) {
    return NextResponse.json({ error: "Account disabled. Contact the account owner." }, { status: 403 });
  }

  if (user.lockUntil && Date.parse(user.lockUntil) > Date.now()) {
    return NextResponse.json({ error: "Too many attempts. Try again in ~15 minutes." }, { status: 429 });
  }

  const ok = await verifyPassword(pass, user.passwordHash);
  if (!ok) {
    lockAccount(user);
    user.updatedAt = new Date().toISOString();
    await saveState(state);
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  user.failedAttempts = 0;
  user.lockUntil = undefined;
  user.updatedAt = new Date().toISOString();

  const token = await createSession(user.id, state);
  await saveState(state);

  const res = NextResponse.json({ ok: true, user: sanitizeUser(user), ownerEmail: OWNER_EMAIL });
  setSessionCookie(res, token);
  return res;
}