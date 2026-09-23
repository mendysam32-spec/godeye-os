"use client";
import { Sidebar } from "@/components/sidebar";
import { PROVIDERS, type ProviderId, type ProviderModel } from "@/lib/providers";
import { useGodEye, DEFAULT_PLUGINS, type PluginId } from "@/lib/store";
import { useState, useEffect } from "react";
import { Check, Eye, EyeOff, PlugZap, Loader2, Shield, AlertCircle, Lock, Zap, Image as ImageIcon, Clapperboard, Search, Terminal, Sparkles, Link2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { encryptKey, decryptKey } from "@/lib/vault-crypto";

const PLUGIN_DEFS: { id: PluginId; label: string; desc: string; icon: any; iconClass: string }[] = [
  { id: "image", label: "Image generation", desc: "Renders real images with image-capable models (DALL-E, FLUX, Imagen, Gemini). Created files appear in the chat to save/download.", icon: ImageIcon, iconClass: "text-amber-500" },
  { id: "video", label: "Video generation", desc: "Renders real videos with video-capable models (Sora, Veo). Jobs are polled until done; files ready to save.", icon: Clapperboard, iconClass: "text-violet-500" },
  { id: "search", label: "Search & research", desc: "Grounds answers in research and connects facts in Search/Research modes.", icon: Search, iconClass: "text-blue-500" },
  { id: "tools", label: "Agent file tools", desc: "Let the model create files, folders, docs, PDFs, ZIPs and run commands — works with any tool-capable provider.", icon: Zap, iconClass: "text-amber-500" },
  { id: "terminal", label: "Terminal", desc: "Run code blocks and commands from assistant replies on the desktop app.", icon: Terminal, iconClass: "text-green-500" },
];

const REASONING_OPTIONS = [
  { id: "off", label: "Off", desc: "Fastest, no extra thinking" },
  { id: "low", label: "Low", desc: "Quick deliberation" },
  { id: "medium", label: "Medium", desc: "Step-by-step (recommended)" },
  { id: "high", label: "High", desc: "Deep reasoning for hard tasks" },
  { id: "extra-high", label: "Extra-high 🧠", desc: "Max depth — complex projects & big docs" },
];

export default function ConnectorsPage() {
  const { vault, setVaultKey, setSettings } = useGodEye() as any;
  const pPlugins = ((useGodEye((s) => (s as any).settings.plugins) as any) || { ...DEFAULT_PLUGINS }) as Record<PluginId, boolean>;
  const reasoning = useGodEye((s) => (s as any).settings.reasoningEffort || "medium");

  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

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

  async function connect(p: (typeof PROVIDERS)[number], val: string) {
    if (!val.trim()) return;
    setTesting((s) => ({ ...s, [p.id]: true }));
    setMsg((s) => ({ ...s, [p.id]: undefined as any }));
    try {
      const [testRes, modelRes] = await Promise.all([
        fetch("/api/providers/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p.id, apiKey: val.trim() }) }),
        fetch("/api/providers/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p.id, apiKey: val.trim() }) }).then(r => r.json().catch(() => ({ ok: false }))).catch(() => ({ ok: false })),
      ]);
      const j = await testRes.json();
      const models = (modelRes.models || []) as ProviderModel[];
      const enc = await encryptKey(val.trim());
      const ok = testRes.ok && j.ok;
      setVaultKey(p.id, enc, ok, undefined, models);
      setMsg((s) => ({ ...s, [p.id]: ok
        ? { ok: true, text: `Connected ✓${models.length ? ` — ${models.length} models synced` : ""}` }
        : { ok: false, text: `${j.message || j.error || "Key saved encrypted but verification failed"}` } }));
      if (ok) setDraft(d => { const n = { ...d }; delete n[p.id]; return n; });
    } catch (e: any) {
      const enc = await encryptKey(val.trim());
      setVaultKey(p.id, enc, false, undefined);
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
          <div className="min-w-0"><div className="font-semibold text-sm md:text-base">Connectors & Plugins</div><div className="text-xs text-muted-foreground truncate">Plug in providers • toggle capabilities that attach to any model</div></div>
          <Link href="/vault" className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap shrink-0 hover:bg-muted">Advanced vault <ArrowRight className="h-3 w-3" /></Link>
        </div>
        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
          {/* Plugins */}
          <div className="rounded-2xl border bg-card p-4 md:p-6">
            <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4" style={{ color: 'var(--accent)' }} /> Plugins — whatever model you pick, these attach</div>
            <p className="text-xs text-muted-foreground mt-1">Plugins are not providers — they enable capabilities on the selected model (generation only fires on capable models, files only on tool-capable providers).</p>
            <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {PLUGIN_DEFS.map(def => {
                const on = !!pPlugins[def.id];
                return (
                  <button key={def.id} onClick={() => setSettings({ plugins: { ...pPlugins, [def.id]: !on } })} className={`rounded-2xl border p-4 text-left hover:bg-muted/60 transition ${on ? "border-emerald-200 bg-emerald-50/40" : "border-border"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <def.icon className={`h-5 w-5 ${on ? def.iconClass : "opacity-40"}`} />
                      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-muted"}`}>
                        <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : ""}`} />
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-medium">{def.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{def.desc}</div>
                  </button>
                );
              })}
            </div>
            {/* reasoning + file creation note */}
            <div className="mt-4 rounded-xl border bg-muted p-4">
              <div className="text-xs font-medium flex items-center gap-1.5">Reasoning depth <span className="text-muted-foreground font-normal">— how hard GodEye thinks (maps to model-native thinking budgets)</span></div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {REASONING_OPTIONS.map(o => (
                  <button key={o.id} onClick={() => setSettings({ reasoningEffort: o.id })} title={o.desc} className={`rounded-full border px-3 py-1.5 text-xs ${reasoning === o.id ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}>{o.label}</button>
                ))}
              </div>
              <div className="mt-3 border-t pt-3 text-[11px] text-muted-foreground flex items-start gap-1.5"><Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} /> Capable models can create files too — generated images (DALL-E, FLUX, Imagen, Gemini) and videos (Sora, Veo) are registered as real files you can save to disk (desktop) or download (browser). File creation for text/docs/ZIPs is handled by the <b>Agent file tools</b> plugin.</div>
            </div>
          </div>

          {/* Connectors */}
          <div className="rounded-2xl border bg-card p-4 md:p-6">
            <div className="flex items-center gap-2 font-medium"><PlugZap className="h-4 w-4" /> Connectors — one key powers any model & chat</div>
            <p className="text-xs text-muted-foreground mt-1">Paste a provider API key to connect. Keys are AES-GCM encrypted in your browser and only ever sent to the provider itself. Advanced options (custom endpoints, disconnect, model re-sync) live in the vault.</p>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
              {PROVIDERS.map(p => {
                const v = vault[p.id];
                const isConnected = !!v?.connected;
                const dec = decrypted[p.id] ?? "";
                const val = draft[p.id] !== undefined ? draft[p.id] : (visible[p.id] ? dec : (dec ? "••••••••••••••••" : ""));
                const m = msg[p.id];
                const dynModels = v?.models?.length ? v.models : p.models;
                return (
                  <div key={p.id} className={`rounded-2xl border p-4 ${isConnected ? "border-emerald-200 bg-card" : "bg-card"}`}>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl grid place-items-center text-white text-sm shrink-0" style={{ background: p.color }}>{p.icon}</div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium flex items-center gap-2">{p.name}{isConnected && <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600"><Check className="h-3 w-3" /> connected</span>}{!isConnected && v?.key && <span className="text-[11px] text-amber-600">saved • unverified</span>}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{dynModels.length} models • {p.baseUrl}</div>
                      </div>
                      <span className={`ml-auto h-2.5 w-2.5 rounded-full shrink-0 ${isConnected ? "bg-emerald-500" : v?.key ? "bg-amber-400" : "bg-muted-foreground/30"}`} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <div className="relative flex-1 min-w-0">
                        <input
                          type={visible[p.id] ? "text" : "password"}
                          value={val}
                          onChange={e => setDraft(d => ({ ...d, [p.id]: e.target.value }))}
                          onFocus={() => { if (!visible[p.id] && dec) { setVisible(s => ({ ...s, [p.id]: true })); setDraft(d => ({ ...d, [p.id]: dec })); } }}
                          placeholder={p.keyPlaceholder}
                          className="w-full rounded-xl border bg-muted px-3 py-2 text-sm pr-9 outline-none focus:ring-2 focus:ring-foreground/10"
                        />
                        <button onClick={() => setVisible(s => ({ ...s, [p.id]: !s[p.id] }))} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">{visible[p.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                      </div>
                      <button onClick={() => connect(p, draft[p.id] ?? dec)} disabled={!!testing[p.id]} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-2 text-xs font-medium disabled:opacity-50 shrink-0">
                        {testing[p.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlugZap className="h-3 w-3" />} {testing[p.id] ? "Verifying..." : "Connect"}
                      </button>
                    </div>
                    {m && <div className={`mt-2 text-xs flex gap-1.5 p-2 rounded-xl border break-words ${m.ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-800"}`}>{m.ok ? <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}<span>{m.text}</span></div>}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 border"><Lock className="h-3 w-3" /> AES-GCM encrypted in browser</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 border"><Shield className="h-3 w-3" /> Keys only sent to the provider</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 border"><Link2 className="h-3 w-3" /> Same keys power Workforce, Chat, Agents & generation</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}