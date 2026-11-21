"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { toast } from "@/components/toast";
import { useMEDUSA } from "@/lib/store";
import {
  Activity, ArrowDownLeft, ArrowUpRight, Coins, Cpu, Loader2,
  Pause, Play, RefreshCw, Send, Wallet,
} from "lucide-react";
import type {
  BudgetRecord, BudgetScope, EconomySnapshot, WalletLedgerEntry,
} from "@/lib/foundation";

const EMPTY: EconomySnapshot = {
  wallet: null,
  ledger: [],
  budgets: [],
  delegations: [],
  totals: {
    balanceUsd: 0, spentUsd: 0, creditsUsd: 0,
    budgetLimitUsd: 0, budgetRemainingUsd: 0, ledgerEntries: 0,
  },
};

const SCOPES: BudgetScope[] = ["global", "agent", "run"];
const PERIODS: BudgetRecord["period"][] = ["all-time", "daily", "monthly"];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Request failed");
  return json as T;
}

function usd(value: number): string {
  return `$${value.toFixed(6)}`;
}

function dateText(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function amount(entry: WalletLedgerEntry): string {
  const value = entry.amountMicroUsd / 1_000_000;
  return `${entry.kind === "debit" ? "-" : "+"}${usd(Math.abs(value))}`;
}

function progress(spent: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.max(0, (spent / limit) * 100));
}

export default function EconomyPage() {
  const router = useRouter();
  const { currentUser } = useMEDUSA();
  const [state, setState] = useState<EconomySnapshot>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [walletLabel, setWalletLabel] = useState("");
  const [scope, setScope] = useState<BudgetScope>("global");
  const [scopeId, setScopeId] = useState("");
  const [limitUsd, setLimitUsd] = useState("5");
  const [period, setPeriod] = useState<BudgetRecord["period"]>("all-time");
  const [status, setStatus] = useState<BudgetRecord["status"]>("active");

  const [fromAgentId, setFromAgentId] = useState("");
  const [toAgentId, setToAgentId] = useState("");
  const [capUsd, setCapUsd] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");

  const [creditAmount, setCreditAmount] = useState("10");
  const [creditReason, setCreditReason] = useState("");
  const [creditKind, setCreditKind] = useState<"credit" | "grant" | "reinvest">("credit");

  const inputCls = "mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm";

  const refresh = useCallback(async () => {
    try {
      const snapshot = await api<EconomySnapshot>("/api/economy", { cache: "no-store" });
      setState(snapshot);
      setWalletLabel((prev) => prev || snapshot.wallet?.label || "");
    } catch (e) {
      setError((e as Error)?.message || "Could not load economy state");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  async function act(action: string, payload: Record<string, unknown>, message: string) {
    setBusy(action);
    setError("");
    try {
      await api("/api/economy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      toast(message);
      await refresh();
    } catch (e) {
      const text = (e as Error)?.message || `${action} failed`;
      setError(text);
      toast(text, "error");
    } finally {
      setBusy(null);
    }
  }

  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-sm md:text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Economy</div>
            <div className="text-xs text-muted-foreground truncate">
              Internal credits · budgets · agent delegation · usage-backed ledger
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/runs")}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs hover:bg-muted"
            >
              <Activity className="h-3.5 w-3.5" /> Runs
            </button>
            <button
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>

        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
          {error && <div className="rounded-xl border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Coins className="h-5 w-5 mt-0.5" style={{ color: "var(--accent)" }} />
              <div className="min-w-0">
                <div className="text-sm font-medium">Usage → wallet → budget → delegation</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Every recorded usage event is mirrored into the wallet ledger by its unique id, so retries cannot
                  double-charge. Costs remain best-effort USD estimates. No signing keys, seeds or external transfers
                  are stored here; balances are internal accounting credits.
                </div>
              </div>
            </div>
            {state.wallet && (
              <div className="flex flex-wrap items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5">wallet {state.wallet.id}</span>
                <span className="font-mono">ref {state.wallet.key}</span>
                <span>{state.wallet.currency}</span>
                <span className="ml-auto">created {dateText(state.wallet.createdAt)}</span>
              </div>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Balance", value: usd(state.totals.balanceUsd), icon: Wallet },
              { label: "Lifetime spend", value: usd(state.totals.spentUsd), icon: ArrowUpRight },
              { label: "Credits granted", value: usd(state.totals.creditsUsd), icon: ArrowDownLeft },
              { label: "Budget remaining", value: usd(state.totals.budgetRemainingUsd), icon: Activity },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border bg-card p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><card.icon className="h-4 w-4" /> {card.label}</div>
                <div className="mt-2 text-xl font-semibold">{card.value}</div>
              </div>
            ))}
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border bg-card p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Wallet className="h-4 w-4" /> Wallet label</h2>
              <form onSubmit={(e) => { e.preventDefault(); void act("wallet", { label: walletLabel }, "Wallet saved"); }} className="space-y-3">
                <label className="block text-xs">
                  Label
                  <input value={walletLabel} onChange={(e) => setWalletLabel(e.target.value)} maxLength={120} className={inputCls} />
                </label>
                <button
                  type="submit"
                  disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-foreground text-background px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {busy === "wallet" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Save
                </button>
              </form>
            </section>

            <section className="rounded-2xl border bg-card p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4" /> Budget</h2>
              <form onSubmit={(e) => { e.preventDefault(); void act("budget", {
                scope, scopeId, limitUsd: Number(limitUsd), period, status,
              }, "Budget saved"); }} className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs">
                  Scope
                  <select value={scope} onChange={(e) => setScope(e.target.value as BudgetScope)} className={inputCls}>
                    {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="block text-xs">
                  Scope id
                  <input
                    value={scopeId}
                    onChange={(e) => setScopeId(e.target.value)}
                    disabled={scope === "global"}
                    placeholder="agent id or run id"
                    className={inputCls}
                  />
                </label>
                <label className="block text-xs">
                  Limit (USD)
                  <input type="number" min={0} step={0.000001} value={limitUsd} onChange={(e) => setLimitUsd(e.target.value)} className={inputCls} />
                </label>
                <label className="block text-xs">
                  Period
                  <select value={period} onChange={(e) => setPeriod(e.target.value as BudgetRecord["period"])} className={inputCls}>
                    {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="block text-xs">
                  Status
                  <select value={status} onChange={(e) => setStatus(e.target.value as BudgetRecord["status"])} className={inputCls}>
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={!!busy}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground text-background px-3 py-2 text-xs disabled:opacity-50"
                  >
                    {busy === "budget" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                    Set budget
                  </button>
                </div>
              </form>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border bg-card p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Cpu className="h-4 w-4" /> Agent delegation</h2>
              <form onSubmit={(e) => { e.preventDefault(); void act("delegation", {
                fromAgentId, toAgentId, capUsd: Number(capUsd),
                expiresAt: expiresAt && Number.isFinite(Date.parse(expiresAt)) ? new Date(expiresAt).toISOString() : null,
              }, "Delegation saved"); }} className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs">
                  From agent
                  <input value={fromAgentId} onChange={(e) => setFromAgentId(e.target.value)} maxLength={120} className={inputCls} />
                </label>
                <label className="block text-xs">
                  To agent
                  <input value={toAgentId} onChange={(e) => setToAgentId(e.target.value)} maxLength={120} className={inputCls} />
                </label>
                <label className="block text-xs">
                  Cap (USD)
                  <input type="number" min={0} step={0.000001} value={capUsd} onChange={(e) => setCapUsd(e.target.value)} className={inputCls} />
                </label>
                <label className="block text-xs">
                  Expires
                  <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
                </label>
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={!!busy}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground text-background px-3 py-2 text-xs disabled:opacity-50"
                  >
                    {busy === "delegation" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Delegate spend
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-2xl border bg-card p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Coins className="h-4 w-4" /> Internal credits</h2>
              {isAdmin ? (
                <form onSubmit={(e) => { e.preventDefault(); void act("credit", {
                  amountUsd: Number(creditAmount), reason: creditReason, kind: creditKind,
                }, "Credits added"); }} className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs">
                    Amount (USD)
                    <input type="number" min={0.000001} step={0.000001} value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} className={inputCls} />
                  </label>
                  <label className="block text-xs">
                    Kind
                    <select value={creditKind} onChange={(e) => setCreditKind(e.target.value as typeof creditKind)} className={inputCls}>
                      <option value="credit">credit</option>
                      <option value="grant">grant</option>
                      <option value="reinvest">reinvest</option>
                    </select>
                  </label>
                  <label className="block text-xs sm:col-span-2">
                    Reason
                    <input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} maxLength={240} placeholder="bounty, refund, reinvestment…" className={inputCls} />
                  </label>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={!!busy}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground text-background px-3 py-2 text-xs disabled:opacity-50"
                    >
                      {busy === "credit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />}
                      Add credits
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">Only admins can mint or reinvest internal credits.</p>
              )}
            </section>
          </div>

          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4" /> Budgets</h2>
            {state.budgets.length === 0 && <p className="text-sm text-muted-foreground">No budget configured. Live turns and runtime agents stay unrestricted until you set one.</p>}
            <div className="space-y-2">
              {state.budgets.map((b) => (
                <div key={b.id} className="rounded-xl border bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-muted px-2 py-0.5">{b.scope}</span>
                    {b.scopeId && <span className="font-mono text-muted-foreground">{b.scopeId}</span>}
                    <span className={`rounded-full px-2 py-0.5 ${b.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{b.status}</span>
                    <span className="ml-auto text-muted-foreground">{b.period}</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2 text-sm">
                    <span className="font-medium">{usd(b.spentMicroUsd / 1_000_000)}</span>
                    <span className="text-muted-foreground">/ {usd(b.limitMicroUsd / 1_000_000)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-foreground" style={{ width: `${progress(b.spentMicroUsd, b.limitMicroUsd)}%` }} />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      disabled={!!busy}
                      onClick={() => void act("budget", {
                        scope: b.scope, scopeId: b.scopeId, period: b.period,
                        status: b.status === "active" ? "paused" : "active",
                      }, b.status === "active" ? "Budget paused" : "Budget resumed")}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      {b.status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      {b.status === "active" ? "Pause" : "Resume"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Cpu className="h-4 w-4" /> Delegations</h2>
            {state.delegations.length === 0 && <p className="text-sm text-muted-foreground">No agent-to-agent spend caps yet.</p>}
            <div className="grid gap-2 md:grid-cols-2">
              {state.delegations.map((d) => (
                <div key={d.id} className="rounded-xl border bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono">{d.fromAgentId}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono">{d.toAgentId}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 ${d.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{d.status}</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {usd(d.spentMicroUsd / 1_000_000)} / {usd(d.capMicroUsd / 1_000_000)} · expires {dateText(d.expiresAt)}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-foreground" style={{ width: `${progress(d.spentMicroUsd, d.capMicroUsd)}%` }} />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      disabled={!!busy}
                      onClick={() => void act("delegation-status", {
                        id: d.id, status: d.status === "active" ? "revoked" : "active",
                      }, d.status === "active" ? "Delegation revoked" : "Delegation restored")}
                      className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      {d.status === "active" ? "Revoke" : "Restore"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2"><ArrowUpRight className="h-4 w-4" /> Wallet ledger</h2>
            {state.ledger.length === 0 && <p className="text-sm text-muted-foreground">Costs appear here after the first recorded usage event.</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Kind</th>
                    <th className="py-2 pr-3 font-medium">Reason</th>
                    <th className="py-2 pr-3 font-medium">Agent</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {state.ledger.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{dateText(entry.createdAt)}</td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-full px-2 py-0.5 ${entry.kind === "debit" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{entry.kind}</span>
                      </td>
                      <td className="py-2 pr-3 max-w-xs truncate" title={entry.reason}>{entry.reason}</td>
                      <td className="py-2 pr-3 font-mono text-muted-foreground">{entry.agentId || "—"}</td>
                      <td className={`py-2 pr-3 text-right ${entry.kind === "debit" ? "text-red-600" : "text-emerald-600"}`}>{amount(entry)}</td>
                      <td className="py-2 text-right text-muted-foreground">{usd(entry.balanceAfterMicroUsd / 1_000_000)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Showing {state.ledger.length} ledger row(s). Source: usage_events, mirrored idempotently by source usage id.
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
