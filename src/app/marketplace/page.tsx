"use client";

/**
 * Skill marketplace console for roadmap Phase 3 item 11.
 * Packages are signed declarative envelopes. Verification and import never
 * run code; imports become gated candidate genome entries.
 */

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { toast } from "@/components/toast";
import { BadgeCheck, Download, RefreshCw, ShieldCheck, Store, Trash2 } from "lucide-react";

interface PackageRecord {
  id: string;
  packageId: string;
  name: string;
  description: string;
  version: string;
  kind: "prompt" | "tool";
  publisherDid: string;
  manifestHash: string;
  status: string;
  createdAt: string;
}

interface InstallRecord {
  id: string;
  packageId: string;
  publisherDid: string;
  manifestHash: string;
  verification: string;
  genomeId: string;
  status: string;
  detail: string;
}

interface Snapshot {
  ok: boolean;
  protocol: { name: string; version: number; storageReady: boolean };
  packages: PackageRecord[];
  installs: InstallRecord[];
  agents: { agentId: string; did: string; status: string }[];
}

const EMPTY: Snapshot = {
  ok: true,
  protocol: { name: "medusa-skill-marketplace", version: 1, storageReady: false },
  packages: [], installs: [], agents: [],
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Request failed");
  return json as T;
}

function statusClass(status: string): string {
  if (["pinned", "published", "candidate"].includes(status)) return "bg-emerald-100 text-emerald-700";
  if (["signature-only", "unverified"].includes(status)) return "bg-amber-100 text-amber-700";
  if (["rejected", "revoked"].includes(status)) return "bg-red-100 text-red-700";
  return "bg-muted text-muted-foreground";
}

export default function MarketplacePage() {
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [kind, setKind] = useState("prompt");
  const [body, setBody] = useState("");
  const [tests, setTests] = useState("[]");

  const [envelopeText, setEnvelopeText] = useState("");
  const [pinPeer, setPinPeer] = useState("");
  const [check, setCheck] = useState<Record<string, unknown> | null>(null);

  const inputCls = "mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm";

  const refresh = useCallback(async () => {
    try {
      setData(await api<Snapshot>("/api/federation/marketplace", { cache: "no-store" }));
    } catch (e) {
      setError((e as Error).message || "Could not load marketplace state");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  async function post(action: string, payload: Record<string, unknown>, message: string) {
    setBusy(action);
    setError("");
    try {
      const result = await api<Record<string, unknown>>("/api/federation/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      toast(message);
      await refresh();
      return result;
    } catch (e) {
      const text = (e as Error).message || message;
      setError(text);
      toast(text, "error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  function parseEnvelope(): unknown | null {
    try {
      return JSON.parse(envelopeText);
    } catch {
      toast("Package must be a valid JSON envelope", "error");
      return null;
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 p-6 md:p-8 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><Store className="h-5 w-5" /> Skill Marketplace</h1>
            <p className="text-sm text-muted-foreground mt-1">Signed, verifiable, portable skills. Imports are gated candidates — never auto-activated.</p>
          </div>
          <button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" /> Refresh</button>
        </header>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border p-5 space-y-3">
            <h2 className="font-medium flex items-center gap-2"><BadgeCheck className="h-4 w-4" /> Publish a signed package</h2>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">Name<input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></label>
              <label className="block text-xs">Slug<input className={inputCls} value={slug} onChange={e => setSlug(e.target.value)} /></label>
            </div>
            <label className="block text-xs">Description<input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">Version<input className={inputCls} value={version} onChange={e => setVersion(e.target.value)} /></label>
              <label className="block text-xs">Kind
                <select className={inputCls} value={kind} onChange={e => setKind(e.target.value)}>
                  <option value="prompt">prompt</option>
                  <option value="tool">tool</option>
                </select>
              </label>
            </div>
            <label className="block text-xs">Body {kind === "tool" ? "(declarative JSON spec)" : "(inert prompt text)"}
              <textarea className={`${inputCls} font-mono`} rows={6} value={body} onChange={e => setBody(e.target.value)} />
            </label>
            <label className="block text-xs">Tests (JSON array)<textarea className={`${inputCls} font-mono`} rows={2} value={tests} onChange={e => setTests(e.target.value)} /></label>
            <button
              disabled={!!busy}
              onClick={async () => {
                let parsedTests: unknown;
                try { parsedTests = JSON.parse(tests); } catch { toast("Tests must be valid JSON", "error"); return; }
                const result = await post("publish", {
                  name, slug, description, versionText: version, kind, body, tests: parsedTests,
                }, "Package published");
                if (result?.portable) setEnvelopeText(String(result.portable));
              }}
              className="rounded-lg bg-foreground text-background px-3 py-2 text-sm disabled:opacity-50"
            >Sign &amp; publish</button>
          </div>

          <div className="rounded-2xl border p-5 space-y-3">
            <h2 className="font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Verify / import a package</h2>
            <label className="block text-xs">Pinned publisher DID (optional)<input className={inputCls} value={pinPeer} onChange={e => setPinPeer(e.target.value)} placeholder="did:medusa:…" /></label>
            <label className="block text-xs">Signed envelope (JSON)<textarea className={`${inputCls} font-mono`} rows={8} value={envelopeText} onChange={e => setEnvelopeText(e.target.value)} placeholder="Paste a portable skill package envelope" /></label>
            <div className="flex gap-2">
              <button disabled={!!busy} onClick={async () => {
                const envelope = parseEnvelope();
                if (envelope === null) return;
                const result = await post("verify", { envelope, peerDid: pinPeer }, "Verification complete");
                setCheck(result);
              }} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">Verify</button>
              <button disabled={!!busy} onClick={() => {
                const envelope = parseEnvelope();
                if (envelope === null) return;
                void post("import", { envelope, peerDid: pinPeer }, "Imported as candidate genome");
              }} className="rounded-lg bg-foreground text-background px-3 py-2 text-sm disabled:opacity-50">Import as candidate</button>
            </div>
            {check && (
              <div className="rounded-xl bg-muted p-3 text-xs space-y-1">
                <div>Verified: <strong>{check.ok ? "yes" : "no"}</strong>{check.verification ? ` · ${String(check.verification)}` : ""}</div>
                {typeof check.error === "string" && <div className="text-red-600">{check.error}</div>}
                {check.publisherDid ? <div className="break-all">Publisher: {String(check.publisherDid)}</div> : null}
                {check.manifestHash ? <div className="break-all">Hash: {String(check.manifestHash)}</div> : null}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border p-5">
          <h2 className="font-medium mb-3">Published packages <span className="text-xs text-muted-foreground">({data.packages.length})</span></h2>
          <div className="space-y-2">
            {data.packages.map(p => (
              <div key={p.id} className="rounded-xl border p-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {p.name} <span className="text-xs text-muted-foreground">v{p.version}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusClass(p.status)}`}>{p.status}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{p.kind}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{p.description || p.packageId}</div>
                  <div className="text-[11px] text-muted-foreground break-all">{p.publisherDid} · {p.manifestHash.slice(0, 16)}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    disabled={!!busy}
                    onClick={async () => {
                      const result = await post("export", { id: p.id }, "Package loaded for export");
                      if (typeof result?.portable === "string") setEnvelopeText(result.portable);
                    }}
                    className="rounded-lg border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50" title="Export"
                  ><Download className="h-4 w-4" /></button>
                  <button disabled={!!busy} onClick={() => void post("delete", { id: p.id }, "Package removed")} className="rounded-lg p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-50" title="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            {!data.packages.length && <p className="text-sm text-muted-foreground">No packages published or received yet.</p>}
          </div>
        </section>

        <section className="rounded-2xl border p-5">
          <h2 className="font-medium mb-3">Imported installs <span className="text-xs text-muted-foreground">({data.installs.length})</span></h2>
          <div className="space-y-2">
            {data.installs.map(i => (
              <div key={i.id} className="rounded-xl border p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{i.packageId}</div>
                  <div className="text-[11px] text-muted-foreground">{i.detail}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <span className={`rounded-full px-2 py-0.5 ${statusClass(i.verification)}`}>{i.verification}</span>
                  <a href="/genome" className="rounded-lg border px-2.5 py-1.5 hover:bg-muted">Open genome</a>
                </div>
              </div>
            ))}
            {!data.installs.length && <p className="text-sm text-muted-foreground">No packages imported yet.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
