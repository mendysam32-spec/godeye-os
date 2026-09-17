"use client";
import { useEffect, useState } from "react";
import { useGodEye } from "@/lib/store";
import { Lock, Eye } from "lucide-react";

export function AppLock({ children }: { children: React.ReactNode }) {
  const { settings } = useGodEye();
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!settings.appLockEnabled || !settings.lockPin) {
      setUnlocked(true);
      return;
    }
    // check sessionStorage for unlock in this tab
    const v = sessionStorage.getItem("godeye-unlocked");
    if (v === "1") setUnlocked(true);
    else setUnlocked(false);
  }, [settings.appLockEnabled, settings.lockPin]);

  if (unlocked) return <>{children}</>;
  if (!settings.appLockEnabled || !settings.lockPin || settings.lockPin.length < 4) return <>{children}</>;

  function tryUnlock() {
    if (pin === settings.lockPin) {
      sessionStorage.setItem("godeye-unlocked", "1");
      setUnlocked(true);
      setErr("");
    } else {
      setErr("Wrong PIN");
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-xl text-center">
        <div className="h-12 w-12 rounded-2xl bg-foreground text-background grid place-items-center mx-auto"><Eye className="h-6 w-6"/></div>
        <div className="mt-3 font-semibold">GodEye is locked</div>
        <div className="text-xs text-muted-foreground">Enter PIN to continue • Local only • Disable in Settings</div>
        <div className="mt-4 flex gap-2">
          <input value={pin} onChange={e=>setPin(e.target.value.replace(/[^0-9]/g,"").slice(0,8))} onKeyDown={e=>{ if(e.key==="Enter") tryUnlock(); }} placeholder="••••" type="password" autoFocus className="flex-1 rounded-xl border bg-muted px-3 py-2.5 text-center text-lg tracking-widest outline-none focus:ring-2 focus:ring-foreground/10"/>
        </div>
        {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
        <button onClick={tryUnlock} className="mt-4 w-full rounded-full bg-foreground text-background py-2.5 text-sm font-medium inline-flex items-center justify-center gap-2"><Lock className="h-4 w-4"/> Unlock</button>
        <div className="mt-3 text-xs text-muted-foreground">Forgot PIN? Clear `godeye-os-v1` in localStorage or disable via devtools.</div>
      </div>
    </div>
  );
}
