import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, sanitizeUser, getState, saveState, hashPassword, type AuthRole } from "@/lib/auth";
import { randomBytes } from "node:crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generatePassword(): string {
  return randomBytes(6).toString("base64url").slice(0, 10);
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const state = await getState();
  return NextResponse.json({
    ok: true,
    users: state.users.map(sanitizeUser),
    requests: state.requests,
    me: admin,
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { username, email, password, role, displayName } = await req.json().catch(() => ({}));
  const uname = String(username || "").trim();
  const mail = String(email || "").trim().toLowerCase();

  if (uname.length < 3 || uname.length > 32 || !/^[a-zA-Z0-9_\-\.]+$/.test(uname)) {
    return NextResponse.json({ error: "Username must be 3-32 characters (letters, numbers, _ - .)." }, { status: 400 });
  }
  if (!EMAIL_RE.test(mail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const userRole: AuthRole = role === "admin" ? "admin" : "user";
  const generated = !password || String(password).length < 4;
  const finalPassword = generated ? generatePassword() : String(password);

  const state = await getState();
  if (state.users.some((u) => u.username.toLowerCase() === uname.toLowerCase())) {
    return NextResponse.json({ error: `Username "${uname}" is already taken.` }, { status: 409 });
  }
  if (state.users.some((u) => u.email.toLowerCase() === mail)) {
    return NextResponse.json({ error: "That email is already registered." }, { status: 409 });
  }

  const user = {
    id: randomBytes(8).toString("hex"),
    username: uname,
    email: mail,
    displayName: String(displayName || uname),
    role: userRole,
    enabled: true,
    failedAttempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    passwordHash: await hashPassword(finalPassword),
  };

  // link any pending request with the same identity
  state.requests = state.requests.map((r) =>
    (r.status === "pending" && (r.username.toLowerCase() === uname.toLowerCase() || r.email.toLowerCase() === mail)) ? { ...r, status: "approved" as const } : r
  );

  state.users.push(user);
  await saveState(state);

  return NextResponse.json(
    { ok: true, user: sanitizeUser(user), generatedPassword: generated ? finalPassword : undefined, message: generated ? "Create the user now" : `Account "${uname}" created` },
    { status: 201 }
  );
}