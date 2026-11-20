"use client";

import { useCallback, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { toast } from "@/components/toast";
import { Cpu, Database, GitBranch, Loader2, MessageSquare, Play, ShieldCheck } from "lucide-react";
import { getDecryptedVaultForApi } from "@/lib/vault-crypto";
import { PROVIDERS, modelsFor, type ProviderId } from "@/lib/providers";
import { useMEDUSA } from "@/lib/store";
import type { AgentMessage, AgentTaskRecord, WorkspaceEntry } from "@/lib/foundation";
import type { RuntimeRunResult } from "@/lib/agent-runtime";

interface RuntimeDetail {
  tasks: AgentTaskRecord[];
  messages: AgentMessage[];
  workspace: WorkspaceEntry[];
}

interface AgentChoice {
  id: string;
  selected: boolean;
  priority: number;
  depends: string;
}

type ChoiceOverride = Partial<Omit<AgentChoice, "id">>;

const STATUS_STYLE: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-700",
  succeeded: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-amber-100 text-amber-700",
  preempted: "bg-orange-100 text-orange-700",
};

export default function RuntimePage() {
  const { agents, vault, settings } = useMEDUSA();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"fanout" | "pipeline">("pipeline");
  const [concurrency, setConcurrency] = useState("3");
  const [minChars, setMinChars] = useState("40");
  const [sections, setSections] = useState("");
  const [observerOn, setObserverOn] = useState(false);
  const [evolve, setEvolve] = useState(false);
  const [observerProvider, setObserverProvider] = useState<ProviderId>("openrouter");
  const [observerModel, setObserverModel] = useState("");
  const [choiceOverrides, setChoiceOverrides] = useState<Record<string, ChoiceOverride>>({});

  const [result, setResult] = useState<RuntimeRunResult | null>(null);
  const [detail, setDetail] = useState<RuntimeDetail | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  // Derive scheduler choices from the store; overrides only hold user edits.
  const choices: AgentChoice[] = agents.map((agent) => ({
    id: agent.id,
    selected: choiceOverrides[agent.id]?.selected ?? true,
    priority: choiceOverrides[agent.id]?.priority ?? 0,
    depends: choiceOverrides[agent.id]?.depends ?? "",
  }));

  const loadDetail = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/agent-runtime?runId=${encodeURIComponent(runId)}`, { cache: "no-store" });
      if (res.ok) setDetail(await res.json() as RuntimeDetail);
    } catch {
      /* the run result already carries the essential data */
    }
  }, []);

  async function run() {
    if (!prompt.trim() || !choices.some((c) => c.selected)) return;
    setRunning(true);
    setError("");
    setDetail(null);
    try {
      const decryptedVault = await getDecryptedVaultForApi(vault as never);
      const selected = choices.filter((c) => c.selected);
      const payload = {
        prompt,
        mode,
        concurrency: Number(concurrency) || 3,
        evolve,
        vault: decryptedVault,
        settings,
        reasoningEffort: settings.reasoningEffort || "off",
        agents: selected.map((c) => {
          const agent = agents.find((a) => a.id === c.id)!;
          return {
            id: agent.id, name: agent.name, role: agent.role,
            provider: agent.provider, model: agent.model,
            systemPrompt: agent.systemPrompt, temperature: agent.temperature,
            priority: c.priority,
            dependsOn: c.depends.split(",").map((s) => s.trim()).filter(Boolean),
          };
        }),
        verifier: {
          minChars: Number(minChars) || 40,
          requireSections: sections.split(",").map((s) => s.trim()).filter(Boolean),
          observer: observerOn ? {
            id: "observer", name: "Observer", role: "Independent verifier",
            provider: observerProvider, model: observerModel || modelsFor(PROVIDERS.find((p) => p.id === observerProvider), vault[observerProvider]?.models)[0]?.id || "",
          } : undefined,
        },
      };
      const res = await fetch("/api/agent-runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json() as RuntimeRunResult & { error?: string };
      if (!res.ok) throw new Error(j.error || "Runtime failed");
      setResult(j);
      toast(`Runtime done — ${j.succeeded}/${j.total} agents succeeded`);
      await loadDetail(j.runId);
    } catch (e) {
      const message = (e as Error)?.message || "Runtime failed";
      setError(message);
      toast(message, "error");
    } finally {
      setRunning(false);
    }
  }

  function updateChoice(id: string, patch: ChoiceOverride) {
    setChoiceOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  const tasks = detail?.tasks || result?.tasks || [];
  const messages = detail?.messages || result?.messages || [];
  const workspace = detail?.workspace || result?.workspace || [];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm md:text-base flex items-center gap-2"><Cpu className="h-4 w-4" /> Agent Runtime</div>
            <div className="text-xs text-muted-foreground truncate">Scheduler · structured protocol · shared workspace · verifiers</div>
          </div>
          <button
            onClick={() => void run()}
            disabled={running || !prompt.trim() || !choices.some((c) => c.selected)}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-2 text-xs disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running…" : "Run runtime"}
          </button>
        </div>

        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Describe the work to delegate to your agents…"
              className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm"
            />
            <div className="grid gap-2 md:grid-cols-4">
              <label className="text-xs">Mode
                <select value={mode} onChange={(e) => setMode(e.target.value as "fanout" | "pipeline")} className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm">
                  <option value="pipeline">Pipeline (dependencies)</option>
                  <option value="fanout">Fan-out (parallel)</option>
                </select>
              </label>
              <label className="text-xs">Concurrency
                <input type="number" min={1} max={6} value={concurrency} onChange={(e) => setConcurrency(e.target.value)} className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="text-xs">Min answer chars
                <input type="number" min={0} max={5000} value={minChars} onChange={(e) => setMinChars(e.target.value)} className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm" />
              </label>
              <label className="text-xs">Required sections
                <input value={sections} onChange={(e) => setSections(e.target.value)} placeholder="e.g. Summary, Risks" className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t pt-3">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={observerOn} onChange={(e) => setObserverOn(e.target.checked)} />
                Observer / verifier agent (consensus vote)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={evolve} onChange={(e) => setEvolve(e.target.checked)} />
                Evolve successful results into the skill genome
              </label>
              {observerOn && (
                <>
                  <select value={observerProvider} onChange={(e) => { const pid = e.target.value as ProviderId; setObserverProvider(pid); setObserverModel(modelsFor(PROVIDERS.find((p) => p.id === pid), vault[pid]?.models)[0]?.id || ""); }} className="rounded-xl border bg-background px-3 py-2 text-xs">
                    {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select value={observerModel} onChange={(e) => setObserverModel(e.target.value)} className="rounded-xl border bg-background px-3 py-2 text-xs">
                    {modelsFor(PROVIDERS.find((p) => p.id === observerProvider), vault[observerProvider]?.models).map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                  </select>
                </>
              )}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium"><GitBranch className="h-4 w-4" /> Task graph <span className="text-muted-foreground font-normal">({choices.filter((c) => c.selected).length} selected)</span></div>
            <div className="mt-3 space-y-2">
              {!agents.length && <div className="text-xs text-muted-foreground">No agents configured. Add some on the Agents page.</div>}
              {choices.map((c) => {
                const agent = agents.find((a) => a.id === c.id);
                if (!agent) return null;
                return (
                  <div key={c.id} className="grid items-center gap-2 rounded-xl border bg-background p-2.5 md:grid-cols-[minmax(0,1fr)_90px_minmax(0,1fr)]">
                    <label className="flex min-w-0 items-center gap-2 text-xs">
                      <input type="checkbox" checked={c.selected} onChange={(e) => updateChoice(c.id, { selected: e.target.checked })} />
                      <span className="truncate"><span className="font-medium">{agent.name}</span> <span className="text-muted-foreground">· {agent.role}</span></span>
                    </label>
                    <label className="text-[11px] text-muted-foreground">Priority
                      <input type="number" min={-100} max={100} value={c.priority} onChange={(e) => updateChoice(c.id, { priority: Number(e.target.value) || 0 })} className="mt-1 w-full rounded-lg border bg-background px-2 py-1 text-xs" />
                    </label>
                    <label className="text-[11px] text-muted-foreground">Depends on (agent ids, comma separated)
                      <input value={c.depends} onChange={(e) => updateChoice(c.id, { depends: e.target.value })} placeholder="none" className="mt-1 w-full rounded-lg border bg-background px-2 py-1 text-xs" />
                    </label>
                  </div>
                );
              })}
            </div>
          </section>

          {error && <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

          {result && (
            <>
              <section className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border bg-card p-4"><div className="text-2xl font-semibold">{result.succeeded}/{result.total}</div><div className="text-xs text-muted-foreground">Agents succeeded</div></div>
                <div className="rounded-2xl border bg-card p-4"><div className="text-2xl font-semibold">{tasks.filter((t) => t.status === "preempted").length}</div><div className="text-xs text-muted-foreground">Preempted by quota</div></div>
                <div className="rounded-2xl border bg-card p-4"><div className="text-2xl font-semibold">{messages.length}</div><div className="text-xs text-muted-foreground">Structured messages</div></div>
                <div className="rounded-2xl border bg-card p-4"><div className="text-xl font-semibold truncate">{result.runId.slice(0, 14)}</div><div className="text-xs text-muted-foreground">Run id · see Runs & Cost</div></div>
              </section>

              {result.consensus && (
                <section className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" /> Observer consensus</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{result.consensus}</pre>
                </section>
              )}

              <section className="space-y-2">
                {tasks.map((t) => (
                  <article key={t.id} className="rounded-2xl border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{t.name} <span className="text-muted-foreground font-normal">· {t.role}</span></div>
                        <div className="text-[11px] text-muted-foreground">{t.provider}/{t.model} · priority {t.priority}{t.dependsOn.length ? ` · depends: ${t.dependsOn.join(", ")}` : ""}</div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] uppercase ${STATUS_STYLE[t.status] || "bg-muted"}`}>{t.status}</span>
                    </div>
                    {t.score != null && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        Verification {Math.round(t.score * 100)}%
                        {t.resultPreview && <span className="truncate">· {t.resultPreview.slice(0, 100)}</span>}
                      </div>
                    )}
                    {t.error && <div className="mt-2 text-xs text-red-600">{t.error}</div>}
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-xs">{t.resultPreview || "—"}</pre>
                  </article>
                ))}
              </section>

              <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><MessageSquare className="h-4 w-4" /> Message timeline</div>
                  <div className="mt-3 max-h-96 space-y-2 overflow-auto">
                    {messages.map((m) => (
                      <div key={m.id} className="rounded-xl bg-muted/50 p-2.5 text-[11px]">
                        <div className="flex items-center justify-between gap-2"><span className="font-mono">#{m.seq} {m.type}</span><span className="text-muted-foreground">{m.from} → {m.to}</span></div>
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">{JSON.stringify(m.payload).slice(0, 300)}</pre>
                      </div>
                    ))}
                    {!messages.length && <div className="text-xs text-muted-foreground">No messages recorded.</div>}
                  </div>
                </section>

                <section className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><Database className="h-4 w-4" /> Shared workspace (CAS)</div>
                  <div className="mt-3 max-h-96 space-y-2 overflow-auto">
                    {workspace.map((w) => (
                      <div key={w.id} className="rounded-xl bg-muted/50 p-2.5 text-[11px]">
                        <div className="flex items-center justify-between gap-2"><span className="font-mono">{w.key}</span><span className="text-muted-foreground">rev {w.revision}</span></div>
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">{JSON.stringify(w.value).slice(0, 300)}</pre>
                      </div>
                    ))}
                    {!workspace.length && <div className="text-xs text-muted-foreground">Workspace is empty.</div>}
                  </div>
                </section>
              </div>
            </>
          )}

          {!result && !running && (
            <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
              Configure agents above and run the runtime to see the scheduler, protocol messages, verification gates and workspace state.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
