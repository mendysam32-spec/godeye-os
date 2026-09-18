"use client";
import { Sidebar } from "@/components/sidebar";
import { useGodEye } from "@/lib/store";
import { Palette, Sliders, User, Monitor, Sparkles, Check, Sun, Moon, Layers, Stars, Sunrise, Route, Download, Upload, Lock, Database, HardDrive, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";

const THEMES = [
  {
    id: "light" as const,
    label: "Light",
    desc: "Clean • Minimal",
    icon: Sun,
    preview: { bg: "#fcfcf9", card: "#ffffff", muted: "#f5f5f3", dot: "#0f0f0f", accent: "#f59e0b" },
  },
  {
    id: "dark" as const,
    label: "Dark",
    desc: "OLED • Focus",
    icon: Moon,
    preview: { bg: "#0a0a0a", card: "#141414", muted: "#1a1a1a", dot: "#fafafa", accent: "#f59e0b" },
  },
  {
    id: "glass" as const,
    label: "Glass",
    desc: "Frosted • Colorful",
    icon: Layers,
    preview: { bg: "#f1e8fb", card: "rgba(255,255,255,0.85)", muted: "rgba(255,255,255,0.5)", dot: "#241a45", accent: "#4f46e5" },
    glass: true,
  },
  {
    id: "midnight" as const,
    label: "Midnight",
    desc: "Navy • Premium",
    icon: Stars,
    preview: { bg: "#060a14", card: "#0f172a", muted: "#1e293b", dot: "#e8eefc", accent: "#8b5cf6" },
  },
  {
    id: "aurora" as const,
    label: "Aurora",
    desc: "Cream • Warm",
    icon: Sunrise,
    preview: { bg: "#fffbf0", card: "#ffffff", muted: "#fef3e2", dot: "#1c1917", accent: "#fb923c" },
  },
  {
    id: "motion" as const,
    label: "Motion",
    desc: "Day Red • Gradient",
    icon: Route,
    preview: { bg: "#fdf0ee", card: "#ffffff", muted: "#fbe7e2", dot: "#7f1d1d", accent: "#dc2626", gradient: true },
  },
] as const;

const ACCENTS = [
  { id: "amber" as const, color: "#f59e0b" },
  { id: "violet" as const, color: "#8b5cf6" },
  { id: "emerald" as const, color: "#10b981" },
  { id: "blue" as const, color: "#3b82f6" },
  { id: "rose" as const, color: "#f43f5e" },
];

export default function SettingsPage() {
  const { profile, setProfile, settings, setSettings, vault, agents, chats, projects } = useGodEye() as any;
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-6 h-16 flex items-center">
          <div><div className="font-semibold">Settings</div><div className="text-xs text-muted-foreground">Make it yours — 6 themes • glass • own the OS</div></div>
        </div>

        <div className="p-6 max-w-5xl mx-auto space-y-6">
          {/* Profile */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><User className="h-4 w-4"/> Profile — you own this</div>
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <label className="block"><span className="text-xs font-medium">Display name</span><input value={profile.name} onChange={e=>setProfile({name:e.target.value})} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10"/></label>
              <label className="block"><span className="text-xs font-medium">Role / title</span><input value={profile.role} onChange={e=>setProfile({role:e.target.value})} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10"/></label>
              <label className="block"><span className="text-xs font-medium">Email</span><input value={profile.email} onChange={e=>setProfile({email:e.target.value})} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10"/></label>
              <label className="block"><span className="text-xs font-medium">Bio</span><input value={profile.bio} onChange={e=>setProfile({bio:e.target.value})} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10"/></label>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">Shows in Workforce, sharing and Windows app title bar.</div>
          </div>

          {/* Themes - 6 modern clean glass style */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium"><Palette className="h-4 w-4"/> Appearance — 6 themes</div>
              <span className="text-xs rounded-full bg-muted px-2.5 py-1 flex items-center gap-1"><Sparkles className="h-3 w-3" style={{color:'var(--accent)'}}/>{settings.theme} • {settings.accent}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Modern clean • Glass frosted • Pick your OS vibe. Live instantly.</p>

            {/* 5 theme cards */}
            <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {THEMES.map((t) => {
                const active = settings.theme === t.id;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSettings({ theme: t.id })}
                    className={`group relative text-left rounded-2xl border-2 p-3 transition-all overflow-hidden ${
                      active ? "border-foreground shadow-md scale-[1.02]" : "border-border hover:border-foreground/20 hover:shadow-sm"
                    } ${t.id === "glass" ? "backdrop-blur-xl" : ""}`}
                    style={{ background: t.preview.bg }}
                  >
                    {/* preview mini window */}
                    <div className="rounded-xl overflow-hidden border shadow-sm" style={{ background: t.preview.card, borderColor: t.id==="glass" ? "rgba(255,255,255,0.6)" : t.preview.muted }}>
                      <div className="h-7 flex items-center gap-1 px-2 border-b" style={{ background: t.preview.muted, borderColor: t.id==="glass"? "rgba(255,255,255,0.4)" : t.preview.bg }}>
                        <span className="h-2 w-2 rounded-full bg-red-400" />
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="ml-auto h-1.5 w-8 rounded-full opacity-40" style={{ background: t.preview.dot }} />
                      </div>
                      <div className="p-2 space-y-1.5">
                        <div className="h-2 rounded-full w-3/4" style={{ background: t.preview.dot, opacity: 0.9 }} />
                        <div className="h-1.5 rounded-full w-full" style={{ background: t.preview.dot, opacity: 0.15 }} />
                        <div className="h-1.5 rounded-full w-5/6" style={{ background: t.preview.dot, opacity: 0.1 }} />
                        <div className="flex gap-1 pt-1">
                          <span className="h-5 w-5 rounded-full grid place-items-center" style={{ background: t.preview.accent }}><Check className="h-3 w-3 text-white" /></span>
                          <span className="h-5 flex-1 rounded-full" style={{ background: t.preview.accent, opacity: 0.9 }} />
                        </div>
                      </div>
                    </div>
                    {t.id === "glass" && (
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-pink-500/20 via-violet-400/10 to-cyan-400/15" />
                    )}
                    {t.id === "midnight" && (
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-600/20 to-blue-600/10" />
                    )}
                    {t.id === "aurora" && (
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-orange-400/10 to-violet-400/10" />
                    )}
                    {(t as any).gradient && (
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/20 via-orange-400/15 to-rose-400/15" />
                    )}
                    <div className="relative mt-3 flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium flex items-center gap-1.5" style={{ color: t.id==="dark" || t.id==="midnight" ? "#fff" : "#0f0f0f" }}>
                          <Icon className="h-3.5 w-3.5" /> {t.label}
                        </div>
                        <div className="text-xs" style={{ color: t.id==="dark" || t.id==="midnight" ? "rgba(255,255,255,0.6)" : "#6b6b6b" }}>{t.desc}</div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 grid place-items-center shrink-0 ${active ? "bg-foreground border-foreground" : "border-black/20 bg-white/50"}`} style={{ borderColor: active ? "var(--foreground)" : undefined }}>
                        {active && <Check className="h-3 w-3 text-background" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Accent + Density + Animations */}
            <div className="mt-6 grid md:grid-cols-3 gap-6">
              <div>
                <div className="text-xs font-medium mb-2">Accent</div>
                <div className="flex gap-2">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSettings({ accent: a.id })}
                      className={`h-9 w-9 rounded-full border-2 grid place-items-center transition ${settings.accent === a.id ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
                      style={{ background: a.color }}
                      title={a.id}
                    >
                      {settings.accent === a.id && <Check className="h-4 w-4 text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground mt-1 capitalize">{settings.accent} accent</div>
              </div>
              <div>
                <div className="text-xs font-medium mb-2">Density</div>
                <div className="flex gap-1.5">
                  {(["comfortable", "compact", "spacious"] as const).map((d) => (
                    <button key={d} onClick={() => setSettings({ density: d })} className={`flex-1 rounded-xl border px-2 py-2 text-xs capitalize transition ${settings.density === d ? "bg-foreground text-background shadow" : "bg-muted hover:bg-muted/80"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium mb-2">Motion</div>
                <label className="flex items-center gap-2 text-sm rounded-xl border bg-muted px-3 py-2.5 cursor-pointer hover:bg-muted/80">
                  <input type="checkbox" checked={settings.animations} onChange={e=>setSettings({animations:e.target.checked})} className="rounded"/>
                  Animations & motion
                </label>
              </div>
            </div>
          </div>

          {/* Behavior */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><Sliders className="h-4 w-4"/> Program settings & behavior</div>
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <label className="block"><span className="text-xs font-medium">Agent behavior</span>
                <select value={settings.agentBehavior} onChange={e=>setSettings({agentBehavior:e.target.value as any})} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10">
                  <option value="balanced">Balanced</option><option value="creative">Creative</option><option value="precise">Precise</option><option value="autonomous">Autonomous</option>
                </select>
                <span className="text-xs text-muted-foreground">Controls temperature fallbacks and tool approvals.</span>
              </label>
              <label className="block"><span className="text-xs font-medium">Code style</span>
                <select value={settings.codeStyle} onChange={e=>setSettings({codeStyle:e.target.value as any})} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10">
                  <option value="concise">Concise</option><option value="verbose">Verbose</option><option value="documented">Documented</option>
                </select>
              </label>
              <label className="block"><span className="text-xs font-medium">Default provider</span>
                <select value={settings.defaultProvider} onChange={e=>setSettings({defaultProvider:e.target.value as any})} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10">
                  <option value="nvidia">NVIDIA NIM</option><option value="openrouter">OpenRouter</option><option value="omeroute">OmeRoute</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option>
                </select>
              </label>
              <label className="block"><span className="text-xs font-medium">Language</span>
                <select value={settings.language} onChange={e=>setSettings({language:e.target.value})} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10">
                  <option value="en">English</option><option value="fr">Français</option><option value="es">Español</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.autoSave} onChange={e=>setSettings({autoSave:e.target.checked})}/> Auto-save</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.soundEffects} onChange={e=>setSettings({soundEffects:e.target.checked})}/> Sound effects</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.telemetry} onChange={e=>setSettings({telemetry:e.target.checked})}/> Telemetry</label>
            </div>
          </div>

          {/* Data & Backup + D1 ready */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><Database className="h-4 w-4"/> Data & Backup — persistence</div>
            <p className="text-xs text-muted-foreground mt-1">Local encrypted + ready for Cloudflare D1/KV sync. Export now to avoid losing projects/chats/keys on cache clear.</p>
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <button onClick={() => {
                const data = { profile, settings, vault, agents, chats, projects, exportedAt: new Date().toISOString(), version: 1 };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = `godeye-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
              }} className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium">
                <Download className="h-4 w-4"/> Export backup (JSON)
              </button>
              <button onClick={() => fileRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-full border bg-card px-5 py-2.5 text-sm font-medium">
                <Upload className="h-4 w-4"/> Import backup
              </button>
              <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                try {
                  const txt = await f.text(); const j = JSON.parse(txt);
                  if (j.profile) setProfile(j.profile);
                  if (j.settings) setSettings(j.settings);
                  // vault/agents/chats/projects need direct localStorage merge — use zustand persist key
                  const uid = useGodEye.getState().currentUser?.id;
                  const baseKey = uid ? `godeye:workspace:${uid}` : "godeye-os-v1";
                  const raw = localStorage.getItem(baseKey) ?? (baseKey !== "godeye-os-v1" ? localStorage.getItem("godeye-os-v1") : null);
                  const cur = raw ? JSON.parse(raw) : {};
                  const curState = cur.state || cur;
                  const next = {
                    state: {
                      profile: j.profile ?? curState.profile,
                      settings: j.settings ?? curState.settings,
                      vault: j.vault ?? curState.vault,
                      agents: j.agents ?? curState.agents,
                      chats: j.chats ?? curState.chats,
                      activeChatId: j.activeChatId ?? curState.activeChatId,
                      projects: j.projects ?? curState.projects,
                      folders: j.folders ?? curState.folders,
                    },
                    version: 0,
                  };
                  // write into the active user's workspace so the import survives login reload
                  localStorage.setItem(uid ? `godeye:workspace:${uid}` : "godeye-os-v1", JSON.stringify(next.state));
                  localStorage.setItem("godeye-os-v1", JSON.stringify(next));
                  setImportMsg("✓ Imported — reload to see chats/projects");
                  setTimeout(() => window.location.reload(), 800);
                } catch (err: any) { setImportMsg("✗ Import failed: " + err.message); }
                if (fileRef.current) fileRef.current.value = "";
              }}/>
            </div>
            {importMsg && <div className="mt-2 text-xs p-2 rounded-xl border bg-muted">{importMsg}</div>}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 border"><HardDrive className="h-3 w-3"/> localStorage: godeye-os-v1</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 border"><ShieldCheck className="h-3 w-3"/> D1: godeye-db • KV: CACHE ready</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 border">migrations/0001_init.sql</span>
            </div>
          </div>

          {/* App Lock — optional lightweight auth */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><Lock className="h-4 w-4"/> App lock — optional</div>
            <p className="text-xs text-muted-foreground mt-1">Enable a local PIN to gate dashboard/chat when sharing device. Smooth testing — disable anytime.</p>
            <div className="mt-4 flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <label className="flex items-center gap-2 text-sm rounded-xl border bg-muted px-3 py-2.5 cursor-pointer">
                <input type="checkbox" checked={settings.appLockEnabled} onChange={e=>setSettings({ appLockEnabled: e.target.checked })} /> Enable lock
              </label>
              <label className="block flex-1">
                <span className="text-xs font-medium">PIN (4-8 digits)</span>
                <input value={settings.lockPin} onChange={e=>setSettings({ lockPin: e.target.value.replace(/[^0-9]/g,"").slice(0,8) })} placeholder="e.g. 1234" type="password" className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10"/>
              </label>
              <div className="text-xs text-muted-foreground sm:mb-2">{settings.appLockEnabled ? (settings.lockPin.length>=4 ? "✓ will ask on reload" : "Set 4+ digits") : "Off — anyone with link can open"}</div>
            </div>
            {settings.appLockEnabled && settings.lockPin.length>=4 && (
              <div className="mt-3 rounded-xl border bg-amber-50 border-amber-200 p-3 text-xs">Lock is on. Reload will show PIN screen. Keep PIN safe — stored locally only.</div>
            )}
          </div>

          {/* preview */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><Monitor className="h-4 w-4"/> Preview — feels like you own it</div>
            <div className="mt-4 rounded-xl border bg-muted p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-foreground text-background grid place-items-center"><Sparkles className="h-5 w-5"/></div>
              <div><div className="font-medium text-sm">{profile.name} • {profile.role}</div><div className="text-xs text-muted-foreground">{settings.agentBehavior} • {settings.accent} accent • {settings.theme} theme • {settings.density}</div></div>
            </div>
            {/* glass preview */}
            <div className="mt-3 grid md:grid-cols-3 gap-3">
              <div className="rounded-xl border p-3 bg-card">
                <div className="text-xs font-medium">Card</div><div className="text-xs text-muted-foreground">Solid card on {settings.theme}</div>
              </div>
              <div className="rounded-xl border p-3 glass">
                <div className="text-xs font-medium">Glass</div><div className="text-xs text-muted-foreground">Frosted glass effect</div>
              </div>
              <div className="rounded-xl p-3 text-white" style={{background:'var(--accent)'}}>
                <div className="text-xs font-medium">Accent</div><div className="text-xs opacity-80">{settings.accent}</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">Changes persist locally (and will sync to cloud + Windows app). Your OS, your rules.</div>
          </div>

          <div className="text-center text-xs text-muted-foreground">GodEye OS by S&P Group — 5 themes • Glass • Midnight • Aurora • Clean modern design</div>
        </div>
      </main>
    </div>
  );
}
