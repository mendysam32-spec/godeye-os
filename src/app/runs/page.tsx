"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { readChatStream } from "@/lib/chat-stream";
import { Activity, GitBranch, Loader2, Play, RefreshCw, Wallet } from "lucide-react";
import { PROVIDERS, isFreeModel, modelsFor, type ProviderId } from "@/lib/providers";
import type { ReplaySpec } from "@/lib/replay";
import { getDecryptedVaultForApi } from "@/lib/vault-crypto";
import { useMEDUSA } from "@/lib/store";
import type { ExecutionEvent, ExecutionRun, UsageEvent, UsageSummary } from "@/lib/foundation";

interface RunDetail {
  run: ExecutionRun;
  events: ExecutionEvent[];
  replay: Record<string, unknown>;
}

interface DivergenceForm {
  provider: string;
  model: string;
  reasoningEffort: string;
  temperature: string;
  contextNote: string;
}

interface DivergenceResult {
  runId: string;
  provider: string;
  model: string;
  content: string;
  tokens: number;
  costUsd: number;
  latencyMs: number;
}

const STATUS_STYLE: Record<string, string> = {
  running: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  aborted: "bg-amber-100 text-amber-700",
};

const EFFORTS = ["off", "low", "medium", "high", "extra-high"];

function money(value: number): string {
  return `$${value.toFixed(4)}`;
}

function preview(value: unknown, max = 420): string {
  return typeof value === "string" && value ? value.slice(0, max) : "—";
}

export default function RunsPage() {
  const router = useRouter();
  const { vault, settings, skills } = useMEDUSA();
  const enabledSkills = (skills || []).filter((s) => s.enabled);

  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const detailRef = useRef<RunDetail | null>(null);
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<DivergenceForm>({
    provider: "", model: "", reasoningEffort: "off", temperature: "0.6", contextNote: "",
  });
  const [divergence, setDivergence] = useState<DivergenceResult | null>(null);
  const [divergenceBusy, setDivergenceBusy] = useState(false);
  const [divergenceError, setDivergenceError] = useState("");

  const openRun = useCallback(async (id: string, setBusy = true) => {
    if (setBusy) setBusyId(id);
    try {
      const res = await fetch(`/api/traces/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) return;
      const next = await res.json() as RunDetail;
      detailRef.current = next;
      setDetail(next);
    } finally {
      if (setBusy) setBusyId(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, usageRes] = await Promise.all([
        fetch("/api/traces?limit=80", { cache: "no-store" }),
        fetch("/api/usage?limit=300", { cache: "no-store" }),
      ]);
      const r = await runsRes.json() as { runs?: ExecutionRun[] };
      const u = await usageRes.json() as { events?: UsageEvent[]; summary?: UsageSummary };
      setRuns(r.runs || []);
      setEvents(u.events || []);
      setSummary(u.summary || null);
      const selected = detailRef.current?.run.id;
      const keep = selected && (r.runs || []).some((x) => x.id === selected);
      if (keep && selected) void openRun(selected, false);
      else if (r.runs?.length) void openRun(r.runs[0].id, false);
      else {
        detailRef.current = null;
        setDetail(null);
      }
    } catch {
      /* keep the last good view */
    } finally {
      setLoading(false);
    }
  }, [openRun]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const current = detailRef.current;
    if (!current) return;
    const snapshot = current.replay || {};
    const temperature = typeof snapshot.temperature === "number" ? snapshot.temperature : 0.6;
    setForm({
      provider: String(snapshot.provider || current.run.provider || ""),
      model: String(snapshot.model || current.run.model || ""),
      reasoningEffort: String(snapshot.reasoningEffort || "off"),
      temperature: String(temperature),
      contextNote: "",
    });
    setDivergence(null);
    setDivergenceError("");
  }, [detail?.run.id]);

  function replayPrompt() {
    if (!detail) return;
    const prompt = String(detail.replay.prompt || detail.run.prompt || "");
    if (!prompt) return;
    try {
      localStorage.setItem("medusa:replay-prompt", prompt);
    } catch { /* composer stays empty if storage is blocked */ }
    router.push("/chat");
  }

  function usageFor(runId: string | undefined) {
    const matching = events.filter((e) => e.runId === runId);
    return {
      tokens: matching.reduce((n, e) => n + (e.totalTokens || 0), 0),
      costUsd: matching.reduce((n, e) => n + (e.costUsd || 0), 0),
      latencyMs: matching.reduce((n, e) => n + (e.latencyMs || 0), 0),
    };
  }

  function llmPayload(runDetail: RunDetail, type: string): Record<string, unknown> {
    const hit = [...runDetail.events].reverse().find((e) => e.type === type);
    return hit?.payload || {};
  }

  async function finishChild(runId: string, status: "completed" | "failed", error?: string) {
    try {
      await fetch(`/api/traces/${encodeURIComponent(runId)}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, error: error ?? null }),
      });
    } catch { /* best effort */ }
  }

  async function runDivergence() {
    if (!detail || divergenceBusy) return;
    setDivergenceBusy(true);
    setDivergenceError("");
    let childId: string | null = null;
    try {
      const prepRes = await fetch(`/api/traces/${encodeURIComponent(detail.run.id)}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.provider,
          model: form.model,
          reasoningEffort: form.reasoningEffort,
          temperature: form.temperature.trim() ? Number(form.temperature) : null,
          contextNote: form.contextNote,
        }),
      });
      const prep = await prepRes.json() as { runId?: string; spec?: ReplaySpec; error?: string };
      if (!prepRes.ok || !prep.runId || !prep.spec) throw new Error(prep.error || "Could not prepare replay");
      childId = prep.runId;
      const spec = prep.spec;

      const decryptedVault = await getDecryptedVaultForApi(vault);
      const providerId = spec.provider as ProviderId;
      const dynamicModels = vault[providerId]?.models;
      const freeModels = modelsFor(PROVIDERS.find((p) => p.id === providerId), dynamicModels)
        .filter((m) => isFreeModel(m))
        .map((m) => m.id);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: spec.messages,
          provider: spec.provider,
          model: spec.model,
          mode: spec.mode,
          vault: decryptedVault,
          settings,
          skills: enabledSkills.map((s) => ({
            name: s.name, description: s.description, instructions: s.instructions,
            diskPath: s.diskPath, files: s.files,
          })),
          freeModels,
          stream: false,
          toolsEnabled: false,
          reasoningEffort: spec.reasoningEffort || "off",
          temperature: spec.temperature,
          runId: childId,
          chatId: spec.chatId,
          parentRunId: detail.run.id,
          replayOf: spec.replayOf,
          divergence: spec.divergence,
          memories: [],
        }),
      });
      const result = await readChatStream(res);
      if (result.error) throw new Error(result.error);

      await finishChild(childId, "completed");
      setDivergence({
        runId: childId,
        provider: result.provider || spec.provider,
        model: result.model || spec.model,
        content: result.text || "",
        tokens: result.usage?.total_tokens || 0,
        costUsd: result.usage?.cost_usd || 0,
        latencyMs: result.latencyMs || 0,
      });
      await load();
    } catch (e) {
      const message = (e as Error)?.message || "Divergence replay failed";
      if (childId) await finishChild(childId, "failed", message);
      setDivergenceError(message);
    } finally {
      setDivergenceBusy(false);
    }
  }

  const forks = detail ? runs.filter((r) => r.parentRunId === detail.run.id) : [];
  const baseUsage = detail ? usageFor(detail.run.id) : { tokens: 0, costUsd: 0, latencyMs: 0 };
  const baseOutput = detail
    ? preview(llmPayload(detail, "llm.completed").responsePreview || llmPayload(detail, "reply.final").preview)
    : "—";

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm md:text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Runs & Cost</div>
            <div className="text-xs text-muted-foreground truncate">
              {runs.length} recorded {runs.length === 1 ? "run" : "runs"} · costs are best-effort estimates
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/economy")} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs hover:bg-muted">
              <Wallet className="h-3.5 w-3.5" /> Economy
            </button>
            <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs hover:bg-muted">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border bg-card p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Estimated spend</div>
              <div className="mt-1 text-2xl font-semibold">{money(summary?.costUsd ?? 0)}</div>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tokens used</div>
              <div className="mt-1 text-2xl font-semibold">{(summary?.totalTokens ?? 0).toLocaleString()}</div>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Billable calls</div>
              <div className="mt-1 text-2xl font-semibold">{summary?.events ?? 0}</div>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Providers</div>
              <div className="mt-1 text-2xl font-semibold">{summary?.byProvider.length ?? 0}</div>
            </div>
          </section>

          {!!summary?.byProvider.length && (
            <section className="rounded-2xl border bg-card p-4">
              <div className="font-medium text-sm">Spend by provider</div>
              <div className="mt-3 space-y-2">
                {summary.byProvider.map((p) => (
                  <div key={p.provider} className="flex items-center gap-3 text-xs">
                    <span className="w-28 truncate capitalize">{p.provider}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${summary.costUsd ? Math.max(2, (p.costUsd / summary.costUsd) * 100) : 0}%`, background: "var(--accent)" }}
                      />
                    </div>
                    <span className="w-20 text-right tabular-nums">{money(p.costUsd)}</span>
                    <span className="w-20 text-right tabular-nums text-muted-foreground">{p.tokens.toLocaleString()} tok</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
            <section className="rounded-2xl border bg-card p-3">
              <div className="px-1 pb-2 font-medium text-sm">Execution runs</div>
              <div className="max-h-[620px] space-y-1.5 overflow-auto">
                {!runs.length && <div className="p-4 text-xs text-muted-foreground">No runs yet. Send a chat message to create one.</div>}
                {runs.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => void openRun(r.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${detail?.run.id === r.id ? "border-foreground bg-muted" : "hover:bg-muted/50"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate">{r.prompt || "Untitled run"}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase ${STATUS_STYLE[r.status] || "bg-muted"}`}>{r.status}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground truncate">
                      {r.parentRunId ? <GitBranch className="mr-1 inline h-3 w-3" /> : null}
                      {r.provider}/{r.model} · {new Date(r.startedAt).toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-4 min-w-0">
              {!detail ? (
                <div className="grid h-full min-h-[420px] place-items-center text-sm text-muted-foreground">
                  {busyId ? <Loader2 className="h-5 w-5 animate-spin" /> : "Select a run to inspect its timeline."}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium break-words">{detail.run.prompt || "Untitled run"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {detail.run.provider || "?"}/{detail.run.model || "?"} · {detail.run.mode || "chat"} · {detail.events.length} events
                      </div>
                    </div>
                    <button
                      onClick={replayPrompt}
                      className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-2 text-xs"
                    >
                      <Play className="h-3.5 w-3.5" /> Replay prompt
                    </button>
                  </div>

                  <section className="mt-4 rounded-xl border bg-background p-3">
                    <div className="flex items-center gap-2 text-xs font-medium"><GitBranch className="h-3.5 w-3.5" /> Diverge from this run</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Re-runs the recorded snapshot as a single LLM call with your overrides. Tool calls are not executed.
                    </p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <select
                        value={form.provider}
                        onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                        className="rounded-lg border bg-background px-2.5 py-2 text-xs"
                      >
                        {!form.provider && <option value="">Select provider</option>}
                        {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input
                        value={form.model}
                        onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                        placeholder="Model id"
                        className="rounded-lg border bg-background px-2.5 py-2 text-xs"
                      />
                      <select
                        value={form.reasoningEffort}
                        onChange={(e) => setForm((f) => ({ ...f, reasoningEffort: e.target.value }))}
                        className="rounded-lg border bg-background px-2.5 py-2 text-xs"
                      >
                        {EFFORTS.map((v) => <option key={v} value={v}>Effort: {v}</option>)}
                      </select>
                      <input
                        value={form.temperature}
                        onChange={(e) => setForm((f) => ({ ...f, temperature: e.target.value }))}
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        placeholder="Temperature"
                        className="rounded-lg border bg-background px-2.5 py-2 text-xs"
                      />
                    </div>
                    <textarea
                      value={form.contextNote}
                      onChange={(e) => setForm((f) => ({ ...f, contextNote: e.target.value }))}
                      placeholder="Add context to the last user message (optional)"
                      rows={2}
                      className="mt-2 w-full rounded-lg border bg-background px-2.5 py-2 text-xs"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => void runDivergence()}
                        disabled={divergenceBusy || !form.provider || !form.model}
                        className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-2 text-xs disabled:opacity-50"
                      >
                        {divergenceBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
                        {divergenceBusy ? "Running…" : "Diverge & run"}
                      </button>
                      {divergenceError && <span className="text-[11px] text-red-500">{divergenceError}</span>}
                    </div>
                  </section>

                  {!!forks.length && (
                    <section className="mt-3 rounded-xl border bg-background p-3">
                      <div className="text-xs font-medium">Divergence branches</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {forks.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => void openRun(f.id)}
                            className="rounded-full border px-2.5 py-1.5 text-[11px] hover:bg-muted"
                          >
                            {f.model || "model"} · {f.status}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {divergence && (
                    <section className="mt-3 rounded-xl border bg-background p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-medium">Original vs divergent</div>
                        <button
                          onClick={() => void openRun(divergence.runId)}
                          className="rounded-full border px-2.5 py-1 text-[11px] hover:bg-muted"
                        >
                          Inspect branch run
                        </button>
                      </div>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-muted-foreground">
                            <tr><th />
                              <th className="py-1">Original</th><th>Divergent</th></tr>
                          </thead>
                          <tbody>
                            <tr className="border-t"><td className="py-1.5 text-muted-foreground">Model</td>
                              <td>{detail.run.provider}/{detail.run.model}</td><td>{divergence.provider}/{divergence.model}</td></tr>
                            <tr className="border-t"><td className="py-1.5 text-muted-foreground">Tokens</td>
                              <td>{baseUsage.tokens.toLocaleString()}</td><td>{divergence.tokens.toLocaleString()}</td></tr>
                            <tr className="border-t"><td className="py-1.5 text-muted-foreground">Cost</td>
                              <td>{money(baseUsage.costUsd)}</td><td>{money(divergence.costUsd)}</td></tr>
                            <tr className="border-t"><td className="py-1.5 text-muted-foreground">Latency</td>
                              <td>{baseUsage.latencyMs ? `${(baseUsage.latencyMs / 1000).toFixed(1)}s` : "—"}</td>
                              <td>{divergence.latencyMs ? `${(divergence.latencyMs / 1000).toFixed(1)}s` : "—"}</td></tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Original answer</div>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-[11px]">{baseOutput}</pre>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Divergent answer</div>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-[11px]">{preview(divergence.content)}</pre>
                        </div>
                      </div>
                    </section>
                  )}

                  <div className="mt-4 space-y-2">
                    {detail.events.map((e) => (
                      <div key={e.id} className="rounded-xl border bg-background p-3">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono text-muted-foreground">#{e.seq} {e.type}</span>
                          <span className="text-muted-foreground">{new Date(e.createdAt).toLocaleTimeString()}</span>
                        </div>
                        {Object.keys(e.payload).length > 0 && (
                          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
                            {JSON.stringify(e.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                    {!detail.events.length && <div className="p-6 text-center text-xs text-muted-foreground">No events recorded for this run.</div>}
                  </div>
                </>
              )}
            </section>
          </div>

          {!!events.length && (
            <section className="rounded-2xl border bg-card p-4">
              <div className="font-medium text-sm">Recent usage events</div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr><th className="py-2">When</th><th>Provider</th><th>Model</th><th className="text-right">Tokens</th><th className="text-right">Cost</th><th>Pricing</th></tr>
                  </thead>
                  <tbody>
                    {events.slice(0, 40).map((e) => (
                      <tr key={e.id} className="border-t">
                        <td className="py-2">{new Date(e.createdAt).toLocaleString()}</td>
                        <td>{e.provider}</td>
                        <td className="max-w-[280px] truncate">{e.model}</td>
                        <td className="text-right tabular-nums">{e.totalTokens.toLocaleString()}</td>
                        <td className="text-right tabular-nums">{money(e.costUsd)}</td>
                        <td className="text-muted-foreground">{e.pricingSource}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
