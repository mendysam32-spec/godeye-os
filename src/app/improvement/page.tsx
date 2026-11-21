"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { toast } from "@/components/toast";
import {
  Activity, BrainCircuit, CheckCircle2, CircleSlash, Dna, Loader2,
  Play, RefreshCw, Route, ShieldCheck, Sparkles,
} from "lucide-react";
import type {
  ImprovementConfigRecord, ImprovementCycleResult, ImprovementPattern,
  ImprovementProposal, ModelPreference, PostMortemRecord,
} from "@/lib/foundation";

interface ImprovementState {
  postmortems: PostMortemRecord[];
  patterns: ImprovementPattern[];
  proposals: ImprovementProposal[];
  preferences: ModelPreference[];
  config: ImprovementConfigRecord[];
}

const EMPTY_STATE: ImprovementState = {
  postmortems: [], patterns: [], proposals: [], preferences: [], config: [],
};

const STATUS_STYLE: Record<string, string> = {
  proposed: "bg-muted text-muted-foreground",
  validated: "bg-blue-100 text-blue-700",
  merged: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  open: "bg-muted text-muted-foreground",
  proposed_pattern: "bg-blue-100 text-blue-700",
  merged_pattern: "bg-emerald-100 text-emerald-700",
};

const SEVERITY_STYLE: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Request failed");
  return json as T;
}

function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

function usd(value: number): string {
  return `$${Math.max(0, value).toFixed(4)}`;
}

export default function ImprovementPage() {
  const [state, setState] = useState<ImprovementState>(EMPTY_STATE);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [minOccurrences, setMinOccurrences] = useState("2");
  const [autoMerge, setAutoMerge] = useState(false);
  const [cycleResult, setCycleResult] = useState<ImprovementCycleResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await api<ImprovementState>("/api/improvement", { cache: "no-store" }));
    } catch (e) {
      setError((e as Error)?.message || "Could not load improvement state");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const stats = useMemo(() => {
    const total = state.postmortems.length;
    const success = state.postmortems.filter((p) => p.metrics.success).length;
    return {
      total,
      successRate: total ? Math.round((success / total) * 100) : 0,
      patterns: state.patterns.length,
      merged: state.proposals.filter((p) => p.status === "merged").length,
    };
  }, [state]);

  async function act(action: "cycle" | "validate" | "merge" | "reject", id?: string) {
    setBusy(action + (id || ""));
    setError("");
    try {
      const result = await api<Record<string, unknown>>("/api/improvement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          id,
          minOccurrences: Number(minOccurrences) || 2,
          autoMerge,
        }),
      });
      if (action === "cycle") {
        setCycleResult(result as unknown as ImprovementCycleResult);
        const data = result as unknown as ImprovementCycleResult;
        toast(`Cycle complete — ${data.patterns} pattern(s), ${data.proposals.length} proposal(s), ${data.merged} merged`);
      } else {
        toast(`${action} complete`);
      }
      await refresh();
    } catch (e) {
      const message = (e as Error)?.message || `${action} failed`;
      setError(message);
      toast(message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm md:text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Self-Improvement</div>
            <div className="text-xs text-muted-foreground truncate">Post-mortems · pattern mining · skill synthesis · gated evolution</div>
          </div>
          <button
            onClick={() => void act("cycle")}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-2 text-xs disabled:opacity-50"
          >
            {busy === "cycle" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {busy === "cycle" ? "Running…" : "Run cycle"}
          </button>
        </div>

        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
          {error && <div className="rounded-xl border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <BrainCircuit className="h-5 w-5 mt-0.5" style={{ color: "var(--accent)" }} />
              <div className="min-w-0">
                <div className="text-sm font-medium">Execute → Record → Analyze → Synthesize → Propose → Validate → Merge → Genome++</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Post-mortems are recorded automatically when a run finishes. Run a cycle to mine repeated signals and propose
                  declarative skills, routing preferences and architecture config patches. Merging is gated by validation.
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 border-t pt-3">
              <label className="text-xs">Minimum occurrences
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={minOccurrences}
                  onChange={(e) => setMinOccurrences(e.target.value)}
                  className="mt-1 w-24 rounded-lg border bg-background px-2.5 py-1.5 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={autoMerge} onChange={(e) => setAutoMerge(e.target.checked)} />
                Auto-merge validated proposals
              </label>
              <button
                onClick={() => void refresh()}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
            {cycleResult && (
              <div className="text-xs text-muted-foreground border-t pt-2">
                Last cycle: {cycleResult.postmortems} post-mortem(s), {cycleResult.patterns} pattern(s),
                {" "}{cycleResult.validated} validated, {cycleResult.merged} merged
                {cycleResult.autoMerge ? " (auto-merge on)" : ""}.
              </div>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Post-mortems", value: stats.total, icon: Activity },
              { label: "Success rate", value: `${stats.successRate}%`, icon: ShieldCheck },
              { label: "Patterns mined", value: stats.patterns, icon: Route },
              { label: "Proposals merged", value: stats.merged, icon: Dna },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><card.icon className="h-4 w-4" /> {card.label}</div>
                <div className="mt-2 text-2xl font-semibold">{card.value}</div>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4" /> Automatic post-mortems</h2>
            {state.postmortems.length === 0 && <p className="text-sm text-muted-foreground">No finished runs yet. Complete a chat or runtime task to generate the first retrospective.</p>}
            <div className="space-y-2">
              {state.postmortems.slice(0, 40).map((pm) => (
                <div key={pm.id} className="rounded-xl border bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${pm.metrics.success ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{pm.status}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5">{pm.taskClass}</span>
                    <span className="text-muted-foreground">{seconds(pm.metrics.durationMs)} · {usd(pm.metrics.costUsd)} · {pm.metrics.tokens} tokens · {pm.metrics.eventCount} events</span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">{pm.runId}</span>
                  </div>
                  <p className="mt-2 text-sm">{pm.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pm.findings.map((f, i) => (
                      <span key={`${f.code}-${i}`} className={`rounded-full px-2 py-0.5 text-[11px] ${SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.info}`} title={f.detail}>{f.code}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Route className="h-4 w-4" /> Mined patterns</h2>
            {state.patterns.length === 0 && <p className="text-sm text-muted-foreground">Patterns appear when the same signal repeats across finished runs.</p>}
            <div className="grid gap-2 md:grid-cols-2">
              {state.patterns.map((pattern) => (
                <div key={pattern.id} className="rounded-xl border bg-background p-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-muted px-2 py-0.5">{pattern.taskClass}</span>
                    <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">{pattern.pain}</span>
                    <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[`${pattern.status}_pattern`] || STATUS_STYLE.open}`}>{pattern.status}</span>
                    <span className="ml-auto text-muted-foreground">×{pattern.occurrences}</span>
                  </div>
                  <div className="mt-2 text-sm font-medium">{pattern.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{pattern.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Improvement proposals</h2>
            {state.proposals.length === 0 && <p className="text-sm text-muted-foreground">Run a cycle after a few tasks to synthesize proposals.</p>}
            <div className="space-y-2">
              {state.proposals.map((proposal) => (
                <div key={proposal.id} className="rounded-xl border bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-muted px-2 py-0.5">{proposal.type}</span>
                    <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[proposal.status] || STATUS_STYLE.proposed}`}>{proposal.status}</span>
                    {proposal.validation.passed && <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> validated</span>}
                    {proposal.skillId && <span className="font-mono text-[11px] text-muted-foreground">{proposal.skillId}</span>}
                  </div>
                  <div className="mt-2 text-sm font-medium">{proposal.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{proposal.rationale}</p>
                  {proposal.validation.checks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {proposal.validation.checks.map((check) => (
                        <span key={check.name} className={`rounded-full px-2 py-0.5 text-[11px] ${check.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`} title={check.detail || check.name}>{check.name}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      disabled={!!busy || proposal.status === "merged" || proposal.status === "rejected"}
                      onClick={() => void act("validate", proposal.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" /> Validate
                    </button>
                    <button
                      disabled={!!busy || !proposal.validation.passed || proposal.status === "merged" || proposal.status === "rejected"}
                      onClick={() => void act("merge", proposal.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-foreground text-background px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      {busy === `merge${proposal.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Dna className="h-3.5 w-3.5" />}
                      Merge
                    </button>
                    <button
                      disabled={!!busy || proposal.status === "merged" || proposal.status === "rejected"}
                      onClick={() => void act("reject", proposal.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      <CircleSlash className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border bg-card p-4 space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Route className="h-4 w-4" /> Model preference data</h2>
              {state.preferences.length === 0 && <p className="text-sm text-muted-foreground">Preference rows are recorded from each run’s outcome, cost and latency.</p>}
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {state.preferences.slice(0, 40).map((pref) => (
                  <div key={pref.id} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs">
                    <span className="rounded-full bg-muted px-2 py-0.5">{pref.taskClass}</span>
                    <span className="truncate font-mono">{pref.provider}/{pref.model}</span>
                    <span className={pref.outcome === "success" ? "text-emerald-600" : "text-red-600"}>{pref.outcome}</span>
                    <span className="ml-auto text-muted-foreground">score {pref.score.toFixed(2)} · {usd(pref.costUsd)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-4 space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Dna className="h-4 w-4" /> Adopted configuration</h2>
              {state.config.length === 0 && <p className="text-sm text-muted-foreground">Merged routing and architecture patches appear here.</p>}
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {state.config.map((entry) => (
                  <div key={entry.id} className="rounded-lg bg-background px-3 py-2">
                    <div className="text-xs font-medium">{entry.key}</div>
                    <pre className="mt-1 overflow-x-auto text-[11px] text-muted-foreground">{JSON.stringify(entry.value, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
