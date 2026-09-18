import { NextRequest, NextResponse } from "next/server";
import { OWNER_EMAIL, getState, saveState } from "@/lib/auth";
import { randomBytes } from "node:crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const { username, email } = await req.json().catch(() => ({}));
  const uname = String(username || "").trim();
  const mail = String(email || "").trim().toLowerCase();

  if (uname.length < 3 || uname.length > 32 || !/^[a-zA-Z0-9_\-\.]+$/.test(uname)) {
    return NextResponse.json({ error: "Username must be 3-32 characters (letters, numbers, _ - .)." }, { status: 400 });
  }
  if (!EMAIL_RE.test(mail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const state = await getState();
  const takenUser = state.users.some((u) => u.username.toLowerCase() === uname.toLowerCase() || u.email.toLowerCase() === mail);
  const takenReq = state.requests.some((r) => r.status === "pending" && (r.username.toLowerCase() === uname.toLowerCase() || r.email.toLowerCase() === mail));
  if (takenUser || takenReq) {
    return NextResponse.json({ error: "That username or email is already registered or pending." }, { status: 409 });
  }

  state.requests.unshift({
    id: randomBytes(6).toString("hex"),
    username: uname,
    email: mail,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  await saveState(state);

  return NextResponse.json({ ok: true, ownerEmail: OWNER_EMAIL, message: "Request sent. The owner will create your account." });
}