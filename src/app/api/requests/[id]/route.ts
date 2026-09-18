import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getState, saveState, hashPassword, sanitizeUser } from "@/lib/auth";
import { randomBytes } from "node:crypto";

function generatePassword(): string {
  return randomBytes(6).toString("base64url").slice(0, 10);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { id } = await params;

  const { action } = await req.json().catch(() => ({}));
  if (!["approve", "deny"].includes(action || "")) {
    return NextResponse.json({ error: "action must be 'approve' or 'deny'" }, { status: 400 });
  }

  const state = await getState();
  const request = state.requests.find((r) => r.id === id && r.status === "pending");
  if (!request) return NextResponse.json({ error: "Request not found or already handled." }, { status: 404 });

  if (action === "deny") {
    request.status = "denied";
    await saveState(state);
    return NextResponse.json({ ok: true, message: `Access request from "${request.username}" denied.` });
  }

  // approve -> create the account
  const taken =
    state.users.some((u) => u.username.toLowerCase() === request.username.toLowerCase()) ||
    state.users.some((u) => u.email.toLowerCase() === request.email.toLowerCase());
  if (taken) {
    request.status = "denied";
    await saveState(state);
    return NextResponse.json({ error: "Username or email is already registered. Request marked denied." }, { status: 409 });
  }

  const password = generatePassword();
  const user = {
    id: randomBytes(8).toString("hex"),
    username: request.username,
    email: request.email,
    displayName: request.username,
    role: "user" as const,
    enabled: true,
    failedAttempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    passwordHash: await hashPassword(password),
  };

  request.status = "approved";
  state.users.push(user);
  await saveState(state);

  return NextResponse.json({
    ok: true,
    user: sanitizeUser(user),
    generatedPassword: password,
    message: `Account "${user.username}" created.`,
  });
}