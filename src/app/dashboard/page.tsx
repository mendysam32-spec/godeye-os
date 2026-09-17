"use client";
import { Sidebar } from "@/components/sidebar";
import { useGodEye } from "@/lib/store";
import { PROVIDERS } from "@/lib/providers";
import { Play, Code2, FileText, Bot, Eye, Sparkles, Plus, Layers, Loader2, Copy, Check, AlertTriangle, FolderKanban, Search, Trash2, Archive, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getDecryptedVaultForApi } from "@/lib/vault-crypto";

type WorkResult = { agentId: string; agentName: string; provider: string; model: string; content?: string; error?: string; usage?: any; latencyMs?: number };

export default function DashboardPage() {
  const { agents, vault, settings, projects, addProject, updateProject, removeProject } = useGodEye();
  const [prompt, setPrompt] = useState("Build a landing page hero in React + Tailwind plus a blog post for our new AI feature launch");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<WorkResult[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newProj, setNewProj] = useState({ name: "", description: "", color: "#f59e0b", status: "active" as const });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft" | "archived">("all");

  const connected = Object.values(vault).filter((v: any) => v?.connected).length;

  async function runWorkforce() {
    if (!prompt.trim()) return;
    setRunning(true);
    setResults(null);
    try {
      const decryptedVault = await getDecryptedVaultForApi(vault as any);
      const res = await fetch("/api/workforce/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, agents, vault: decryptedVault, settings }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Workforce failed");
      setResults(j.results);
    } catch (e: any) {
      setResults([{ agentId: "error", agentName: "Workforce", provider: "system", model: "-", error: e.message }]);
    } finally {
      setRunning(false);
    }
  }

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  function createProject() {
    if (!newProj.name.trim()) return;
    addProject({
      id: Date.now().toString(36),
      name: newProj.name.trim(),
      description: newProj.description.trim() || "No description",
      status: newProj.status,
      color: newProj.color,
      agentIds: agents.slice(0, 2).map(a => a.id),
      tasksTotal: 0,
      tasksDone: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setNewProj({ name: "", description: "", color: "#f59e0b", status: "active" });
    setShowNew(false);
  }

  const filteredProjects = projects.filter(p => {
    const q = query.toLowerCase();
    const matchesQ = !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesQ && matchesStatus;
  });

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 md:top-0 z-10 border-b bg-background/80 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <div className="font-semibold flex items-center gap-2 text-sm md:text-base truncate"><Layers className="h-4 w-4 shrink-0" /> Workforce</div>
              <div className="text-[11px] md:text-xs text-muted-foreground truncate"> {agents.length} agents • {connected} providers • {projects.length} projects • Live LLM</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link href="/vault" className="text-xs rounded-full border px-3 py-1.5 bg-card whitespace-nowrap hidden sm:inline">Manage providers</Link>
            <Link href="/vault" className="text-xs rounded-full border px-3 py-1.5 bg-card sm:hidden">Vault</Link>
          </div>
        </div>

        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
          {/* Projects — create / view */}
          <div className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-foreground text-background grid place-items-center"><FolderKanban className="h-4 w-4" /></div>
                <div>
                  <div className="font-semibold text-sm flex items-center gap-2">Projects <span className="text-xs font-normal rounded-full bg-muted px-2 py-0.5">{filteredProjects.length}/{projects.length}</span></div>
                  <div className="text-xs text-muted-foreground hidden sm:block">Create projects, track tasks, open workforce per project</div>
                </div>
              </div>
              <button onClick={() => setShowNew(true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium w-full md:w-auto">
                <Plus className="h-4 w-4" /> New project
              </button>
            </div>

            {/* search + filter — responsive */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects..." className="w-full rounded-xl border bg-muted pl-10 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/10" />
              </div>
              <div className="flex gap-1.5 overflow-auto pb-1 sm:pb-0">
                {(["all", "active", "draft", "archived"] as const).map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-full border text-xs capitalize whitespace-nowrap ${statusFilter === s ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}>{s}</button>
                ))}
              </div>
            </div>

            {/* projects grid — 1 col mobile, 2 tablet, 3 desktop */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {filteredProjects.map(p => {
                const pct = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : 0;
                return (
                  <div key={p.id} className="rounded-2xl border bg-background p-4 flex flex-col hover:shadow-sm transition">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-xl grid place-items-center text-white shrink-0" style={{ background: p.color }}>{p.name.slice(0, 1).toUpperCase()}</div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>
                        </div>
                      </div>
                      <span className={`text-[11px] rounded-full px-2 py-1 border capitalize shrink-0 ${p.status === "active" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : p.status === "draft" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-muted"}`}>{p.status}</span>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>{p.tasksDone}/{p.tasksTotal} tasks</span><span>{pct}%</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full" style={{ width: `${pct}%`, background: p.color }} /></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {p.agentIds.map(aid => {
                        const ag = agents.find(a => a.id === aid);
                        if (!ag) return null;
                        const prov = PROVIDERS.find(pr => pr.id === ag.provider);
                        return <span key={aid} className="inline-flex items-center gap-1 text-[11px] rounded-full bg-muted px-2 py-1 border"><span className="h-2 w-2 rounded-full" style={{ background: prov?.color }} />{ag.name}</span>;
                      })}
                      {p.agentIds.length === 0 && <span className="text-xs text-muted-foreground">No agents linked</span>}
                    </div>
                    <div className="mt-4 flex items-center gap-1.5 flex-wrap">
                      <button onClick={() => { setPrompt(`Work on project "${p.name}": ${p.description}`); window.scrollTo({ top: 400, behavior: "smooth" }); }} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1.5 text-xs font-medium"><Play className="h-3 w-3" /> Run</button>
                      <button onClick={() => updateProject(p.id, { status: p.status === "active" ? "archived" : "active" })} className="p-1.5 rounded-full border bg-card hover:bg-muted" title="Toggle archive"><Archive className="h-3.5 w-3.5" /></button>
                      <button onClick={() => removeProject(p.id)} className="p-1.5 rounded-full border bg-card hover:bg-red-50 text-muted-foreground hover:text-red-600" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                      <span className="ml-auto text-[11px] text-muted-foreground hidden sm:inline">{new Date(p.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => setShowNew(true)} className="rounded-2xl border border-dashed grid place-items-center p-8 text-sm text-muted-foreground hover:bg-muted min-h-[180px]">
                <div className="text-center"><Plus className="h-5 w-5 mx-auto mb-2" /> Create project</div>
              </button>
            </div>
            {filteredProjects.length === 0 && (
              <div className="mt-4 text-center text-sm text-muted-foreground py-6 border border-dashed rounded-2xl">No projects match. Try clearing filters or create a new one.</div>
            )}
          </div>

          {/* Workforce task — responsive */}
          <div className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4" style={{ color: 'var(--accent)' }} /> New workforce task — multi-model execution</div>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} className="mt-3 w-full rounded-xl border bg-muted p-3 text-sm outline-none focus:ring-2 focus:ring-foreground/10" placeholder="Describe what the team should build: code, content, research..." />
            <div className="mt-3 flex flex-wrap gap-2">
              {agents.map(a => {
                const p = PROVIDERS.find(pr => pr.id === a.provider);
                const isConnected = (vault as any)[a.provider]?.connected;
                return (
                  <span key={a.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${isConnected ? "bg-card" : "bg-amber-50 border-amber-200"}`}>
                    <span className="h-2 w-2 rounded-full" style={{ background: p?.color }} /> {a.name} → {a.provider}/{a.model.split("/").pop()} {!isConnected && "• needs key"}
                  </span>
                )
              })}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-4">
              <button onClick={runWorkforce} disabled={running} className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-medium disabled:opacity-50 w-full sm:w-auto">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{running ? "Running workforce..." : "Run workforce (live)"}
              </button>
              <span className="text-xs text-muted-foreground text-center sm:text-left">Fans out to each provider in parallel. Works online once deployed to Cloudflare.</span>
            </div>
          </div>

          {results && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
                Results — {results.filter(r => !r.error).length}/{results.length} succeeded
                {results.some(r => r.error) && <span className="text-amber-600 flex items-center gap-1 text-xs"><AlertTriangle className="h-3 w-3" /> some need keys</span>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {results.map(r => {
                  const p = PROVIDERS.find(x => x.id === r.provider);
                  return (
                    <div key={r.agentId + r.provider} className={`rounded-2xl border p-4 flex flex-col ${r.error ? "bg-amber-50 border-amber-200" : "bg-card"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-7 w-7 rounded-lg grid place-items-center text-white text-xs shrink-0" style={{ background: p?.color || "#222" }}>{p?.icon || <Bot className="h-3 w-3" />}</div>
                          <div className="min-w-0"><div className="text-sm font-medium leading-none truncate">{r.agentName}</div><div className="text-[11px] text-muted-foreground truncate">{r.provider}/{r.model}</div></div>
                        </div>
                        {r.content && <button onClick={() => copy(r.content!, r.agentId)} className="p-1.5 rounded-lg border bg-background shrink-0">{copied === r.agentId ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}</button>}
                      </div>
                      {r.error ? (
                        <div className="mt-3 text-xs bg-white border border-amber-200 p-3 rounded-xl whitespace-pre-wrap break-words">{r.error} <Link href="/vault" className="underline">Connect key</Link></div>
                      ) : (
                        <>
                          <pre className="mt-3 text-xs bg-muted p-3 rounded-xl overflow-auto whitespace-pre-wrap break-words max-h-[420px]">{r.content}</pre>
                          <div className="mt-2 text-[11px] text-muted-foreground flex gap-3 flex-wrap">
                            {r.latencyMs && <span>{(r.latencyMs / 1000).toFixed(1)}s</span>}
                            {r.usage && <span>{r.usage.total_tokens ?? r.usage.prompt_tokens + r.usage.completion_tokens} tokens</span>}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {agents.map(a => {
              const p = PROVIDERS.find(x => x.id === a.provider);
              return (
                <div key={a.id} className="rounded-2xl border bg-card p-4 md:p-5">
                  <div className="flex items-center justify-between">
                    <div className="h-9 w-9 rounded-xl grid place-items-center text-white text-sm shrink-0" style={{ background: p?.color }}>{p?.icon}</div>
                    <span className="text-[11px] rounded-full bg-muted px-2 py-1 truncate">{p?.name}</span>
                  </div>
                  <div className="mt-3 font-medium text-sm truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.role} • {a.model}</div>
                  <div className="mt-3 flex gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-xs rounded-full bg-muted px-2 py-1"><Code2 className="h-3 w-3" /> code</span>
                    <span className="inline-flex items-center gap-1 text-xs rounded-full bg-muted px-2 py-1"><FileText className="h-3 w-3" /> content</span>
                  </div>
                </div>
              );
            })}
            <Link href="/agents" className="rounded-2xl border border-dashed grid place-items-center p-6 md:p-8 text-sm text-muted-foreground hover:bg-muted min-h-[140px]">
              <Plus className="h-5 w-5 mb-2" /> Add agent
            </Link>
          </div>

          <div className="rounded-2xl bg-foreground text-background p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0"><Eye className="h-5 w-5 shrink-0" /><div className="min-w-0"><div className="font-medium text-sm md:text-base">GodEye OS sees the whole pipeline — live</div><div className="text-xs opacity-70">Orchestrated • Traced • Costed — Providers: Nvidia, OpenRouter, OmeRoute + 8 more • Online via Cloudflare</div></div></div>
            <Link href="/settings" className="rounded-full bg-background text-foreground px-4 py-2 text-sm whitespace-nowrap shrink-0">Customize OS →</Link>
          </div>
        </div>
      </main>

      {/* new project modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm grid place-items-center p-4" onClick={() => setShowNew(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card border p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="font-semibold">New project</div>
              <button onClick={() => setShowNew(false)} className="p-1 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block"><span className="text-xs font-medium">Project name</span><input value={newProj.name} onChange={e => setNewProj({ ...newProj, name: e.target.value })} placeholder="e.g. Q4 Launch" className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none" /></label>
              <label className="block"><span className="text-xs font-medium">Description</span><textarea value={newProj.description} onChange={e => setNewProj({ ...newProj, description: e.target.value })} placeholder="What will this project do?" rows={3} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm outline-none" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-xs font-medium">Color</span>
                  <div className="mt-1 flex gap-2 flex-wrap">
                    {["#f59e0b", "#8b5cf6", "#10b981", "#3b82f6", "#f43f5e", "#76b900"].map(c => (
                      <button key={c} onClick={() => setNewProj({ ...newProj, color: c })} className={`h-8 w-8 rounded-full border-2 ${newProj.color === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ background: c }} />
                    ))}
                  </div>
                </label>
                <label className="block"><span className="text-xs font-medium">Status</span>
                  <select value={newProj.status} onChange={e => setNewProj({ ...newProj, status: e.target.value as any })} className="mt-1 w-full rounded-xl border bg-muted px-3 py-2.5 text-sm">
                    <option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option>
                  </select>
                </label>
              </div>
              <button onClick={createProject} disabled={!newProj.name.trim()} className="w-full rounded-full bg-foreground text-background py-2.5 text-sm font-medium disabled:opacity-40">Create project</button>
              <div className="text-xs text-muted-foreground text-center">Projects are stored locally and sync to cloud once deployed.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
