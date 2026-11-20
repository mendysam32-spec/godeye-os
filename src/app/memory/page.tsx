"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { toast } from "@/components/toast";
import { Brain, GitBranch, GitFork, History, Link2, Loader2, Merge, Pin, Plus, RefreshCw, RotateCcw, Search, Trash2, Unlink, X } from "lucide-react";
import {
  MEMORY_KINDS, MEMORY_RELATIONS,
  type MemoryBranch, type MemoryGraph, type MemoryKind, type MemoryRelation, type MemoryRecord, type MemoryVersion,
} from "@/lib/foundation";

const KIND_LABEL: Record<MemoryKind, string> = {
  fact: "Fact",
  preference: "Preference",
  decision: "Decision",
  project: "Project",
  procedure: "Procedure",
  episode: "Episode",
};

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [graph, setGraph] = useState<MemoryGraph>({ nodes: [], links: [] });
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<MemoryKind>("fact");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [versions, setVersions] = useState<MemoryVersion[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);

  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [linkTo, setLinkTo] = useState("");
  const [relation, setRelation] = useState<MemoryRelation>("related");
  const [linkBusy, setLinkBusy] = useState(false);

  const [branches, setBranches] = useState<MemoryBranch[]>([]);
  const [activeBranch, setActiveBranch] = useState("main");
  const [branchName, setBranchName] = useState("");
  const [mergeTarget, setMergeTarget] = useState("main");
  const [branchBusy, setBranchBusy] = useState(false);

  const load = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const inBranch = activeBranch !== "main";
      const memUrl = inBranch
        ? `/api/memory/branches?branchId=${encodeURIComponent(activeBranch)}`
        : `/api/memory?limit=200${q ? `&q=${encodeURIComponent(q)}` : ""}`;
      const [memRes, graphRes, branchRes] = await Promise.all([
        fetch(memUrl, { cache: "no-store" }),
        fetch("/api/memory/links", { cache: "no-store" }),
        fetch("/api/memory/branches", { cache: "no-store" }),
      ]);
      const j = await memRes.json() as { memories?: MemoryRecord[] };
      let list = j.memories || [];
      if (inBranch && q.trim()) {
        const needle = q.toLowerCase();
        const terms = needle.match(/[a-z0-9_-]{3,}/g) ?? [];
        list = list.filter((m) => m.content.toLowerCase().includes(needle) || terms.some((t) => m.content.toLowerCase().includes(t)));
      }
      setMemories(list);
      if (graphRes.ok) {
        const g = await graphRes.json() as MemoryGraph;
        setGraph({ nodes: g.nodes || [], links: g.links || [] });
      }
      if (branchRes.ok) {
        const b = await branchRes.json() as { branches?: MemoryBranch[] };
        setBranches(b.branches || []);
      }
    } catch {
      toast("Could not load memories", "error");
    } finally {
      setLoading(false);
    }
  }, [activeBranch]);

  useEffect(() => {
    const t = setTimeout(() => void load(query), query ? 220 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  async function addMemory() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memories: [{ content: draft, kind, pinned: false }] }),
      });
      if (!res.ok) throw new Error("Save failed");
      setDraft("");
      toast("Memory saved");
      await load(query);
    } catch {
      toast("Could not save memory", "error");
    } finally {
      setBusy(false);
    }
  }

  async function togglePin(m: MemoryRecord) {
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memories: [{
            content: m.content, kind: m.kind, projectId: m.projectId,
            sourceChatId: m.sourceChatId, sourceMessageId: m.sourceMessageId,
            pinned: !m.pinned,
          }],
        }),
      });
      if (!res.ok) throw new Error();
      await load(query);
    } catch {
      toast("Could not update memory", "error");
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      setMemories((prev) => prev.filter((m) => m.id !== id));
      if (historyFor === id) setHistoryFor(null);
      toast("Memory deleted");
      await load(query);
    } catch {
      toast("Could not delete memory", "error");
    }
  }

  async function showHistory(id: string | null) {
    setHistoryFor(id);
    if (!id) {
      setVersions([]);
      return;
    }
    setHistoryBusy(true);
    try {
      const res = await fetch(`/api/memory/${encodeURIComponent(id)}/versions`, { cache: "no-store" });
      const j = await res.json() as { versions?: MemoryVersion[] };
      setVersions(j.versions || []);
    } catch {
      toast("Could not load history", "error");
    } finally {
      setHistoryBusy(false);
    }
  }

  async function restoreVersion(id: string, version: number) {
    setHistoryBusy(true);
    try {
      const res = await fetch(`/api/memory/${encodeURIComponent(id)}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      if (!res.ok) throw new Error();
      toast(`Restored v${version} as a new commit`);
      await load(query);
      await showHistory(id);
    } catch {
      toast("Could not restore version", "error");
    } finally {
      setHistoryBusy(false);
    }
  }

  async function createLink() {
    if (!linkFrom || !linkTo || linkFrom === linkTo) return;
    setLinkBusy(true);
    try {
      const res = await fetch("/api/memory/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: linkFrom, toId: linkTo, relation, weight: 1 }),
      });
      if (!res.ok) throw new Error();
      setLinkFrom(null);
      setLinkTo("");
      setRelation("related");
      toast("Memories linked");
      await load(query);
    } catch {
      toast("Could not create link", "error");
    } finally {
      setLinkBusy(false);
    }
  }

  async function removeLink(id: string) {
    try {
      const res = await fetch("/api/memory/links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      setGraph((prev) => ({ ...prev, links: prev.links.filter((l) => l.id !== id) }));
      toast("Link removed");
    } catch {
      toast("Could not remove link", "error");
    }
  }

  async function forkBranch() {
    if (!branchName.trim()) return;
    setBranchBusy(true);
    try {
      const res = await fetch("/api/memory/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: branchName, sourceId: activeBranch === "main" ? null : activeBranch }),
      });
      if (!res.ok) throw new Error();
      const j = await res.json() as { branch?: MemoryBranch };
      setBranchName("");
      toast("Memory branch forked");
      if (j.branch) setActiveBranch(j.branch.id);
      else await load(query);
    } catch {
      toast("Could not fork memory", "error");
    } finally {
      setBranchBusy(false);
    }
  }

  async function mergeBranch() {
    if (activeBranch === "main") return;
    setBranchBusy(true);
    try {
      const res = await fetch(`/api/memory/branches/${encodeURIComponent(activeBranch)}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: mergeTarget }),
      });
      if (!res.ok) throw new Error();
      const j = await res.json() as { added?: number };
      toast(`Merged ${j.added ?? 0} ${j.added === 1 ? "memory" : "memories"}`);
      await load(query);
    } catch {
      toast("Could not merge memory", "error");
    } finally {
      setBranchBusy(false);
    }
  }

  function label(id: string): string {
    const node = graph.nodes.find((n) => n.id === id);
    return node ? node.content.slice(0, 52) : id.slice(0, 12);
  }

  const fromMemory = memories.find((m) => m.id === linkFrom);
  const historyMemory = memories.find((m) => m.id === historyFor);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm md:text-base flex items-center gap-2"><Brain className="h-4 w-4" /> Memory Kernel</div>
            <div className="text-xs text-muted-foreground truncate">
              {memories.length} structured {memories.length === 1 ? "record" : "records"} · {graph.links.length} links · versioned, semantic, graph-linked
            </div>
          </div>
          <button onClick={() => void load(query)} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs hover:bg-muted">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="font-medium text-sm">Add a memory</div>
            <p className="text-xs text-muted-foreground">
              One durable fact, preference, decision, procedure or episode. Every change is committed to its history; chat also captures explicitly signalled memories after each turn.
            </p>
            <div className="flex flex-col md:flex-row gap-2">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as MemoryKind)}
                className="rounded-xl border bg-background px-3 py-2 text-sm"
              >
                {MEMORY_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addMemory(); }}
                placeholder="e.g. I prefer concise answers with code examples"
                className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={() => void addMemory()}
                disabled={busy || !draft.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-foreground text-background px-4 py-2 text-sm disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save
              </button>
            </div>
          </section>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memories — lexical + semantic + graph"
              className="w-full rounded-xl border bg-background pl-9 pr-3 py-2.5 text-sm"
            />
          </div>

          <section className="rounded-2xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium"><GitFork className="h-4 w-4" /> Memory branches</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setActiveBranch("main")}
                  className={`rounded-full border px-2.5 py-1 text-[11px] ${activeBranch === "main" ? "bg-foreground text-background" : "hover:bg-muted"}`}
                >
                  main
                </button>
                {branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setActiveBranch(b.id)}
                    title={b.sourceId ? `forked from ${b.sourceId}` : ""}
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${activeBranch === b.id ? "bg-foreground text-background" : "hover:bg-muted"}`}
                  >
                    {b.name} <span className="opacity-60">({b.memories})</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row">
              <input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void forkBranch(); }}
                placeholder={`Fork ${activeBranch === "main" ? "main" : "this branch"} into a new module…`}
                className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={() => void forkBranch()}
                disabled={branchBusy || !branchName.trim()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <GitFork className="h-4 w-4" /> Fork
              </button>
              {activeBranch !== "main" && (
                <>
                  <select
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                    className="rounded-xl border bg-background px-3 py-2 text-sm"
                  >
                    <option value="main">merge → main</option>
                    {branches.filter((b) => b.id !== activeBranch).map((b) => (
                      <option key={b.id} value={b.id}>merge → {b.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => void mergeBranch()}
                    disabled={branchBusy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <Merge className="h-4 w-4" /> Merge
                  </button>
                </>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Forks share memory references; merges copy missing insights into the target with a <span className="font-mono">derived_from</span> provenance link.
            </p>
          </section>

          {!!graph.links.length && (
            <section className="rounded-2xl border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium"><GitBranch className="h-4 w-4" /> Connections</div>
              <div className="mt-3 space-y-1.5">
                {graph.links.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs">
                    <span className="max-w-[38%] truncate">{label(l.fromId)}</span>
                    <span className="rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{l.relation}</span>
                    <span className="max-w-[38%] truncate">{label(l.toId)}</span>
                    <button onClick={() => void removeLink(l.id)} title="Remove link" className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-background hover:text-red-500">
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {fromMemory && (
            <section className="rounded-2xl border border-foreground/20 bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-sm font-medium">
                  Link from <span className="truncate">{fromMemory.content.slice(0, 60)}</span>
                </div>
                <button onClick={() => setLinkFrom(null)} className="rounded-lg p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 flex flex-col gap-2 md:flex-row">
                <select
                  value={linkTo}
                  onChange={(e) => setLinkTo(e.target.value)}
                  className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a target memory</option>
                  {graph.nodes.filter((n) => n.id !== linkFrom).map((n) => (
                    <option key={n.id} value={n.id}>{n.content.slice(0, 80)}</option>
                  ))}
                </select>
                <select
                  value={relation}
                  onChange={(e) => setRelation(e.target.value as MemoryRelation)}
                  className="rounded-xl border bg-background px-3 py-2 text-sm"
                >
                  {MEMORY_RELATIONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                </select>
                <button
                  onClick={() => void createLink()}
                  disabled={linkBusy || !linkTo}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-foreground text-background px-4 py-2 text-sm disabled:opacity-50"
                >
                  {linkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Link
                </button>
              </div>
            </section>
          )}

          {historyFor && (
            <section className="rounded-2xl border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-sm font-medium flex items-center gap-2"><History className="h-4 w-4" /> History {historyMemory ? `· ${historyMemory.content.slice(0, 48)}` : ""}</div>
                <button onClick={() => void showHistory(null)} className="rounded-lg p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 space-y-1.5">
                {historyBusy && !versions.length ? (
                  <div className="p-4 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
                ) : !versions.length ? (
                  <div className="p-3 text-xs text-muted-foreground">No commits recorded for this memory yet.</div>
                ) : versions.map((v) => (
                  <div key={v.id} className="flex items-start gap-3 rounded-xl bg-muted/50 px-3 py-2">
                    <span className="mt-0.5 shrink-0 rounded-md bg-background px-2 py-0.5 text-[10px] font-mono">v{v.version}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs break-words">{v.content}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{v.changeNote} · {new Date(v.changedAt).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => void restoreVersion(v.memoryId, v.version)}
                      disabled={historyBusy}
                      title="Restore as a new commit"
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2">
            {loading && !memories.length ? (
              <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
            ) : !memories.length ? (
              <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
                No memories yet. Save one above or tell MEDUSA something to remember in chat.
              </div>
            ) : memories.map((m) => (
              <article key={m.id} className="rounded-2xl border bg-card p-4 flex gap-3">
                <div className="mt-0.5 shrink-0 rounded-lg bg-muted px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {KIND_LABEL[m.kind]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {m.pinned ? "Pinned · " : ""}Updated {new Date(m.updatedAt).toLocaleString()}
                    {m.sourceChatId ? ` · chat ${m.sourceChatId.slice(0, 12)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  <button
                    onClick={() => void showHistory(historyFor === m.id ? null : m.id)}
                    title="Version history"
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                  >
                    <History className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setLinkFrom(linkFrom === m.id ? null : m.id)}
                    title="Link to another memory"
                    className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                  >
                    <Link2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => void togglePin(m)}
                    title={m.pinned ? "Unpin" : "Pin"}
                    className={`rounded-lg p-2 hover:bg-muted ${m.pinned ? "text-amber-500" : "text-muted-foreground"}`}
                  >
                    <Pin className="h-4 w-4" />
                  </button>
                  <button onClick={() => void remove(m.id)} title="Delete" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
