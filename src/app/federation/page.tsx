"use client";

/**
 * Federation console for roadmap Phase 3 item 10.
 * Everything is declarative: DIDs, pinned public keys, capabilities, signed
 * envelopes and receipts. No private keys, endpoints-as-authority or code are
 * accepted from model output or peer payloads.
 */

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { toast } from "@/components/toast";
import { useMEDUSA } from "@/lib/store";
import { getDecryptedVaultForApi } from "@/lib/vault-crypto";
import { A2A_CAPABILITIES } from "@/lib/a2a";
import type {
  A2AAgentRecord, A2AMessageRecord, A2APeerRecord, A2AReceiptRecord, A2ATaskRecord,
} from "@/lib/a2a-store";
import { Activity, Check, Loader2, Play, Plus, RefreshCw, Route, Shield, Trash2 } from "lucide-react";

interface ProtocolInfo {
  name: string;
  version: number;
  signingConfigured: boolean;
  localEndpointsAllowed: boolean;
  storageReady: boolean;
  endpoints: Record<string, string>;
}

interface A2ASnapshot {
  ok: boolean;
  protocol: ProtocolInfo;
  agents: A2AAgentRecord[];
  peers: A2APeerRecord[];
  tasks: A2ATaskRecord[];
  receipts: A2AReceiptRecord[];
  messages: A2AMessageRecord[];
}

interface TaskDetail {
  ok: boolean;
  task: A2ATaskRecord;
  messages: A2AMessageRecord[];
  receipts: A2AReceiptRecord[];
  run: string | null;
}

const EMPTY: A2ASnapshot = {
  ok: true,
  protocol: {
    name: "medusa-a2a", version: 1, signingConfigured: false,
    localEndpointsAllowed: false, storageReady: false, endpoints: {},
  },
  agents: [], peers: [], tasks: [], receipts: [], messages: [],
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Request failed");
  return json as T;
}

function bool(value: boolean): string {
  return value ? "yes" : "no";
}

function dateText(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function statusClass(status: string): string {
  if (["completed", "accepted", "active", "delivered"].includes(status)) return "bg-emerald-100 text-emerald-700";
  if (["failed", "rejected", "delivery-failed", "disabled"].includes(status)) return "bg-red-100 text-red-700";
  if (["running", "pending"].includes(status)) return "bg-blue-100 text-blue-700";
  return "bg-muted text-muted-foreground";
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

export default function FederationPage() {
  const { currentUser, agents: storeAgents, vault } = useMEDUSA();
  const [data, setData] = useState<A2ASnapshot>(EMPTY);
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [showSpec, setShowSpec] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentCaps, setAgentCaps] = useState<string[]>([]);

  const [peerEndpoint, setPeerEndpoint] = useState("");
  const [peerDid, setPeerDid] = useState("");

  const [localAgentId, setLocalAgentId] = useState("");
  const [delegatePeerDid, setDelegatePeerDid] = useState("");
  const [objective, setObjective] = useState("");
  const [requiredCaps, setRequiredCaps] = useState<string[]>([]);
  const [budget, setBudget] = useState("0");
  const [inputJson, setInputJson] = useState("{}");

  const [detail, setDetail] = useState<TaskDetail | null>(null);

  const inputCls = "mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm";
  const checkCls = "inline-flex items-center gap-1.5 text-xs";

  const refresh = useCallback(async () => {
    try {
      const [snap, specDoc] = await Promise.all([
        api<A2ASnapshot>("/api/a2a", { cache: "no-store" }),
        api<Record<string, unknown>>("/api/a2a/spec", { cache: "no-store" }),
      ]);
      setData(snap);
      setSpec(specDoc);
    } catch (e) {
      setError((e as Error)?.message || "Could not load federation state");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  // Derive defaults instead of mirroring loaded data back into state.
  const effectiveSelectedAgentId = selectedAgentId || storeAgents[0]?.id || "";
  const effectiveLocalAgentId = localAgentId || data.agents[0]?.agentId || "";
  const effectiveDelegatePeerDid = delegatePeerDid || data.peers[0]?.did || "";

  async function post(key: string, payload: Record<string, unknown>, message: string) {
    setBusy(key);
    setError("");
    try {
      const result = await api<Record<string, unknown>>("/api/a2a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast(message);
      await refresh();
      return result;
    } catch (e) {
      const text = (e as Error)?.message || "Federation request failed";
      setError(text);
      toast(text, "error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function registerAgent() {
    const agent = storeAgents.find((a) => a.id === effectiveSelectedAgentId);
    if (!agent) return toast("Select a local agent first", "error");
    await post("register-agent", {
      action: "register-agent",
      agentId: agent.id,
      displayName: agent.name,
      role: agent.role,
      provider: agent.provider,
      model: agent.model,
      capabilities: agentCaps,
    }, "A2A identity registered");
  }

  async function importPeer() {
    await post("import-peer", { action: "import-peer", endpoint: peerEndpoint, did: peerDid }, "Peer pinned from manifest");
  }

  async function probe(peer: A2APeerRecord) {
    await post("probe-peer", {
      action: "probe-peer",
      agentId: effectiveLocalAgentId,
      peerDid: peer.did,
      capabilities: A2A_CAPABILITIES,
    }, "Capability negotiation complete");
  }

  async function delegate() {
    let input: Record<string, unknown>;
    try {
      const parsed = JSON.parse(inputJson || "{}") as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Input must be a JSON object");
      input = parsed as Record<string, unknown>;
    } catch (e) {
      return toast((e as Error)?.message || "Invalid input JSON", "error");
    }
    await post("send-delegation", {
      action: "send-delegation",
      agentId: effectiveLocalAgentId,
      peerDid: effectiveDelegatePeerDid,
      objective,
      requiredCapabilities: requiredCaps,
      budgetUsd: Number(budget) || 0,
      input,
    }, "Signed delegation delivered");
    setObjective("");
  }

  async function runTask(task: A2ATaskRecord) {
    setBusy(`run-${task.id}`);
    setError("");
    try {
      const decryptedVault = await getDecryptedVaultForApi(vault as never);
      const agent = data.agents.find((a) => a.agentId === task.localAgentId);
      const result = await api<Record<string, unknown>>(`/api/a2a/tasks/${encodeURIComponent(task.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          vault: decryptedVault,
          provider: agent?.provider || undefined,
          model: agent?.model || undefined,
        }),
      });
      toast(result.ok === true ? "Delegation completed and result delivered" : "Delegation ran but reported a failure", result.ok === true ? "success" : "error");
      await refresh();
      await loadDetail(task);
    } catch (e) {
      const text = (e as Error)?.message || "Could not run delegation";
      setError(text);
      toast(text, "error");
    } finally {
      setBusy(null);
    }
  }

  async function loadDetail(task: A2ATaskRecord) {
    try {
      setDetail(await api<TaskDetail>(`/api/a2a/tasks/${encodeURIComponent(task.id)}`, { cache: "no-store" }));
    } catch (e) {
      setError((e as Error)?.message || "Could not load task detail");
    }
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex md:flex-row bg-background">
        <Sidebar />
        <main className="flex-1 p-6 text-sm text-muted-foreground">Sign in to manage federation identities and delegations.</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-4 md:px-6 h-16 flex items-center gap-2">
          <Route className="h-4 w-4" />
          <div className="min-w-0">
            <div className="font-semibold text-sm md:text-base">Federation</div>
            <div className="text-xs text-muted-foreground truncate">Signed agent-to-agent protocol · open spec v1</div>
          </div>
          <button onClick={() => void refresh()} className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
          <section className="rounded-2xl border bg-sky-50 border-sky-200 p-4 text-sm flex gap-3">
            <Shield className="h-5 w-5 text-sky-600 shrink-0" />
            <div>
              <div className="font-medium">Declarative, signed and pinned</div>
              <div className="text-muted-foreground">
                Messages are short-lived ECDSA-signed envelopes. Peers are authenticated by pinned public keys.
                Payloads carry objectives and JSON data only — never code, commands, keys or endpoint authority.
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>Storage: {bool(data.protocol.storageReady)}</span>
                <span>Signing key: {bool(data.protocol.signingConfigured)}</span>
                <span>Local endpoints: {bool(data.protocol.localEndpointsAllowed)}</span>
                <span>Spec: {data.protocol.name} v{data.protocol.version}</span>
              </div>
            </div>
          </section>

          {!data.protocol.signingConfigured && (
            <div className="rounded-2xl border bg-red-50 border-red-200 p-3 text-xs text-red-800">
              Production signing is disabled until <code>A2A_SIGNING_SECRET</code> is configured. Peer registration from manifests still works, but creating new signed messages will fail.
            </div>
          )}
          {error && <div className="rounded-2xl border bg-amber-50 border-amber-200 p-3 text-xs text-amber-800">{error}</div>}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="rounded-2xl border bg-card p-4 md:p-5">
              <div className="flex items-center gap-2 font-medium text-sm"><Plus className="h-4 w-4" /> Register local identity</div>
              <p className="mt-1 text-xs text-muted-foreground">Publishes a deterministic public key for one existing agent. Private keys stay derived from the deployment secret.</p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-xs">Local agent
                  <select className={inputCls} value={effectiveSelectedAgentId} onChange={(e) => setSelectedAgentId(e.target.value)}>
                    {storeAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <div className="text-xs">Capabilities
                  <div className="mt-1 flex flex-wrap gap-2 rounded-lg border p-2">
                    {A2A_CAPABILITIES.map((cap) => (
                      <label key={cap} className={checkCls}>
                        <input type="checkbox" checked={agentCaps.includes(cap)} onChange={() => setAgentCaps((prev) => toggleValue(prev, cap))} />
                        {cap}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <button onClick={() => void registerAgent()} disabled={busy === "register-agent" || !effectiveSelectedAgentId || !data.protocol.signingConfigured} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-medium disabled:opacity-50">
                  {busy === "register-agent" && <Loader2 className="h-3 w-3 animate-spin" />} Register identity
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {data.agents.length === 0 && <div className="text-xs text-muted-foreground">No A2A identities registered yet.</div>}
                {data.agents.map((agent) => (
                  <div key={agent.id} className="rounded-xl border p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{agent.displayName} <span className="text-muted-foreground">({agent.agentId})</span></div>
                      <button onClick={() => void post("delete-agent", { action: "delete-agent", id: agent.id }, "A2A identity removed")} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="mt-1 break-all text-muted-foreground">{agent.did}</div>
                    <div className="mt-1">keyId <code>{agent.keyId}</code> · provider {agent.provider || "—"} · {agent.model || "—"}</div>
                    <div className="mt-1 text-muted-foreground">{agent.capabilities.join(", ") || "no capabilities advertised"}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-4 md:p-5">
              <div className="flex items-center gap-2 font-medium text-sm"><Plus className="h-4 w-4" /> Pin a peer</div>
              <p className="mt-1 text-xs text-muted-foreground">Fetches the peer&apos;s public manifest, checks key id and protocol version, then pins the key. No private key is stored.</p>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <label className="text-xs">Peer base URL
                  <input className={inputCls} placeholder="https://peer.example.com" value={peerEndpoint} onChange={(e) => setPeerEndpoint(e.target.value)} />
                </label>
                <label className="text-xs">Peer DID
                  <input className={inputCls} placeholder="did:medusa:..." value={peerDid} onChange={(e) => setPeerDid(e.target.value)} />
                </label>
              </div>
              <div className="mt-3">
                <button onClick={() => void importPeer()} disabled={busy === "import-peer" || !peerEndpoint || !peerDid} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-medium disabled:opacity-50">
                  {busy === "import-peer" && <Loader2 className="h-3 w-3 animate-spin" />} Fetch manifest &amp; pin
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {data.peers.length === 0 && <div className="text-xs text-muted-foreground">No peers pinned yet.</div>}
                {data.peers.map((peer) => (
                  <div key={peer.id} className="rounded-xl border p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{peer.displayName}</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => void probe(peer)} disabled={busy === "probe-peer"} className="text-sky-600 hover:underline">Probe</button>
                        <button onClick={() => void post("delete-peer", { action: "delete-peer", id: peer.id }, "Peer removed")} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <div className="mt-1 break-all text-muted-foreground">{peer.did}</div>
                    <div className="mt-1 break-all text-muted-foreground">{peer.endpoint}</div>
                    <div className="mt-1">keyId <code>{peer.keyId}</code> · seen {dateText(peer.lastSeenAt)}</div>
                    <div className="mt-1 text-muted-foreground">{peer.capabilities.join(", ") || "no capabilities advertised"}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="flex items-center gap-2 font-medium text-sm"><Activity className="h-4 w-4" /> Send delegation</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs">Local sender
                <select className={inputCls} value={effectiveLocalAgentId} onChange={(e) => setLocalAgentId(e.target.value)}>
                  <option value="">Select identity</option>
                  {data.agents.map((a) => <option key={a.id} value={a.agentId}>{a.displayName}</option>)}
                </select>
              </label>
              <label className="text-xs">Peer
                <select className={inputCls} value={effectiveDelegatePeerDid} onChange={(e) => setDelegatePeerDid(e.target.value)}>
                  <option value="">Select peer</option>
                  {data.peers.map((p) => <option key={p.id} value={p.did}>{p.displayName}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-xs">Objective
              <textarea className={inputCls} rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Declarative task objective" />
            </label>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="text-xs">Required capabilities
                <div className="mt-1 flex flex-wrap gap-2 rounded-lg border p-2">
                  {A2A_CAPABILITIES.map((cap) => (
                    <label key={cap} className={checkCls}>
                      <input type="checkbox" checked={requiredCaps.includes(cap)} onChange={() => setRequiredCaps((prev) => toggleValue(prev, cap))} />
                      {cap}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <label className="block text-xs">Budget (USD)
                  <input className={inputCls} type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
                </label>
                <label className="block text-xs">Input JSON
                  <textarea className={`${inputCls} font-mono`} rows={3} value={inputJson} onChange={(e) => setInputJson(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="mt-3">
              <button onClick={() => void delegate()} disabled={busy === "send-delegation" || !effectiveLocalAgentId || !effectiveDelegatePeerDid || !objective.trim()} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-medium disabled:opacity-50">
                {busy === "send-delegation" && <Loader2 className="h-3 w-3 animate-spin" />} Sign &amp; deliver
              </button>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="font-medium text-sm">Task and receipt timeline</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground"><tr className="text-left">
                  <th className="py-1">Direction</th><th>Task</th><th>Peer</th><th>Status</th><th>Receipt</th><th>Updated</th><th />
                </tr></thead>
                <tbody>
                  {data.tasks.length === 0 && <tr><td colSpan={7} className="py-3 text-muted-foreground">No delegations yet.</td></tr>}
                  {data.tasks.map((task) => (
                    <tr key={task.id} className="border-t align-top">
                      <td className="py-1.5">{task.direction}</td>
                      <td className="max-w-[260px] break-words font-medium">{task.objective}</td>
                      <td className="max-w-[220px] break-all">{task.peerDid}</td>
                      <td><span className={`rounded-full px-2 py-0.5 ${statusClass(task.status)}`}>{task.status}</span></td>
                      <td>{task.receiptStatus || "—"}</td>
                      <td>{dateText(task.updatedAt)}</td>
                      <td className="whitespace-nowrap">
                        <button onClick={() => void loadDetail(task)} className="text-sky-600 hover:underline">Detail</button>
                        {task.direction === "inbound" && !["running", "completed"].includes(task.status) && (
                          <button onClick={() => void runTask(task)} disabled={busy === `run-${task.id}`} className="ml-2 inline-flex items-center gap-1 text-emerald-600 hover:underline disabled:opacity-50">
                            {busy === `run-${task.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detail && (
              <div className="mt-4 rounded-xl border p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{detail.task.id}</div>
                  <button onClick={() => setDetail(null)} className="text-muted-foreground">close</button>
                </div>
                <div className="mt-1 text-muted-foreground">{detail.task.objective}</div>
                {detail.run && <div className="mt-1">Runtime: <a className="text-sky-600 hover:underline" href={detail.run}>open trace</a></div>}
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="font-medium">Messages</div>
                    {detail.messages.length === 0 && <div className="text-muted-foreground">None</div>}
                    {detail.messages.map((m) => (
                      <div key={m.id} className="mt-1 rounded border p-2">
                        {m.direction} · {m.type} · {dateText(m.createdAt)}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="font-medium">Receipts</div>
                    {detail.receipts.length === 0 && <div className="text-muted-foreground">None</div>}
                    {detail.receipts.map((r) => (
                      <div key={r.id} className="mt-1 rounded border p-2">
                        {r.status} · {r.detail || "—"} · {dateText(r.createdAt)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border bg-card p-4 md:p-5">
            <button onClick={() => setShowSpec((v) => !v)} className="flex w-full items-center justify-between text-left">
              <span className="flex items-center gap-2 font-medium text-sm"><Check className="h-4 w-4" /> Open protocol spec</span>
              <span className="text-xs text-muted-foreground">{showSpec ? "hide" : "show"}</span>
            </button>
            {showSpec && spec && (
              <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-muted p-3 text-[11px] leading-relaxed">
                {JSON.stringify(spec, null, 2)}
              </pre>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
