"use client";
import { Sidebar } from "@/components/sidebar";
import { PROVIDERS } from "@/lib/providers";
import { useGodEye } from "@/lib/store";
import { useState, useEffect } from "react";
import { Check, Eye, EyeOff, PlugZap, Shield, Loader2, AlertCircle, Lock, Download } from "lucide-react";
import { encryptKey, decryptKey, maskKey } from "@/lib/vault-crypto";

export default function VaultPage() {
  const { vault, setVaultKey, clearVaultKey } = useGodEye();
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [endpoint, setEndpoint] = useState<Record<string, string>>({});
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  // decrypt stored keys for display (masked when not visible)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(vault as any)) {
        if ((v as any)?.key) out[k] = await decryptKey((v as any).key);
      }
      if (!cancelled) setDecrypted(out);
    })();
    return () => { cancelled = true; };
  }, [vault]);

  async function connect(p: any, val: string, ep?: string) {
    if (!val.trim()) return;
    setTesting((s) => ({ ...s, [p.id]: true }));
    setMsg((s) => ({ ...s, [p.id]: undefined as any }));
    const cleanEp = ep?.trim() || "";
    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: p.id, apiKey: val.trim(), ...(cleanEp ? { endpoint: cleanEp } : {}) }),
      });
      const j = await res.json();
      const enc = await encryptKey(val.trim());
      if (res.ok && j.ok) {
        setVaultKey(p.id, enc, true, cleanEp || undefined);
        setMsg((s) => ({ ...s, [p.id]: { ok: true, text: "Live verified • connected — encrypted at rest" } }));
        setDraft(d => { const n = { ...d }; delete n[p.id]; return n; });
      } else {
        setVaultKey(p.id, enc, false, cleanEp || undefined);
        setMsg((s) => ({ ...s, [p.id]: { ok: false, text: j.message || j.error || "Key saved encrypted but verification failed — check key/endpoint/model" } }));
      }
    } catch (e: any) {
      const enc = await encryptKey(val.trim());
      setVaultKey(p.id, enc, false, cleanEp || undefined);
      setMsg((s) => ({ ...s, [p.id]: { ok: false, text: e.message || "Network error — saved encrypted locally" } }));
    } finally {
      setTesting((s) => ({ ...s, [p.id]: false }));
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <div className="min-w-0"><div className="font-semibold text-sm md:text-base">Providers Vault</div><div className="text-xs text-muted-foreground truncate">Link API keys — live verified • encrypted at rest</div></div>
          <div className="text-xs flex items-center gap-1.5 shrink-0"><Shield className="h-3.5 w-3.5"/> Encrypted • Live tested</div>
        </div>
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
          <div className="rounded-2xl border bg-amber-50 border-amber-200 p-4 text-sm flex gap-3">
            <PlugZap className="h-5 w-5 text-amber-600 shrink-0"/>
            <div><div className="font-medium">Agents load by API providers — live</div><div className="text-muted-foreground">Connect Nvidia, OpenRouter, OmeRoute and more. Click Connect to live-verify the key against the provider. Switch models per agent on the Workforce canvas. Fallback auto-routes if a provider fails.</div></div>
          </div>

          <div className="mt-4 rounded-2xl border bg-card p-4 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
            <div className="flex gap-2 text-xs"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-emerald-700"><Lock className="h-3 w-3"/> AES-GCM encrypted in browser</span><span className="inline-flex items-center gap-1.5 rounded-full bg-muted border px-3 py-1.5"><Shield className="h-3 w-3"/> Never sent plain except to provider</span></div>
            <div className="text-xs text-muted-foreground">Keys are encrypted with <code className="bg-muted px-1 rounded">enc:</code> + AES-GCM before localStorage. Decrypted only for API calls.</div>
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            {PROVIDERS.map(p => {
              const v = vault[p.id];
              const isConnected = !!v?.connected;
              const dec = decrypted[p.id] ?? "";
              const val = draft[p.id] !== undefined ? draft[p.id] : (visible[p.id] ? dec : (dec ? maskKey(dec) : ""));
              const ep = endpoint[p.id] !== undefined ? endpoint[p.id] : (v?.endpoint || "");
              const m = msg[p.id];
              return (
                <div key={p.id} className={`rounded-2xl border p-4 md:p-5 ${isConnected ? "bg-card border-emerald-200" : "bg-card"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-xl grid place-items-center text-white text-sm shrink-0" style={{background: p.color}}>{p.icon}</div>
                      <div className="min-w-0"><div className="font-medium text-sm flex items-center gap-2 truncate">{p.name} {isConnected && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3"/> connected</span>}{!isConnected && v?.key && <span className="text-xs text-amber-600">saved • not verified</span>}</div>
                      <div className="text-xs text-muted-foreground truncate">{v?.endpoint || p.baseUrl}</div></div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-medium flex items-center gap-1">API Key <Lock className="h-3 w-3 text-muted-foreground"/></div>
                    <div className="mt-1 flex gap-2">
                      <div className="relative flex-1 min-w-0">
                        <input
                          type={visible[p.id] ? "text" : "password"}
                          value={val}
                          onChange={e=>setDraft(d=>({...d, [p.id]: e.target.value}))}
                          onFocus={() => {
                            if (!visible[p.id] && dec) {
                              setVisible(s=>({...s, [p.id]: true}));
                              setDraft(d=>({...d, [p.id]: dec}));
                            }
                          }}
                          placeholder={p.keyPlaceholder} className="w-full rounded-xl border bg-muted px-3 py-2.5 text-sm pr-9 outline-none focus:ring-2 focus:ring-foreground/10"/>
                        <button onClick={()=>setVisible(s=>({...s, [p.id]: !s[p.id]}))} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
                          {visible[p.id] ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                        </button>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="text-xs font-medium flex items-center gap-1">Endpoint URL <span className="text-[10px] text-muted-foreground font-normal">optional — overrides {p.baseUrl}</span></div>
                      <input
                        value={ep}
                        onChange={e=>setEndpoint(s=>({...s, [p.id]: e.target.value}))}
                        placeholder={p.id === "nvidia" ? "https://api.nvcf.nvidia.com/v2/nvcf/deployments/functions/YOUR_ID/versions/YOUR_VERSION" : p.baseUrl}
                        className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10 font-mono text-xs"
                      />
                    </div>
                    <div className="mt-2 flex gap-2 items-center flex-wrap">
                      <button onClick={()=>connect(p, draft[p.id] ?? dec, ep)} disabled={!!testing[p.id]} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-medium disabled:opacity-50">
                        {testing[p.id] && <Loader2 className="h-3 w-3 animate-spin"/>} {testing[p.id] ? "Verifying..." : "Connect & verify"}
                      </button>
                      {v?.key && <button onClick={()=>{ clearVaultKey(p.id); setDraft(d=>{const n={...d}; delete n[p.id]; return n;}); setEndpoint(s=>{const n={...s}; delete n[p.id]; return n;}); setMsg(s=>{const n={...s}; delete n[p.id]; return n;});}} className="rounded-full border px-4 py-1.5 text-xs">Disconnect</button>}
                      <span className="text-xs text-muted-foreground hidden sm:inline">{p.models.slice(0,2).map(x=>x.id).join(" • ")} • {p.models.length} models</span>
                    </div>
                    {p.id === "nvidia" && (
                      <div className="mt-2 text-[11px] text-muted-foreground">NVIDIA deployment keys use an NVCF URL like <code className="bg-muted px-1 rounded">…/v2/nvcf/deployments/functions/&lt;id&gt;/versions/&lt;ver&gt;</code>. Paste it above — GodEye calls it directly.</div>
                    )}
                    {m && <div className={`mt-2 text-xs flex gap-1.5 p-2 rounded-xl border break-words ${m.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-800"}`}>{m.ok ? <Check className="h-3.5 w-3.5 mt-0.5 shrink-0"/> : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0"/>}<span>{m.text}</span></div>}
                    {v?.lastTested && <div className="mt-1 text-[11px] text-muted-foreground">Last tested {new Date(v.lastTested).toLocaleString()} • Stored {v.key?.startsWith("enc:") ? "encrypted" : "migrating to encrypted"}</div>}
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
