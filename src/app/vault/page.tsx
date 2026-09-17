"use client";
import { Sidebar } from "@/components/sidebar";
import { PROVIDERS } from "@/lib/providers";
import { useGodEye } from "@/lib/store";
import { useState } from "react";
import { Check, Eye, EyeOff, PlugZap, Shield, Loader2, AlertCircle } from "lucide-react";

export default function VaultPage() {
  const { vault, setVaultKey, clearVaultKey } = useGodEye();
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  async function connect(p: any, val: string) {
    if (!val.trim()) return;
    setTesting((s) => ({ ...s, [p.id]: true }));
    setMsg((s) => ({ ...s, [p.id]: undefined as any }));
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p.id, apiKey: val.trim() }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        setVaultKey(p.id, val.trim(), true);
        setMsg((s) => ({ ...s, [p.id]: { ok: true, text: "Live verified • connected" } }));
      } else {
        // allow save even if test fails (e.g. demo key) but mark unverified
        setVaultKey(p.id, val.trim(), false);
        setMsg((s) => ({ ...s, [p.id]: { ok: false, text: j.message || j.error || "Key saved but verification failed — check key/model" } }));
      }
    } catch (e: any) {
      setVaultKey(p.id, val.trim(), false);
      setMsg((s) => ({ ...s, [p.id]: { ok: false, text: e.message || "Network error — saved locally" } }));
    } finally {
      setTesting((s) => ({ ...s, [p.id]: false }));
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-6 h-16 flex items-center justify-between">
          <div><div className="font-semibold">Providers Vault</div><div className="text-xs text-muted-foreground">Link API keys — agents load by provider (live verified)</div></div>
          <div className="text-xs flex items-center gap-2"><Shield className="h-3.5 w-3.5"/> Encrypted per workspace • Live tested</div>
        </div>
        <div className="p-6 max-w-6xl mx-auto">
          <div className="rounded-2xl border bg-amber-50 border-amber-200 p-4 text-sm flex gap-3">
            <PlugZap className="h-5 w-5 text-amber-600 shrink-0"/>
            <div><div className="font-medium">Agents load by API providers — live</div><div className="text-muted-foreground">Connect Nvidia, OpenRouter, OmeRoute and more. Click Connect to live-verify the key against the provider. Switch models per agent on the Workforce canvas. Fallback auto-routes if a provider fails.</div></div>
          </div>

          <div className="mt-6 grid md:grid-cols-2 gap-4">
            {PROVIDERS.map(p => {
              const v = vault[p.id];
              const isConnected = !!v?.connected;
              const val = draft[p.id] ?? v?.key ?? "";
              const m = msg[p.id];
              return (
                <div key={p.id} className={`rounded-2xl border p-5 ${isConnected ? "bg-card border-emerald-200" : "bg-card"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl grid place-items-center text-white text-sm" style={{background: p.color}}>{p.icon}</div>
                      <div><div className="font-medium text-sm flex items-center gap-2">{p.name} {isConnected && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3"/> connected</span>}{!isConnected && v?.key && <span className="text-xs text-amber-600">saved • not verified</span>}</div>
                      <div className="text-xs text-muted-foreground">{p.baseUrl}</div></div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-medium">API Key</div>
                    <div className="mt-1 flex gap-2">
                      <div className="relative flex-1">
                        <input type={visible[p.id] ? "text" : "password"} value={val} onChange={e=>setDraft(d=>({...d, [p.id]: e.target.value}))}
                          placeholder={p.keyPlaceholder} className="w-full rounded-xl border bg-muted px-3 py-2.5 text-sm pr-9 outline-none"/>
                        <button onClick={()=>setVisible(s=>({...s, [p.id]: !s[p.id]}))} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
                          {visible[p.id] ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2 items-center flex-wrap">
                      <button onClick={()=>connect(p, val)} disabled={!!testing[p.id]} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-medium disabled:opacity-50">
                        {testing[p.id] && <Loader2 className="h-3 w-3 animate-spin"/>} {testing[p.id] ? "Verifying..." : "Connect & verify"}
                      </button>
                      {v?.key && <button onClick={()=>{ clearVaultKey(p.id); setDraft(d=>{const n={...d}; delete n[p.id]; return n;}); setMsg(s=>{const n={...s}; delete n[p.id]; return n;});}} className="rounded-full border px-4 py-1.5 text-xs">Disconnect</button>}
                      <span className="text-xs text-muted-foreground">{p.models.slice(0,2).map(x=>x.id).join(" • ")} • {p.models.length} models</span>
                    </div>
                    {m && <div className={`mt-2 text-xs flex gap-1.5 p-2 rounded-xl border ${m.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-800"}`}>{m.ok ? <Check className="h-3.5 w-3.5 mt-0.5"/> : <AlertCircle className="h-3.5 w-3.5 mt-0.5"/>}{m.text}</div>}
                    {v?.lastTested && <div className="mt-1 text-[11px] text-muted-foreground">Last tested {new Date(v.lastTested).toLocaleString()}</div>}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.models.map(mm=>(
                      <span key={mm.id} className="text-[11px] rounded-full bg-muted px-2 py-1">{mm.name} <span className="text-muted-foreground">{mm.context}</span>{mm.starred && " ★"}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
