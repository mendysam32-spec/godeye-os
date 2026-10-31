"use client";
import { Sidebar } from "@/components/sidebar";
import { useMEDUSA } from "@/lib/store";
import { THEMES, ACCENTS } from "@/lib/themes";
import { Palette, Sliders, User, Monitor, Sparkles, Check, ChevronLeft, ChevronRight, Download, Upload, Lock, Database, HardDrive, ShieldCheck, Zap, Cloud } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { isDesktop, desktopBridge } from "@/lib/desktop";
import type { MEDUSASystemInfo } from "@/types/desktop";
import { useDriveAuth } from "@/lib/use-drive-auth";

// The account project exports are meant to land in. Purely a UI guard so a
// mis-click on the Google account chooser is obvious — it is never sent anywhere.
const EXPECTED_DRIVE_EMAIL = "bakarysambou84@gmail.com";

export default function SettingsPage() {
  const { profile, setProfile, settings, setSettings, vault, agents, chats, projects } = useMEDUSA() as any;
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [sysInfo, setSysInfo] = useState<MEDUSASystemInfo | null>(null);
  const desktop = isDesktop();

  // Theme gallery rail
  const railRef = useRef<HTMLDivElement>(null);
  const activeTheme = THEMES.find((t) => t.id === settings.theme);
  const scrollThemes = (dir: -1 | 1) =>
    railRef.current?.scrollBy({ left: dir * 276, behavior: "smooth" });

  useEffect(() => {
    const b = desktopBridge();
    if (b) b.systemInfo().then(setSysInfo).catch(() => setSysInfo(null));
  }, []);

  // Google Drive connection — same shared hook the Connectors page uses, so the
  // OAuth callback can land on either page.
  const drive = useDriveAuth();
  const driveConnected = drive.status === "connected";
  const driveEmail = drive.email;
  const driveMsg = drive.message;

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-6 h-16 flex items-center">
          <div><div className="font-semibold">Settings</div><div className="text-xs text-muted-foreground">Make it yours — {THEMES.length} themes • modern • own the OS</div></div>
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

          {/* Themes — scrollable theme gallery */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium"><Palette className="h-4 w-4"/> Appearance — pick your look</div>
              <span className="text-xs rounded-full bg-muted px-2.5 py-1 flex items-center gap-1"><Sparkles className="h-3 w-3" style={{color:'var(--accent)'}}/>{activeTheme?.label ?? settings.theme} • {settings.accent}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Scroll through {THEMES.length} hand-tuned modern themes — click one to apply it instantly everywhere.</p>

            <div className="relative mt-5">
              <div ref={railRef} className="no-scrollbar flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth px-1 pb-1">
                {THEMES.map((t) => {
                  const active = settings.theme === t.id;
                  const p = t.preview;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSettings({ theme: t.id })}
                      className="relative shrink-0 snap-start w-[248px] text-left rounded-2xl p-3 transition duration-150 hover:-translate-y-0.5"
                      style={{
                        background: p.bg,
                        border: active ? "2px solid var(--accent)" : "1px solid rgba(128,128,135,0.28)",
                        boxShadow: active ? "0 12px 32px rgba(0,0,0,0.22)" : "0 1px 3px rgba(0,0,0,0.07)",
                      }}
                    >
                      {active && (
                        <span className="absolute -top-2.5 right-3 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ background: "var(--accent)" }}>
                          <Check className="h-2.5 w-2.5"/> Active
                        </span>
                      )}
                      {/* mini app window */}
                      <div className="rounded-xl overflow-hidden" style={{ background: p.surface, border: `1px solid ${p.border}`, color: p.text }}>
                        <div className="h-7 flex items-center gap-1 px-2.5" style={{ background: p.bar, borderBottom: `1px solid ${p.border}` }}>
                          <span className="h-2 w-2 rounded-full" style={{ background: "#f87171" }} />
                          <span className="h-2 w-2 rounded-full" style={{ background: "#fbbf24" }} />
                          <span className="h-2 w-2 rounded-full" style={{ background: "#34d399" }} />
                          <span className="ml-auto h-1.5 w-10 rounded-full" style={{ background: p.text, opacity: 0.25 }} />
                        </div>
                        <div className="flex h-[92px]">
                          <div className="w-14 shrink-0 p-1.5 space-y-1.5" style={{ background: p.sidebar, borderRight: `1px solid ${p.border}` }}>
                            <div className="h-1.5 w-6 rounded-full" style={{ background: p.text, opacity: 0.5 }} />
                            <div className="h-5 rounded-md" style={{ background: p.accent }} />
                            <div className="h-1.5 w-8 rounded-full" style={{ background: p.text, opacity: 0.22 }} />
                            <div className="h-1.5 w-7 rounded-full" style={{ background: p.text, opacity: 0.15 }} />
                            <div className="h-1.5 w-6 rounded-full" style={{ background: p.text, opacity: 0.1 }} />
                          </div>
                          <div className="flex-1 p-2.5 space-y-1.5">
                            <div className="h-2 w-3/5 rounded-full" style={{ background: p.text, opacity: 0.85 }} />
                            <div className="h-1.5 w-11/12 rounded-full" style={{ background: p.text, opacity: 0.16 }} />
                            <div className="h-1.5 w-2/3 rounded-full" style={{ background: p.text, opacity: 0.1 }} />
                            <div className="flex gap-1.5 pt-1.5">
                              <span className="h-4 px-2 rounded-md" style={{ background: p.accent }} />
                              <span className="h-4 flex-1 rounded-md" style={{ background: p.bar, border: `1px solid ${p.border}` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: p.text }}>{t.label}</div>
                          <div className="text-[11px] truncate" style={{ color: p.sub }}>{t.desc}</div>
                        </div>
                        <span
                          className="h-5 w-5 rounded-full grid place-items-center shrink-0"
                          style={active ? { background: "var(--accent)", color: "#fff" } : { border: `1.5px solid ${p.sub}`, opacity: 0.8 }}
                        >
                          {active && <Check className="h-3 w-3" />}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button type="button" aria-label="Scroll themes left" onClick={() => scrollThemes(-1)}
                className="hidden lg:grid place-items-center absolute -left-3 top-[42%] -translate-y-1/2 h-9 w-9 rounded-full border bg-card shadow-md z-10 hover:scale-105 transition">
                <ChevronLeft className="h-4 w-4"/>
              </button>
              <button type="button" aria-label="Scroll themes right" onClick={() => scrollThemes(1)}
                className="hidden lg:grid place-items-center absolute -right-3 top-[42%] -translate-y-1/2 h-9 w-9 rounded-full border bg-card shadow-md z-10 hover:scale-105 transition">
                <ChevronRight className="h-4 w-4"/>
              </button>
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
            <div className="flex items-center gap-2 font-medium"><Sliders className="h-4 w-4"/> Reasoning & depth — how hard MEDUSA thinks</div>
            <p className="text-xs text-muted-foreground mt-1">Fast = quick answers. Think = step-by-step. Deep = multi-approach verification for code & research. Max 🧠 = extra-high depth for complex projects, big docs, question banks and data work (slower, more tokens).</p>
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <label className="block"><span className="text-xs font-medium">Reasoning effort (default)</span>
                <select value={settings.reasoningEffort || "medium"} onChange={e=>setSettings({reasoningEffort:e.target.value as any})} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10">
                  <option value="off">Off — fast, no extra thinking</option>
                  <option value="low">Low — quick deliberation</option>
                  <option value="medium">Medium — step-by-step (recommended)</option>
                  <option value="high">High — deep reasoning for hard tasks</option>
                  <option value="extra-high">Extra-high 🧠 — max depth for complex projects</option>
                </select>
                <span className="text-xs text-muted-foreground">Maps to provider-native thinking: OpenAI reasoning_effort, Anthropic thinking budget, Gemini thinkingBudget, DeepSeek-R1/Nemotron depth. High modes also enlarge file context (up to 40k chars/file) and output budget.</span>
              </label>
              <div className="rounded-xl border bg-muted p-3 text-xs">
                <div className="font-medium text-sm">What changes with depth?</div>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  <li>💻 <b>Coding:</b> architecture → modules → tests, edge cases checked</li>
                  <li>📚 <b>Large docs:</b> 12k → 25k → 40k chars per file ingested</li>
                  <li>🔍 <b>Research:</b> facts → cross-check → synthesis with gaps</li>
                  <li>📊 <b>Data:</b> extract → correlate → conclude with verification</li>
                </ul>
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

          {/* Power */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 font-medium"><Zap className="h-4 w-4" style={{color:'var(--accent)'}}/> Power — files & commands</div>
            <p className="text-xs text-muted-foreground mt-1">When tools are ON, MEDUSA can create/read files on your computer, run commands, and verify its own work. Full power needs the desktop app; in the browser files download instead.</p>

            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              <label className="flex items-center gap-2 text-sm rounded-xl border bg-muted px-3 py-2.5 cursor-pointer hover:bg-muted/80">
                <input type="checkbox" checked={settings.agentTools !== false} onChange={e=>setSettings({ agentTools: e.target.checked })} className="rounded"/>
                Agent tools <span className="text-muted-foreground">(save file • read file • run command)</span>
              </label>
              <div className="text-xs text-muted-foreground self-center">{settings.agentTools !== false ? "ON — ask MEDUSA to save or run code." : "OFF — text only."}</div>
            </div>

              <div className="mt-4 rounded-xl border bg-muted p-4">
              <div className="flex items-center gap-2 text-sm font-medium"><Cloud className="h-4 w-4"/> Google Drive — cross-device project storage</div>
              <p className="text-xs text-muted-foreground mt-1">
                Connect once and the <b>Drive</b> button on a loaded project saves the improved ZIP to
                <code className="mx-1">MEDUSA/Projects/</code> in your own Drive — reachable from any device signed into that account.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {driveConnected ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
                      <Check className="h-3.5 w-3.5"/> {driveEmail ? `Connected — ${driveEmail}` : "Connected on this device"}
                    </span>
                    {driveEmail && driveEmail.toLowerCase() !== EXPECTED_DRIVE_EMAIL && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                        You expected {EXPECTED_DRIVE_EMAIL} — disconnect and pick the other account.
                      </span>
                    )}
                    <button onClick={drive.disconnect} className="rounded-full border px-4 py-1.5 text-xs font-medium hover:bg-card">Disconnect</button>
                  </>
                ) : (
                  <button onClick={() => drive.connect("/settings")} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-medium"><Cloud className="h-3.5 w-3.5"/> Connect Google Drive</button>
                )}
              </div>
              {driveMsg && <div className="mt-2 text-xs text-muted-foreground">{driveMsg}</div>}
              <p className="mt-2 text-[11px] text-muted-foreground">Sign in as <b>{EXPECTED_DRIVE_EMAIL}</b> on the Google screen. Scope is <code>drive.file</code> — MEDUSA can only see files it created.</p>
            </div>

            <div className="mt-4 rounded-xl border bg-muted p-4">
              <div className="flex items-center gap-2 text-sm font-medium"><HardDrive className="h-4 w-4"/> Desktop bridge</div>
              {desktop ? (
                <div className="mt-2 grid md:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border bg-card px-3 py-2">Platform: <b>{sysInfo?.platform || "…"} · {sysInfo?.arch || "…"}</b></div>
                  <div className="rounded-lg border bg-card px-3 py-2">Electron: <b>{sysInfo?.versions?.electron || "…"}</b> · Chrome {sysInfo?.versions?.chrome || "…"}</div>
                  <div className="rounded-lg border bg-card px-3 py-2 md:col-span-2 break-all">MEDUSA folder: <b>{sysInfo?.baseFolder || "…"}</b></div>
                  <button onClick={async () => { const b = desktopBridge(); if (b) b.openPath(sysInfo?.baseFolder || ""); }} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground text-background px-4 py-2 text-xs font-medium"><HardDrive className="h-3.5 w-3.5"/> Open folder</button>
                  {settings.agentTools !== false && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5"/> Tools live — files & commands run on this PC.</div>}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">Running in browser — Save still works (downloads). Open the <b>MEDUSA OS desktop app</b> for run-command + read-file power.</span>
                </div>
              )}
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
                const a = document.createElement("a"); a.href = url; a.download = `medusa-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
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
                  const uid = useMEDUSA.getState().currentUser?.id;
                  const baseKey = uid ? `medusa:workspace:${uid}` : "medusa-os-v1";
                  const raw = localStorage.getItem(baseKey) ?? (baseKey !== "medusa-os-v1" ? localStorage.getItem("medusa-os-v1") : null);
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
                  localStorage.setItem(uid ? `medusa:workspace:${uid}` : "medusa-os-v1", JSON.stringify(next.state));
                  localStorage.setItem("medusa-os-v1", JSON.stringify(next));
                  setImportMsg("✓ Imported — reload to see chats/projects");
                  setTimeout(() => window.location.reload(), 800);
                } catch (err: any) { setImportMsg("✗ Import failed: " + err.message); }
                if (fileRef.current) fileRef.current.value = "";
              }}/>
            </div>
            {importMsg && <div className="mt-2 text-xs p-2 rounded-xl border bg-muted">{importMsg}</div>}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 border"><HardDrive className="h-3 w-3"/> localStorage: medusa-os-v1</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 border"><ShieldCheck className="h-3 w-3"/> D1: medusa-db • KV: CACHE ready</span>
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
              <div><div className="font-medium text-sm">{profile.name} • {profile.role}</div><div className="text-xs text-muted-foreground">{settings.agentBehavior} • {settings.accent} accent • {activeTheme?.label ?? settings.theme} theme • {settings.density}</div></div>
            </div>
            {/* glass preview */}
            <div className="mt-3 grid md:grid-cols-3 gap-3">
              <div className="rounded-xl border p-3 bg-card">
                <div className="text-xs font-medium">Card</div><div className="text-xs text-muted-foreground">Solid card on {activeTheme?.label ?? settings.theme}</div>
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

          <div className="text-center text-xs text-muted-foreground">MEDUSA OS by S&P Group — {THEMES.length} modern themes • Daylight • Paper • Midnight • Horizon — your OS, your style</div>
        </div>
      </main>
    </div>
  );
}
