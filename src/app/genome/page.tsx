"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { toast } from "@/components/toast";
import { getDecryptedVaultForApi } from "@/lib/vault-crypto";
import { PROVIDERS, modelsFor, type ProviderId } from "@/lib/providers";
import { useMEDUSA } from "@/lib/store";
import type {
  SkillGenomeKind,
  SkillGenomeRecord,
  SkillOutcome,
  VerificationCheck,
} from "@/lib/foundation";
import {
  Dna, Download, FlaskConical, GitBranch, Loader2, Play, Plus, RefreshCw,
  ShieldCheck, Trophy,
} from "lucide-react";

interface GenomeList {
  skills: SkillGenomeRecord[];
  outcomes: SkillOutcome[];
}

interface TestResult {
  ok: boolean;
  skill: SkillGenomeRecord | null;
  runId: string;
  outcomes: SkillOutcome[];
  summary: string;
  error?: string;
}

interface SelectionResult {
  familyId: string;
  winner: SkillGenomeRecord | null;
  ranked: SkillGenomeRecord[];
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Request failed");
  return json as T;
}

function splitLines(value: string): string[] {
  return value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  candidate: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  retired: "bg-amber-100 text-amber-700",
};

export default function GenomePage() {
  const { vault, settings, addSkill } = useMEDUSA();
  const [skills, setSkills] = useState<SkillGenomeRecord[]>([]);
  const [outcomes, setOutcomes] = useState<SkillOutcome[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<SkillGenomeKind>("prompt");
  const [body, setBody] = useState(
    "## Purpose\nDescribe when to use this skill.\n\n## Steps\n1. Validate the request.\n2. Produce the artifact.\n3. State how each postcondition was met.",
  );
  const [preconditions, setPreconditions] = useState("");
  const [postconditions, setPostconditions] = useState("");
  const [sideEffects, setSideEffects] = useState("none");
  const [tags, setTags] = useState("");
  const [testInput, setTestInput] = useState("");
  const [expectContains, setExpectContains] = useState("");

  const [mutateStrategy, setMutateStrategy] = useState<"tighten" | "example" | "reorder">("tighten");
  const [crossoverId, setCrossoverId] = useState("");
  const [importRunId, setImportRunId] = useState("");
  const [provider, setProvider] = useState<ProviderId>(settings.defaultProvider || "openrouter");
  const [model, setModel] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await api<GenomeList>("/api/genome", { cache: "no-store" });
      setSkills(data.skills);
      setOutcomes(data.outcomes);
      setSelectedId((prev) =>
        prev && data.skills.some((s) => s.id === prev) ? prev : data.skills[0]?.id || "",
      );
    } catch (e) {
      setError((e as Error)?.message || "Could not load genome");
    }
  }, []);

  useEffect(() => {
    // Defer hydration-time loading so React never treats the initial fetch as a
    // synchronous state update inside the effect body.
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const selected = useMemo(
    () => skills.find((s) => s.id === selectedId) || null,
    [skills, selectedId],
  );
  const family = useMemo(
    () => selected ? skills.filter((s) => s.familyId === selected.familyId) : [],
    [skills, selected],
  );
  const selectedOutcomes = useMemo(
    () => outcomes.filter((o) => o.skillId === selectedId),
    [outcomes, selectedId],
  );
  const models = useMemo(
    () => modelsFor(PROVIDERS.find((p) => p.id === provider), vault[provider]?.models),
    [provider, vault],
  );
  const activeModel = model && models.some((m) => m.id === model) ? model : models[0]?.id || "";

  function wrap(action: string, fn: () => Promise<void>): () => Promise<void> {
    return async () => {
      setBusy(action);
      setError("");
      try {
        await fn();
      } catch (e) {
        const message = (e as Error)?.message || `${action} failed`;
        setError(message);
        toast(message, "error");
      } finally {
        setBusy(null);
      }
    };
  }

  const register = wrap("register", async () => {
    if (!name.trim() || !body.trim()) throw new Error("A name and body are required");
    const tests = testInput.trim() ? [{
      name: "Author test",
      input: testInput.trim(),
      expectContains: splitLines(expectContains),
      maxChars: 8_000,
    }] : [];
    const { skill } = await api<{ skill: SkillGenomeRecord }>("/api/genome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, slug, description, kind, body, tests,
        dna: {
          preconditions: splitLines(preconditions),
          postconditions: splitLines(postconditions),
          sideEffects: splitLines(sideEffects),
          tags: splitLines(tags),
        },
      }),
    });
    setSelectedId(skill.id);
    setName("");
    setSlug("");
    setTestInput("");
    setExpectContains("");
    toast(`${skill.name} v${skill.version} registered`);
    await refresh();
  });

  const addTest = wrap("add test", async () => {
    if (!selected || !testInput.trim()) throw new Error("Select a skill and provide a test input");
    await api(`/api/genome/${encodeURIComponent(selected.id)}/tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Author test",
        input: testInput.trim(),
        expectContains: splitLines(expectContains),
        maxChars: 8_000,
      }),
    });
    setTestInput("");
    setExpectContains("");
    toast("Test case added to this version");
    await refresh();
  });

  const runTests = wrap("test", async () => {
    if (!selected) throw new Error("Select a skill first");
    if (!activeModel) throw new Error(`No model available for ${provider}`);
    const decryptedVault = await getDecryptedVaultForApi(vault as never);
    const result = await api<TestResult>(`/api/genome/${encodeURIComponent(selected.id)}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vault: decryptedVault,
        provider,
        model: activeModel,
        effort: settings.reasoningEffort || "off",
      }),
    });
    setTestResult(result);
    toast(result.summary, result.ok ? "success" : "error");
    await refresh();
  });

  const mutate = wrap("mutate", async () => {
    if (!selected) throw new Error("Select a parent skill");
    const { skill } = await api<{ skill: SkillGenomeRecord }>("/api/genome/evolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mutate", parentId: selected.id, strategy: mutateStrategy }),
    });
    setSelectedId(skill.id);
    toast(`Created ${skill.name} v${skill.version} by mutation`);
    await refresh();
  });

  const crossover = wrap("crossover", async () => {
    if (!selected || !crossoverId) throw new Error("Select two parent skills");
    const { skill } = await api<{ skill: SkillGenomeRecord }>("/api/genome/evolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "crossover", aId: selected.id, bId: crossoverId }),
    });
    setSelectedId(skill.id);
    toast(`Created ${skill.name} v${skill.version} by crossover`);
    await refresh();
  });

  const select = wrap("select", async () => {
    if (!selected) throw new Error("Select a family first");
    const result = await api<SelectionResult>("/api/genome/evolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "select", familyId: selected.familyId }),
    });
    if (result.winner) setSelectedId(result.winner.id);
    toast(result.winner ? `${result.winner.name} v${result.winner.version} is active` : "Nothing to select");
    await refresh();
  });

  const importRun = wrap("import run", async () => {
    if (!importRunId.trim()) throw new Error("Enter a runtime run id");
    const { skill } = await api<{ skill: SkillGenomeRecord }>("/api/genome/from-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: importRunId.trim() }),
    });
    setSelectedId(skill.id);
    setImportRunId("");
    toast(`${skill.name} authored from run`);
    await refresh();
  });

  const install = wrap("install", async () => {
    if (!selected) throw new Error("Select a skill first");
    addSkill({
      id: `${selected.slug}-v${selected.version}`.slice(0, 120),
      name: selected.name,
      description: selected.description,
      version: `v${selected.version}`,
      source: "genome",
      enabled: true,
      instructions: selected.body,
      entry: "SKILL.md",
      files: [],
      fileCount: 0,
      bytes: selected.body.length,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    toast(`${selected.name} v${selected.version} installed as a chat skill`);
  });

  const activeCount = skills.filter((s) => s.status === "active").length;
  const passCount = outcomes.filter((o) => o.passed).length;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm md:text-base flex items-center gap-2"><Dna className="h-4 w-4" /> Skill Genome</div>
            <div className="text-xs text-muted-foreground truncate">
              {skills.length} versions · {activeCount} active · {passCount}/{outcomes.length} tests passed
            </div>
          </div>
          <button
            onClick={() => void refresh().catch((e) => toast((e as Error)?.message || "Refresh failed", "error"))}
            className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
          {error && <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

          <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="space-y-5">
              <section className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium"><Plus className="h-4 w-4" /> Register candidate</div>
                <div className="mt-3 space-y-2">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Skill name" className="w-full rounded-xl border bg-background px-3 py-2 text-sm" />
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug (optional)" className="w-full rounded-xl border bg-background px-3 py-2 text-xs" />
                  <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When should agents use this?" className="w-full rounded-xl border bg-background px-3 py-2 text-xs" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={kind} onChange={(e) => setKind(e.target.value as SkillGenomeKind)} className="rounded-xl border bg-background px-3 py-2 text-xs">
                      <option value="prompt">Prompt skill</option>
                      <option value="tool">Tool spec (JSON)</option>
                    </select>
                    <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma" className="rounded-xl border bg-background px-3 py-2 text-xs" />
                  </div>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} className="w-full rounded-xl border bg-background px-3 py-2 font-mono text-[11px]" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={preconditions} onChange={(e) => setPreconditions(e.target.value)} placeholder="Preconditions, comma" className="rounded-xl border bg-background px-3 py-2 text-xs" />
                    <input value={postconditions} onChange={(e) => setPostconditions(e.target.value)} placeholder="Postconditions, comma" className="rounded-xl border bg-background px-3 py-2 text-xs" />
                  </div>
                  <input value={sideEffects} onChange={(e) => setSideEffects(e.target.value)} placeholder="Side effects, comma" className="w-full rounded-xl border bg-background px-3 py-2 text-xs" />
                  <input value={testInput} onChange={(e) => setTestInput(e.target.value)} placeholder="First test input (optional)" className="w-full rounded-xl border bg-background px-3 py-2 text-xs" />
                  <input value={expectContains} onChange={(e) => setExpectContains(e.target.value)} placeholder="Expect phrases, comma" className="w-full rounded-xl border bg-background px-3 py-2 text-xs" />
                  <button onClick={() => void register()} disabled={!!busy || !name.trim() || !body.trim()} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-xs text-background disabled:opacity-50">
                    {busy === "register" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Register version
                  </button>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Tool specs are declarative JSON only — the genome never stores or runs arbitrary code.
                  </p>
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium"><GitBranch className="h-4 w-4" /> Versions</div>
                <div className="mt-3 max-h-80 space-y-2 overflow-auto">
                  {skills.map((skill) => (
                    <button
                      key={skill.id}
                      onClick={() => setSelectedId(skill.id)}
                      className={`w-full rounded-xl border p-2.5 text-left text-xs transition ${skill.id === selectedId ? "border-foreground bg-muted" : "hover:bg-muted/50"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{skill.name} <span className="text-muted-foreground">v{skill.version}</span></span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase ${STATUS_STYLE[skill.status] || "bg-muted"}`}>{skill.status}</span>
                      </div>
                      <div className="mt-1 truncate text-[10px] text-muted-foreground">
                        gen {skill.generation} · {skill.operator} · fitness {Math.round(skill.fitness * 100)}% · trust {Math.round(skill.dna.trustScore * 100)}%
                      </div>
                    </button>
                  ))}
                  {!skills.length && <div className="text-xs text-muted-foreground">No genome versions yet. Register one or import from a runtime run.</div>}
                </div>
              </section>
            </div>

            <div className="space-y-5">
              <section className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" /> Genetic operators</div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs font-medium">Mutate selected</div>
                    <select value={mutateStrategy} onChange={(e) => setMutateStrategy(e.target.value as typeof mutateStrategy)} className="mt-2 w-full rounded-lg border bg-background px-2 py-1.5 text-xs">
                      <option value="tighten">Tighten contract</option>
                      <option value="example">Add worked example</option>
                      <option value="reorder">Reorder sections</option>
                    </select>
                    <button onClick={() => void mutate()} disabled={!selected || !!busy} className="mt-2 w-full rounded-lg bg-muted px-2 py-1.5 text-xs disabled:opacity-50">Create mutation</button>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs font-medium">Crossover</div>
                    <select value={crossoverId} onChange={(e) => setCrossoverId(e.target.value)} className="mt-2 w-full rounded-lg border bg-background px-2 py-1.5 text-xs">
                      <option value="">Choose second parent…</option>
                      {skills.filter((s) => s.id !== selectedId).map((s) => <option key={s.id} value={s.id}>{s.name} v{s.version}</option>)}
                    </select>
                    <button onClick={() => void crossover()} disabled={!selected || !crossoverId || !!busy} className="mt-2 w-full rounded-lg bg-muted px-2 py-1.5 text-xs disabled:opacity-50">Create crossover</button>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs font-medium">Select by fitness</div>
                    <p className="mt-2 min-h-10 text-[10px] leading-relaxed text-muted-foreground">Promotes the best-tested version in this family and retires the previous active version.</p>
                    <button onClick={() => void select()} disabled={!selected || !!busy} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-muted px-2 py-1.5 text-xs disabled:opacity-50"><Trophy className="h-3.5 w-3.5" /> Select winner</button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                  <input value={importRunId} onChange={(e) => setImportRunId(e.target.value)} placeholder="Runtime run id to evolve from" className="min-w-56 flex-1 rounded-xl border bg-background px-3 py-2 text-xs" />
                  <button onClick={() => void importRun()} disabled={!importRunId.trim() || !!busy} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs disabled:opacity-50"><Dna className="h-3.5 w-3.5" /> Author from run</button>
                </div>
              </section>

              {selected ? (
                <>
                  <section className="rounded-2xl border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-base font-semibold">
                          {selected.name} <span className="text-sm font-normal text-muted-foreground">v{selected.version}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] uppercase ${STATUS_STYLE[selected.status] || "bg-muted"}`}>{selected.status}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{selected.description || "No description"}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                          <span>{selected.kind}</span><span>·</span><span>generation {selected.generation}</span><span>·</span><span>{selected.operator}</span>
                          <span>·</span><span>fitness {Math.round(selected.fitness * 100)}%</span><span>·</span><span>trust {Math.round(selected.dna.trustScore * 100)}%</span>
                        </div>
                      </div>
                      <button onClick={() => void install()} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs text-background disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Install as skill</button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl bg-muted/50 p-3 text-[11px]">
                        <div className="font-medium">Skill DNA</div>
                        <dl className="mt-2 space-y-1.5 text-muted-foreground">
                          <div><dt className="inline font-medium text-foreground">Preconditions:</dt> {selected.dna.preconditions.join(", ") || "—"}</div>
                          <div><dt className="inline font-medium text-foreground">Postconditions:</dt> {selected.dna.postconditions.join(", ") || "—"}</div>
                          <div><dt className="inline font-medium text-foreground">Side effects:</dt> {selected.dna.sideEffects.join(", ") || "—"}</div>
                          <div><dt className="inline font-medium text-foreground">Cost model:</dt> {selected.dna.costModel.promptTokens} in / {selected.dna.costModel.completionTokens} out · ${selected.dna.costModel.costUsd.toFixed(6)} ({selected.dna.costModel.source || "unmeasured"})</div>
                          <div><dt className="inline font-medium text-foreground">Tags:</dt> {selected.dna.tags.join(", ") || "—"}</div>
                        </dl>
                      </div>
                      <div className="rounded-xl bg-muted/50 p-3 text-[11px]">
                        <div className="font-medium">Lineage</div>
                        <div className="mt-2 space-y-1 text-muted-foreground">
                          <div>Parents: {selected.parentIds.length ? selected.parentIds.map((id) => id.slice(0, 12)).join(", ") : "none (seed)"}</div>
                          <div>Family versions: {family.length}</div>
                          {selected.dna.provenance.slice(-4).map((p, i) => (
                            <div key={i} className="truncate">{p.kind}: {p.note || p.runId || p.at}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-[11px]">{selected.body}</pre>
                  </section>

                  <section className="rounded-2xl border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium"><FlaskConical className="h-4 w-4" /> Tests & measured outcomes</div>
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <select value={provider} onChange={(e) => { setProvider(e.target.value as ProviderId); setModel(""); }} className="rounded-xl border bg-background px-3 py-2 text-xs">
                        {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <select value={activeModel} onChange={(e) => setModel(e.target.value)} className="rounded-xl border bg-background px-3 py-2 text-xs">
                        {models.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                      </select>
                      <button onClick={() => void runTests()} disabled={!activeModel || !!busy} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-xs text-background disabled:opacity-50">
                        {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run {selected.tests.length} test(s)
                      </button>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <input value={testInput} onChange={(e) => setTestInput(e.target.value)} placeholder="Additional test input" className="rounded-xl border bg-background px-3 py-2 text-xs" />
                      <div className="flex gap-2">
                        <input value={expectContains} onChange={(e) => setExpectContains(e.target.value)} placeholder="Expect phrases, comma" className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-xs" />
                        <button onClick={() => void addTest()} disabled={!testInput.trim() || !!busy} className="rounded-xl border px-3 py-2 text-xs disabled:opacity-50">Add</button>
                      </div>
                    </div>
                    {testResult && (
                      <div className={`mt-3 rounded-xl border p-3 text-xs ${testResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                        {testResult.summary} <span className="opacity-70">· run {testResult.runId.slice(0, 14)}</span>
                      </div>
                    )}
                    <div className="mt-3 max-h-72 space-y-2 overflow-auto">
                      {selectedOutcomes.map((o) => (
                        <div key={o.id} className="rounded-xl bg-muted p-3 text-[11px]">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={o.passed ? "text-emerald-700" : "text-red-700"}>{o.passed ? "PASS" : "FAIL"} · score {Math.round(o.score * 100)}%</span>
                            <span className="text-muted-foreground">{o.provider}/{o.model} · {o.latencyMs ?? 0}ms · ${o.costUsd.toFixed(6)}</span>
                          </div>
                          {o.error && <div className="mt-1 text-red-600">{o.error}</div>}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {o.checks.map((check: VerificationCheck, i: number) => (
                              <span key={i} className={`rounded-full px-2 py-0.5 text-[9px] ${check.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{check.name}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                      {!selectedOutcomes.length && <div className="text-xs text-muted-foreground">No measured outcomes yet. Add a test case and run it.</div>}
                    </div>
                  </section>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
                  Register a candidate or author one from a runtime run to start evolving.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
