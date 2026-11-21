"use client";

/**
 * Federated memory console for roadmap Phase 3 item 11.
 * Grants are sealed to a pinned peer key and delivered as signed A2A envelopes.
 * The page only handles declarative JSON; no key material or code is entered.
 */

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { toast } from "@/components/toast";
import { KeyRound, LockKeyhole, RefreshCw, Send, ShieldCheck, Trash2 } from "lucide-react";

interface Grant {
  id: string;
  direction: "issued" | "received";
  grantId: string;
  resourceKind: string;
  resourceId: string;
  localAgentId: string;
  peerDid: string;
  capability: string;
  scope: Record<string, unknown>;
  expiresAt: string;
  status: "active" | "revoked" | "imported";
  importedBranchId: string;
  createdAt: string;
}

interface KeyRecord {
  id: string;
  did: string;
  keyId: string;
  trustMode: string;
  createdAt: string;
}

interface Snapshot {
  ok: boolean;
  protocol: { name: string; version: number; storageReady: boolean };
  grants: Grant[];
  keys: KeyRecord[];
  agents: { agentId: string; did: string; capabilities: string[] }[];
  peers: { did: string; displayName: string; trustMode: string }[];
}

const EMPTY: Snapshot = {
  ok: true,
  protocol: { name: "medusa-federated-memory", version: 1, storageReady: false },
  grants: [], keys: [], agents: [], peers: [],
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Request failed");
  return json as T;
}

function dateText(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function statusClass(status: string): string {
  if (status === "active") return "bg-emerald-100 text-emerald-700";
  if (status === "imported") return "bg-blue-100 text-blue-700";
  if (status === "revoked") return "bg-red-100 text-red-700";
  return "bg-muted text-muted-foreground";
}

export default function FederatedMemoryPage() {
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [did, setDid] = useState("");
  const [keyId, setKeyId] = useState("");
  const [publicKey, setPublicKey] = useState("");

  const [agentId, setAgentId] = useState("");
  const [peerDid, setPeerDid] = useState("");
  const [resourceKind, setResourceKind] = useState("graph");
  const [resourceId, setResourceId] = useState("");
  const [capability, setCapability] = useState("memory.query");
  const [scope, setScope] = useState("{}");
  const [ttl, setTtl] = useState("60");

  const inputCls = "mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm";

  const refresh = useCallback(async () => {
    try {
      setData(await api<Snapshot>("/api/federation/memory", { cache: "no-store" }));
    } catch (e) {
      setError((e as Error).message || "Could not load federated memory state");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const effectiveAgentId = agentId || data.agents[0]?.agentId || "";
  const effectivePeerDid = peerDid || data.peers[0]?.did || "";

  async function post(action: string, payload: Record<string, unknown>, message: string) {
    setBusy(action);
    setError("");
    try {
      const result = await api<Record<string, unknown>>("/api/federation/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      toast(typeof result.status === "string" ? `${message}: ${result.status}` : message);
      await refresh();
      return result;
    } catch (e) {
      const messageText = (e as Error).message || message;
      setError(messageText);
      toast(messageText, "error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 p-6 md:p-8 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><LockKeyhole className="h-5 w-5" /> Federated Memory</h1>
            <p className="text-sm text-muted-foreground mt-1">Share scoped memory graphs as signed, recipient-encrypted grants. No private keys leave this device.</p>
          </div>
          <button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4" /> Refresh</button>
        </header>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border p-5 space-y-3">
            <h2 className="font-medium flex items-center gap-2"><KeyRound className="h-4 w-4" /> Pin a peer encryption key</h2>
            <p className="text-xs text-muted-foreground">Copy <code>encryption.publicKey</code> and <code>encryption.keyId</code> from the peer&apos;s <code>/api/a2a/manifest</code>.</p>
            <label className="block text-xs">Peer DID<input className={inputCls} value={did} onChange={e => setDid(e.target.value)} placeholder="did:medusa:…" /></label>
            <label className="block text-xs">Key id<input className={inputCls} value={keyId} onChange={e => setKeyId(e.target.value)} /></label>
            <label className="block text-xs">Public JWK (JSON)<textarea className={`${inputCls} font-mono`} rows={3} value={publicKey} onChange={e => setPublicKey(e.target.value)} placeholder={'{"kty":"EC","crv":"P-256","x":"…","y":"…"}'} /></label>
            <button
              disabled={!!busy}
              onClick={async () => {
                let parsed: unknown;
                try { parsed = JSON.parse(publicKey); } catch { toast("Public JWK must be valid JSON", "error"); return; }
                await post("pin-key", { did, keyId, publicKey: parsed }, "Encryption key pinned");
              }}
              className="rounded-lg bg-foreground text-background px-3 py-2 text-sm disabled:opacity-50"
            >Pin key</button>
          </div>

          <div className="rounded-2xl border p-5 space-y-3">
            <h2 className="font-medium flex items-center gap-2"><Send className="h-4 w-4" /> Issue a memory grant</h2>
            <label className="block text-xs">Local agent
              <select className={inputCls} value={effectiveAgentId} onChange={e => setAgentId(e.target.value)}>
                {data.agents.map(a => <option key={a.agentId} value={a.agentId}>{a.agentId}</option>)}
                {!data.agents.length && <option value="">Register an A2A agent first</option>}
              </select>
            </label>
            <label className="block text-xs">Peer DID
              <select className={inputCls} value={effectivePeerDid} onChange={e => setPeerDid(e.target.value)}>
                {data.peers.map(p => <option key={p.did} value={p.did}>{p.displayName || p.did}</option>)}
                {!data.peers.length && <option value="">Pin an A2A peer first</option>}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">Resource kind<input className={inputCls} value={resourceKind} onChange={e => setResourceKind(e.target.value)} /></label>
              <label className="block text-xs">Capability<input className={inputCls} value={capability} onChange={e => setCapability(e.target.value)} /></label>
            </div>
            <label className="block text-xs">Resource id<input className={inputCls} value={resourceId} onChange={e => setResourceId(e.target.value)} /></label>
            <label className="block text-xs">Scope (JSON)<textarea className={`${inputCls} font-mono`} rows={2} value={scope} onChange={e => setScope(e.target.value)} placeholder={'{"kinds":["decision"],"limit":10}'} /></label>
            <label className="block text-xs">TTL (minutes)<input className={inputCls} type="number" min="1" value={ttl} onChange={e => setTtl(e.target.value)} /></label>
            <button
              disabled={!!busy || !effectiveAgentId || !effectivePeerDid}
              onClick={async () => {
                let parsed: unknown;
                try { parsed = JSON.parse(scope); } catch { toast("Scope must be valid JSON", "error"); return; }
                const result = await post("issue-grant", {
                  agentId: effectiveAgentId, peerDid: effectivePeerDid, resourceKind, resourceId,
                  capability, scope: parsed, ttlMinutes: Number(ttl),
                }, "Grant issued");
                if (result?.nodeCount !== undefined) toast(`Sealed ${result.nodeCount} memories`);
              }}
              className="rounded-lg bg-foreground text-background px-3 py-2 text-sm disabled:opacity-50"
            >Issue &amp; deliver grant</button>
          </div>
        </section>

        <section className="rounded-2xl border p-5">
          <h2 className="font-medium flex items-center gap-2 mb-3"><ShieldCheck className="h-4 w-4" /> Grants <span className="text-xs text-muted-foreground">({data.grants.length})</span></h2>
          <div className="space-y-2">
            {data.grants.map(g => (
              <div key={g.id} className="rounded-xl border p-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {g.grantId}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusClass(g.status)}`}>{g.status}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{g.direction}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{g.peerDid}</div>
                  <div className="text-[11px] text-muted-foreground">{capabilityLabel(g)} · expires {dateText(g.expiresAt)}{g.importedBranchId ? ` · branch ${g.importedBranchId}` : ""}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {g.direction === "received" && g.status === "active" && (
                    <button disabled={!!busy} onClick={() => void post("import-grant", { id: g.id }, "Grant imported")} className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50">Import</button>
                  )}
                  {g.direction === "issued" && g.status === "active" && (
                    <button disabled={!!busy} onClick={() => void post("revoke-grant", { id: g.id }, "Grant revoked")} className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50">Revoke</button>
                  )}
                  <button disabled={!!busy} onClick={() => void post("delete-grant", { id: g.id }, "Grant deleted")} className="rounded-lg p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-50" title="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            {!data.grants.length && <p className="text-sm text-muted-foreground">No grants yet. Pin a peer key, then issue or receive a grant.</p>}
          </div>
        </section>

        <section className="rounded-2xl border p-5">
          <h2 className="font-medium mb-3">Pinned encryption keys <span className="text-xs text-muted-foreground">({data.keys.length})</span></h2>
          <div className="space-y-1">
            {data.keys.map(k => (
              <div key={k.id} className="flex items-center justify-between text-xs rounded-lg bg-muted px-3 py-2">
                <span className="truncate">{k.did} <span className="text-muted-foreground">· {k.keyId}</span></span>
                <button onClick={() => void post("delete-key", { id: k.id }, "Key removed")} className="text-muted-foreground hover:text-red-600" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {!data.keys.length && <p className="text-sm text-muted-foreground">No peer encryption keys pinned.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}

function capabilityLabel(grant: Grant): string {
  const scope = grant.scope || {};
  const parts = [grant.capability];
  if (scope.projectId) parts.push(`project=${String(scope.projectId)}`);
  if (Array.isArray(scope.kinds)) parts.push(`kinds=${scope.kinds.join("/")}`);
  if (scope.limit) parts.push(`limit=${String(scope.limit)}`);
  return parts.join(" · ");
}
