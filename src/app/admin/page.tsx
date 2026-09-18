"use client";
import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { useGodEye } from "@/lib/store";
import { Users as UsersIcon, UserPlus, KeyRound, Trash2, Power, ShieldCheck, Copy, Loader2, RefreshCw, AlertTriangle, Mail, X } from "lucide-react";

interface AdminUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: string;
  enabled: boolean;
  createdAt: string;
}

interface AccessRequestItem {
  id: string;
  username: string;
  email: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
}

function copy(text: string) {
  navigator.clipboard.writeText(text);
}

export default function AdminPage() {
  const currentUser = useGodEye((s) => s.currentUser);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [requests, setRequests] = useState<AccessRequestItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ text: string; password?: string; kind: "ok" | "err" } | null>(null);
  const [busy, setBusy] = useState(false);

  // create form
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "user", displayName: "" });

  const refresh = useCallback(async () => {
    const res = await fetch("/api/users", { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      setUsers(j.users);
      setRequests(j.requests);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  if (currentUser?.role !== "admin") {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="text-center text-sm text-muted-foreground">
          <ShieldCheck className="h-8 w-8 mx-auto mb-3 opacity-40" />
          Admins only. Sign in with the owner account to manage users.
        </div>
      </div>
    );
  }

  async function createUser() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          email: form.email,
          password: form.password || undefined,
          role: form.role,
          displayName: form.displayName || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ text: j.error || "Failed to create user.", kind: "err" });
      } else {
        setMsg({ text: j.message || "User created.", password: j.generatedPassword, kind: "ok" });
        setForm({ username: "", email: "", password: "", role: "user", displayName: "" });
        await refresh();
      }
    } catch {
      setMsg({ text: "Network error.", kind: "err" });
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(id: string) {
    if (!window.confirm("Generate a new random password for this user?")) return;
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetPassword: true }),
    });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? { text: j.message, password: j.generatedPassword, kind: "ok" } : { text: j.error || "Failed.", kind: "err" });
  }

  async function toggleEnabled(u: AdminUser) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !u.enabled }),
    });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? { text: j.message, kind: "ok" } : { text: j.error || "Failed.", kind: "err" });
    await refresh();
  }

  async function removeUser(u: AdminUser) {
    if (!window.confirm(`Delete user "${u.username}"? Their saved work stays in local storage but they can no longer sign in.`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? { text: j.message, kind: "ok" } : { text: j.error || "Failed.", kind: "err" });
    await refresh();
  }

  async function handleRequest(r: AccessRequestItem, action: "approve" | "deny") {
    setMsg(null);
    const res = await fetch(`/api/requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = await res.json().catch(() => ({}));
    if (action === "approve") {
      setMsg(res.ok ? { text: `${j.message} Give this user the credentials.`, password: j.generatedPassword, kind: "ok" } : { text: j.error || "Failed.", kind: "err" });
    } else {
      setMsg(res.ok ? { text: j.message, kind: "ok" } : { text: j.error || "Failed.", kind: "err" });
    }
    await refresh();
  }

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <UsersIcon className="h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold text-sm md:text-base leading-tight">Users & access</div>
              <div className="text-[11px] md:text-xs text-muted-foreground truncate">Only you (admin) can create accounts and reset passwords</div>
            </div>
          </div>
          <button onClick={refresh} className="p-2 rounded-lg border bg-card text-muted-foreground hover:text-foreground shrink-0" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
          {msg && (
            <div className={`rounded-2xl border p-4 ${msg.kind === "ok" ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className={`text-sm ${msg.kind === "ok" ? "text-emerald-800" : "text-amber-800"}`}>{msg.text}</div>
                <button onClick={() => setMsg(null)} className="p-1 rounded hover:bg-black/5"><X className="h-4 w-4" /></button>
              </div>
              {msg.password && (
                <div className="mt-3 flex items-center gap-2">
                  <code className="rounded-lg bg-white border px-3 py-1.5 text-sm font-mono select-all">{msg.password}</code>
                  <button onClick={() => copy(msg.password!)} className="p-2 rounded-lg border bg-white" title="Copy password">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs italic text-muted-foreground">Temp password — share it once.</span>
                </div>
              )}
            </div>
          )}

          {/* Create user */}
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2 font-medium"><UserPlus className="h-4 w-4" /> Create a new user</div>
            <p className="text-xs text-muted-foreground mt-1">New users request access by emailing mendysam32@gmail.com — create their account here and give them the credentials.</p>
            <div className="mt-4 grid md:grid-cols-2 gap-3">
              <label className="block"><span className="text-xs font-medium">Username</span>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. james" className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none" />
              </label>
              <label className="block"><span className="text-xs font-medium">Email</span>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" placeholder="james@example.com" className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none" />
              </label>
              <label className="block"><span className="text-xs font-medium">Display name</span>
                <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="James" className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none" />
              </label>
              <label className="block"><span className="text-xs font-medium">Password <span className="text-muted-foreground font-normal">(blank = auto-generate)</span></span>
                <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="leave blank to generate" className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none" />
              </label>
              <label className="block"><span className="text-xs font-medium">Role</span>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm">
                  <option value="user">User — only sees their own work</option>
                  <option value="admin">Admin — can manage users</option>
                </select>
              </label>
            </div>
            <button onClick={createUser} disabled={busy || !form.username.trim() || !form.email.trim()} className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Create user
            </button>
            {pending.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <span className="inline-flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> {pending.length} pending access request{pending.length > 1 ? "s" : ""}</span>
              </div>
            )}
          </div>

          {/* Pending requests */}
          {pending.length > 0 && (
            <div className="rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-2 font-medium"><Mail className="h-4 w-4" /> Access requests</div>
              <div className="mt-3 space-y-2">
                {pending.map((r) => (
                  <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border bg-background p-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">@{r.username}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleRequest(r, "approve")} className="rounded-full bg-foreground text-background px-4 py-2 text-xs font-medium">Approve & create</button>
                      <button onClick={() => handleRequest(r, "deny")} className="rounded-full border px-4 py-2 text-xs text-muted-foreground hover:text-red-600">Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User list */}
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2 font-medium"><UsersIcon className="h-4 w-4" /> Accounts ({users.length})</div>
            {!loaded ? (
              <div className="mt-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : (
              <div className="mt-3">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-xl border bg-background p-3 mb-2">
                    <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-sm font-medium shrink-0">{(u.displayName || u.username).slice(0, 2).toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-medium truncate">
                        {u.username}
                        <span className={`text-[10px] rounded-full px-1.5 py-0.5 leading-none ${u.role === "admin" ? "bg-foreground text-background" : "bg-muted"}`}>{u.role}</span>
                        {!u.enabled && <span className="text-[10px] rounded-full bg-red-100 text-red-600 px-1.5 py-0.5 leading-none">disabled</span>}
                        {u.id === currentUser?.id && <span className="text-[10px] rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 leading-none">you</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => handleReset(u.id)} title="Reset password" className="p-2 rounded-lg border bg-background hover:bg-muted"><KeyRound className="h-3.5 w-3.5" /></button>
                      <button onClick={() => toggleEnabled(u)} disabled={u.id === currentUser?.id} title={u.enabled ? "Disable" : "Enable"} className="p-2 rounded-lg border bg-background hover:bg-muted disabled:opacity-30"><Power className={`h-3.5 w-3.5 ${u.enabled ? "" : "text-muted-foreground"}`} /></button>
                      <button onClick={() => removeUser(u)} disabled={u.id === currentUser?.id || u.role === "admin"} title="Delete" className="p-2 rounded-lg border bg-background hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-foreground text-background p-5 text-sm flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <div>
              <div className="font-medium">How access works</div>
              <div className="mt-1 text-xs opacity-75 leading-relaxed">
                New users must request through you. Only your admin account can create users or reset forgotten passwords (they email mendysam32@gmail.com). Each account only ever sees its own chats, projects and providers — nobody else&apos;s saved work.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}