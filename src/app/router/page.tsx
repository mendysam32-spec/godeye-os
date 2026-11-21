"use client";

/**
 * Runtime Router configuration (roadmap Phase 2 item 9).
 *
 * Everything here is declarative, user-scoped and gated. This page never
 * collects API keys or endpoint URLs — those stay in the encrypted Providers
 * Vault. Model output can only propose allowlisted routing preferences through
 * the improvement pipeline; it has no authority to write these settings.
 */

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { toast } from "@/components/toast";
import { useMEDUSA } from "@/lib/store";
import { Activity, Check, Loader2, Plus, Route, Shield, Trash2 } from "lucide-react";
import type {
  RuntimeCapability, RuntimeHealthCheck, RuntimeModelPolicy, RuntimeProviderConfig,
} from "@/lib/runtime-config";

interface CatalogEntry {
  id: string;
  name: string;
  kind: string;
  auth: string;
  localOnly: boolean;
  endpointRequired: boolean;
}

interface RouterSnapshot {
  ok: boolean;
  providers: RuntimeProviderConfig[];
  policies: RuntimeModelPolicy[];
  health: RuntimeHealthCheck[];
  capabilities: RuntimeCapability[];
  localEndpointsAllowed: boolean;
  catalog: CatalogEntry[];
}

const EMPTY: RouterSnapshot = {
  ok: true, providers: [], policies: [], health: [],
  capabilities: [], localEndpointsAllowed: false, catalog: [],
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

export default function RouterPage() {
  const { currentUser } = useMEDUSA();
  const [data, setData] = useState<RouterSnapshot>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [providerId, setProviderId] = useState("");
  const [providerEnabled, setProviderEnabled] = useState(true);
  const [providerPriority, setProviderPriority] = useState("0");

  const [taskClass, setTaskClass] = useState("general");
  const [modelProvider, setModelProvider] = useState("");
  const [modelId, setModelId] = useState("");
  const [modelEnabled, setModelEnabled] = useState(true);
  const [modelPriority, setModelPriority] = useState("0");
  const [capabilities, setCapabilities] = useState<RuntimeCapability[]>([]);
  const [fallbackText, setFallbackText] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("3");
  const [localOnly, setLocalOnly] = useState(false);

  const inputCls = "mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm";
  const checkCls = "inline-flex items-center gap-1.5 text-xs";

  const refresh = useCallback(async () => {
    try {
      const snap = await api<RouterSnapshot>("/api/runtime-router", { cache: "no-store" });
      setData(snap);
      setProviderId((prev) => prev || snap.catalog[0]?.id || "");
      setModelProvider((prev) => prev || snap.catalog[0]?.id || "");
    } catch (e) {
      setError((e as Error)?.message || "Could not load runtime router state");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  async function saveProvider() {
    setBusy("provider");
    setError("");
    try {
      await api("/api/runtime-router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "provider",
          provider: providerId,
          enabled: providerEnabled,
          priority: Number(providerPriority),
        }),
      });
      toast("Provider policy saved");
      await refresh();
    } catch (e) {
      const text = (e as Error)?.message || "Could not save provider policy";
      setError(text);
      toast(text, "error");
    } finally {
      setBusy(null);
    }
  }

  async function savePolicy() {
    setBusy("policy");
    setError("");
    const fallbacks = fallbackText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        const at = line.indexOf(":");
        if (at <= 0) return [];
        const provider = line.slice(0, at).trim();
        const model = line.slice(at + 1).trim();
        return model ? [{ provider, model }] : [];
      });
    try {
      await api("/api/runtime-router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "model",
          taskClass,
          provider: modelProvider,
          model: modelId,
          enabled: modelEnabled,
          priority: Number(modelPriority),
          requiredCapabilities: capabilities,
          fallbacks,
          maxAttempts: Number(maxAttempts),
          localOnly,
        }),
      });
      toast("Model routing policy saved");
      setModelId("");
      setFallbackText("");
      await refresh();
    } catch (e) {
      const text = (e as Error)?.message || "Could not save model policy";
      setError(text);
      toast(text, "error");
    } finally {
      setBusy(null);
    }
  }

  async function removePolicy(id: string) {
    setBusy(id);
    setError("");
    try {
      await api("/api/runtime-router", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      toast("Routing policy removed");
      await refresh();
    } catch (e) {
      const text = (e as Error)?.message || "Could not remove policy";
      setError(text);
      toast(text, "error");
    } finally {
      setBusy(null);
    }
  }

  function toggleCapability(cap: RuntimeCapability) {
    setCapabilities((prev) => prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]);
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex md:flex-row bg-background">
        <Sidebar />
        <main className="flex-1 p-6 text-sm text-muted-foreground">Sign in to configure runtime routing.</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-4 md:px-6 h-16 flex items-center gap-2">
          <Route className="h-4 w-4"/>
          <div className="min-w-0"><div className="font-semibold text-sm md:text-base">Runtime Router</div><div className="text-xs text-muted-foreground truncate">Model-agnostic routing for cloud + local providers</div></div>
        </div>
        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
          <div className="rounded-2xl border bg-sky-50 border-sky-200 p-4 text-sm flex gap-3">
            <Shield className="h-5 w-5 text-sky-600 shrink-0"/>
            <div>
              <div className="font-medium">Declarative and gated</div>
              <div className="text-muted-foreground">Only provider/model ids, priorities, capabilities and bounded fallbacks are stored here. No API keys or endpoint URLs — those stay encrypted in the Providers Vault. Model output cannot write these settings directly; improvements arrive as proposals that must be validated first. Cross-provider and local→remote fallbacks stay disabled unless you explicitly allow them.</div>
            </div>
          </div>

          {!data.localEndpointsAllowed && (
            <div className="rounded-2xl border bg-amber-50 border-amber-200 p-3 text-xs text-amber-800">
              Local/private endpoints are disabled in this deployment. Local provider overrides will be skipped here; run MEDUSA locally to use them.
            </div>
          )}
          {error && <div className="rounded-2xl border bg-amber-50 border-amber-200 p-3 text-xs text-amber-800">{error}</div>}

          {/* provider overrides */}
          <section className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-sm">Provider availability</div>
              <span className="text-xs text-muted-foreground">empty means “use the catalog defaults”</span>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-xs">Provider
                <select className={inputCls} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                  {data.catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="text-xs">Priority
                <input className={inputCls} type="number" value={providerPriority} onChange={(e) => setProviderPriority(e.target.value)}/>
              </label>
              <div className="flex items-end">
                <label className={checkCls}><input type="checkbox" checked={providerEnabled} onChange={(e) => setProviderEnabled(e.target.checked)}/> Enabled</label>
              </div>
            </div>
            <div className="mt-3">
              <button onClick={saveProvider} disabled={busy === "provider" || !providerId} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-medium disabled:opacity-50">
                {busy === "provider" && <Loader2 className="h-3 w-3 animate-spin"/>} Save provider policy
              </button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground"><tr className="text-left"><th className="py-1">Provider</th><th>Kind</th><th>Auth</th><th>Enabled</th><th>Priority</th><th>Health</th></tr></thead>
                <tbody>
                  {data.providers.length === 0 && <tr><td colSpan={6} className="py-3 text-muted-foreground">No overrides — every catalog provider is available.</td></tr>}
                  {data.providers.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-1.5 font-medium">{p.provider}</td>
                      <td>{p.providerKind}</td>
                      <td>{p.authMode}</td>
                      <td>{bool(p.enabled)}</td>
                      <td>{p.priority}</td>
                      <td>{p.healthStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* model policies */}
          <section className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="font-medium text-sm">Task-class routing policies</div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-xs">Task class
                <input className={inputCls} value={taskClass} onChange={(e) => setTaskClass(e.target.value)} placeholder="code, research, chat…"/>
              </label>
              <label className="text-xs">Provider
                <select className={inputCls} value={modelProvider} onChange={(e) => setModelProvider(e.target.value)}>
                  {data.catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="text-xs">Model id
                <input className={inputCls} value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="llama3.2 or gpt-4o"/>
              </label>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-xs">Priority
                <input className={inputCls} type="number" value={modelPriority} onChange={(e) => setModelPriority(e.target.value)}/>
              </label>
              <label className="text-xs">Max attempts (1–4)
                <input className={inputCls} type="number" min={1} max={4} value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)}/>
              </label>
              <div className="flex items-end gap-4">
                <label className={checkCls}><input type="checkbox" checked={modelEnabled} onChange={(e) => setModelEnabled(e.target.checked)}/> Enabled</label>
                <label className={checkCls}><input type="checkbox" checked={localOnly} onChange={(e) => setLocalOnly(e.target.checked)}/> Local only</label>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xs">Required capabilities <span className="text-muted-foreground">— candidate must satisfy all selected</span></div>
              <div className="mt-1 flex flex-wrap gap-3">
                {data.capabilities.map((cap) => (
                  <label key={cap} className={checkCls}>
                    <input type="checkbox" checked={capabilities.includes(cap)} onChange={() => toggleCapability(cap)}/> {cap}
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <label className="text-xs">Fallbacks <span className="text-muted-foreground">— one “provider:model” per line, max 4</span></label>
              <textarea className={`${inputCls} font-mono`} rows={2} value={fallbackText} onChange={(e) => setFallbackText(e.target.value)} placeholder={"ollama:qwen2.5\nopenai:gpt-4o-mini"}/>
            </div>
            <div className="mt-3">
              <button onClick={savePolicy} disabled={busy === "policy" || !modelId.trim()} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-medium disabled:opacity-50">
                {busy === "policy" && <Loader2 className="h-3 w-3 animate-spin"/>} <Plus className="h-3 w-3"/> Save policy
              </button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground"><tr className="text-left"><th className="py-1">Task</th><th>Model</th><th>Capabilities</th><th>Fallbacks</th><th>Attempts</th><th></th></tr></thead>
                <tbody>
                  {data.policies.length === 0 && <tr><td colSpan={6} className="py-3 text-muted-foreground">No task-specific policies yet.</td></tr>}
                  {data.policies.map((p) => (
                    <tr key={p.id} className="border-t align-top">
                      <td className="py-1.5 font-medium">{p.taskClass}{!p.enabled && <span className="ml-1 text-amber-600">(off)</span>}</td>
                      <td className="font-mono">{p.provider}:{p.model}</td>
                      <td>{p.requiredCapabilities.length ? p.requiredCapabilities.join(", ") : "—"}</td>
                      <td>{p.fallbacks.length ? p.fallbacks.map((f) => `${f.provider}:${f.model}`).join(", ") : "—"}</td>
                      <td>{p.maxAttempts}{p.localOnly && <span className="ml-1 text-sky-700">local</span>}</td>
                      <td>
                        <button onClick={() => removePolicy(p.id)} disabled={busy === p.id} title="Remove policy" className="p-1 rounded-md text-muted-foreground hover:text-red-600 disabled:opacity-50">
                          {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Trash2 className="h-3.5 w-3.5"/>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* health history */}
          <section className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="flex items-center gap-2 font-medium text-sm"><Activity className="h-4 w-4"/> Health history</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground"><tr className="text-left"><th className="py-1">Checked</th><th>Provider</th><th>Model</th><th>Result</th><th>Latency</th><th>Endpoint</th><th>Detail</th></tr></thead>
                <tbody>
                  {data.health.length === 0 && <tr><td colSpan={7} className="py-3 text-muted-foreground">No health checks yet — verify a provider in the Providers Vault.</td></tr>}
                  {data.health.slice(0, 20).map((h) => (
                    <tr key={h.id} className="border-t">
                      <td className="py-1.5">{dateText(h.checkedAt)}</td>
                      <td>{h.provider}</td>
                      <td className="font-mono">{h.model || "—"}</td>
                      <td>{h.ok ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3 w-3"/> ok</span> : <span className="text-amber-700">failed</span>}</td>
                      <td>{h.latencyMs == null ? "—" : `${h.latencyMs} ms`}</td>
                      <td className="font-mono">{h.endpointFingerprint || "catalog"}</td>
                      <td className="max-w-[240px] truncate" title={h.error || ""}>{h.error || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">Raw endpoints and credentials are never stored here — only a non-reversible fingerprint is kept.</div>
          </section>

          {/* catalog reference */}
          <section className="rounded-2xl border bg-card p-4 md:p-5">
            <div className="font-medium text-sm">Provider catalog</div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.catalog.map((c) => (
                <div key={c.id} className="rounded-xl border p-3 text-xs">
                  <div className="font-medium">{c.name} <span className="text-muted-foreground">({c.id})</span></div>
                  <div className="mt-1 text-muted-foreground">kind: {c.kind} • auth: {c.auth}{c.localOnly && " • local"}{c.endpointRequired && " • endpoint required"}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
