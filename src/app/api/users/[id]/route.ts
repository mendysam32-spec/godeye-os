import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getState, saveState, hashPassword, type AuthRole } from "@/lib/auth";
import { randomBytes } from "node:crypto";

function generatePassword(): string {
  return randomBytes(6).toString("base64url").slice(0, 10);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const state = await getState();
  const user = state.users.find((u) => u.id === id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const isSelf = user.id === admin.id;
  const otherAdmin = user.role === "admin" && !isSelf;

  if (body.resetPassword === true) {
    const generated = generatePassword();
    user.passwordHash = await hashPassword(generated);
    user.updatedAt = new Date().toISOString();
    await saveState(state);
    return NextResponse.json({ ok: true, generatedPassword: generated, message: `New password for "${user.username}" generated.` });
  }

  if (body.password !== undefined && body.password !== null && String(body.password).length > 0) {
    user.passwordHash = await hashPassword(String(body.password));
    user.updatedAt = new Date().toISOString();
    await saveState(state);
    return NextResponse.json({ ok: true, message: `Password reset for "${user.username}".` });
  }

  if (body.role !== undefined) {
    const nextRole: AuthRole = body.role === "admin" ? "admin" : "user";
    if (isSelf && nextRole !== "admin") return NextResponse.json({ error: "You cannot demote your own admin account." }, { status: 400 });
    if (otherAdmin && nextRole !== "admin") return NextResponse.json({ error: "You cannot demote another admin." }, { status: 400 });
    if ((state.users.filter((u) => u.role === "admin").length <= 1) && nextRole !== "admin") {
      return NextResponse.json({ error: "At least one admin is required." }, { status: 400 });
    }
    user.role = nextRole;
    user.updatedAt = new Date().toISOString();
    await saveState(state);
    return NextResponse.json({ ok: true, message: `Role updated for "${user.username}".` });
  }

  if (body.displayName !== undefined) {
    user.displayName = String(body.displayName || user.username);
    user.updatedAt = new Date().toISOString();
    await saveState(state);
    return NextResponse.json({ ok: true, message: "Profile updated." });
  }

  if (body.enabled !== undefined) {
    const next = Boolean(body.enabled);
    if (isSelf && !next) return NextResponse.json({ error: "You cannot disable your own account." }, { status: 400 });
    if (otherAdmin && !next) return NextResponse.json({ error: "You cannot disable another admin." }, { status: 400 });
    user.enabled = next;
    user.updatedAt = new Date().toISOString();
    await saveState(state);
    return NextResponse.json({ ok: true, message: next ? `"${user.username}" enabled.` : `"${user.username}" disabled.` });
  }

  return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const { id } = await params;

  const state = await getState();
  const user = state.users.find((u) => u.id === id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.id === admin.id) return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  if (user.role === "admin") return NextResponse.json({ error: "Admin accounts cannot be deleted." }, { status: 400 });

  state.users = state.users.filter((u) => u.id !== id);
  for (const [token, s] of Object.entries(state.sessions)) {
    if (s.uid === id) delete state.sessions[token];
  }
  await saveState(state);
  return NextResponse.json({ ok: true, message: `User "${user.username}" deleted.` });
}