"use client";
import { useCallback, useEffect, useState } from "react";
import { useGodEye, type AuthUserInfo, type WorkspaceData } from "@/lib/store";
import { Eye, Lock, Loader2, Mail, User, ArrowRight, AlertTriangle, X, HelpCircle, UserPlus } from "lucide-react";

const OWNER_EMAIL = "mendysam32@gmail.com";
const LOGOUT_EVENT = "godeye:logout";

type Status = "boot" | "anon" | "authed";

async function syncWorkspace() {
  try {
    const store = useGodEye.getState();
    const res = await fetch("/api/auth/workspace", { cache: "no-store" });
    let remote: WorkspaceData | null = null;
    if (res.ok) {
      remote = ((await res.json().catch(() => ({}))) as { data?: WorkspaceData }).data ?? null;
    }
    const local = store.collectWorkspace();
    const rt = remote?.updatedAt ? Date.parse(remote.updatedAt) : 0;
    const lt = local.updatedAt ? Date.parse(local.updatedAt) : 0;
    if (remote && !Number.isNaN(rt) && rt > lt) {
      useGodEye.getState().applyWorkspace(remote);
    } else {
      useGodEye.getState().markWorkspaceSynced();
      const blob = useGodEye.getState().collectWorkspace();
      await fetch("/api/auth/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: blob }),
      });
    }
  } catch {
    /* keep local data */
  }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("boot");

  const handleLoggedIn = useCallback((user: AuthUserInfo) => {
    useGodEye.getState().loginUser(user);
    setStatus("authed");
    void syncWorkspace();
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      const store = useGodEye.getState();
      if (store.currentUser) {
        store.markWorkspaceSynced();
        const blob = store.collectWorkspace();
        await fetch("/api/auth/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: blob }),
        });
      }
    } catch {
      /* ignore */
    }
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    useGodEye.getState().logoutUser();
    setStatus("anon");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!cancelled) {
          if (res.ok) {
            const { user } = await res.json();
            useGodEye.getState().loginUser(user as AuthUserInfo);
            setStatus("authed");
            void syncWorkspace();
          } else {
            setStatus("anon");
          }
        }
      } catch {
        if (!cancelled) setStatus("anon");
      }
    })();
    window.addEventListener(LOGOUT_EVENT, handleLogout);
    return () => {
      cancelled = true;
      window.removeEventListener(LOGOUT_EVENT, handleLogout);
    };
  }, [handleLogout]);

  if (status === "boot") {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Checking session…</span>
        </div>
      </div>
    );
  }

  if (status === "anon") {
    return <LoginScreen onLoggedIn={handleLoggedIn} />;
  }

  return <>{children}</>;
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: AuthUserInfo) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | "forgot" | "request">(null);
  const [reqName, setReqName] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqMsg, setReqMsg] = useState("");
  const [reqBusy, setReqBusy] = useState(false);

  async function submit() {
    setError("");
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "Login failed.");
        setBusy(false);
        return;
      }
      onLoggedIn(j.user as AuthUserInfo);
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  async function submitRequest() {
    setReqMsg("");
    if (reqName.trim().length < 3 || !/.+@.+\..+/.test(reqEmail)) {
      setReqMsg("Enter a username (3+ chars) and a valid email.");
      return;
    }
    setReqBusy(true);
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: reqName.trim(), email: reqEmail.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReqMsg(j.error || "Request failed.");
      } else {
        setReqMsg("Request sent. The owner will create your account — check your email when it happens.");
        setReqName("");
        setReqEmail("");
      }
    } catch {
      setReqMsg("Network error. Try again.");
    } finally {
      setReqBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-foreground text-background grid place-items-center">
            <Eye className="h-7 w-7" />
          </div>
          <div className="mt-4 text-lg font-semibold tracking-tight">GodEye OS</div>
          <div className="text-sm text-muted-foreground mt-1">Sign in to your workforce</div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="rounded-2xl border bg-card p-6 shadow-xl space-y-4"
        >
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Username</span>
            <div className="relative mt-1">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                className="w-full rounded-xl border bg-muted pl-10 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10"
                placeholder="your username"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Password</span>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                className="w-full rounded-xl border bg-muted pl-10 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10"
                placeholder="••••••••"
              />
            </div>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground pt-1">
            <button type="button" onClick={() => setModal("forgot")} className="inline-flex items-center gap-1 hover:text-foreground">
              <HelpCircle className="h-3.5 w-3.5" /> Forgot password?
            </button>
            <button type="button" onClick={() => setModal("request")} className="inline-flex items-center gap-1 hover:text-foreground">
              <UserPlus className="h-3.5 w-3.5" /> Request access
            </button>
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Work saved here is private to your account.
        </p>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card border p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {modal === "forgot" ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold"><HelpCircle className="h-4 w-4" /> Forgot password?</div>
                  <button onClick={() => setModal(null)} className="p-1 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Password resets are handled by the account owner. Email{" "}
                  <a href={`mailto:${OWNER_EMAIL}?subject=${encodeURIComponent("GodEye password reset request")}&body=${encodeURIComponent("Hi, my password is not working. Please reset it.\nMy username: ")}`} className="font-medium text-foreground underline">
                    {OWNER_EMAIL}
                  </a>{" "}
                  and you will be sent a new password.
                </p>
                <a
                  href={`mailto:${OWNER_EMAIL}?subject=${encodeURIComponent("GodEye password reset request")}&body=${encodeURIComponent(`Hi, my password is not working. Please reset it.\nMy username: ${username}`)}`}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background py-2.5 text-sm font-medium"
                >
                  <Mail className="h-4 w-4" /> Email the owner
                </a>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold"><UserPlus className="h-4 w-4" /> Request access</div>
                  <button onClick={() => setModal(null)} className="p-1 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Only the owner (admin) can create accounts. Send a request here or email{" "}
                  <span className="font-medium text-foreground">{OWNER_EMAIL}</span> directly.
                </p>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium">Desired username</span>
                    <input value={reqName} onChange={(e) => setReqName(e.target.value)} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none" placeholder="e.g. james" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium">Your email</span>
                    <input value={reqEmail} onChange={(e) => setReqEmail(e.target.value)} type="email" className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none" placeholder="you@example.com" />
                  </label>
                  {reqMsg && <div className="rounded-xl border bg-muted p-3 text-xs">{reqMsg}</div>}
                  <button onClick={submitRequest} disabled={reqBusy} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background py-2.5 text-sm font-medium disabled:opacity-50">
                    {reqBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Send access request
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}