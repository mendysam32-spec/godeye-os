/**
 * Economic layer for roadmap Phase 2 item 8.
 *
 * This is an internal, USD-equivalent credit system: wallet references,
 * budgets, agent delegations and an auditable ledger. It deliberately stores
 * no signing keys, seeds, payment credentials or externally spendable value.
 * `usage_events` remains the authoritative cost source; every usage event is
 * mirrored into the wallet ledger so each agent action has a measurable cost.
 *
 * All rows are user-scoped. Queries use a single equality predicate plus a
 * defensive JS uid filter so they also work with the plain `next dev` JSON
 * fallback described in `d1.ts`.
 */

import { ensureFoundationSchema, getChatDb, type D1Like } from "./d1";
import {
  isBudgetScope,
  isWalletLedgerKind,
  newId,
  type BudgetCheck,
  type BudgetDelegation,
  type BudgetRecord,
  type BudgetScope,
  type EconomySnapshot,
  type UsageEvent,
  type WalletAccount,
  type WalletLedgerEntry,
  type WalletLedgerKind,
} from "./foundation";

interface WalletRow {
  id: string;
  uid: string;
  key: string;
  label: string;
  currency: string;
  balance_micro_usd: number | string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface LedgerRow {
  id: string;
  uid: string;
  wallet_id: string;
  run_id: string | null;
  kind: string;
  amount_micro_usd: number | string;
  balance_after_micro_usd: number | string;
  reason: string;
  source_usage_id: string | null;
  agent_id: string | null;
  metadata: string | null;
  created_at: string;
}

interface BudgetRow {
  id: string;
  uid: string;
  wallet_id: string;
  scope: string;
  scope_id: string;
  limit_micro_usd: number | string;
  spent_micro_usd: number | string;
  period: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface DelegationRow {
  id: string;
  uid: string;
  from_agent_id: string;
  to_agent_id: string;
  budget_id: string;
  cap_micro_usd: number | string;
  spent_micro_usd: number | string;
  status: string;
  expires_at: string | null;
  created_at: string;
}

const WALLET_UPSERT = `INSERT INTO wallet_accounts
  (id, uid, key, label, currency, balance_micro_usd, status, created_at, updated_at)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
  ON CONFLICT(id) DO UPDATE SET
    label = excluded.label, balance_micro_usd = excluded.balance_micro_usd,
    status = excluded.status, updated_at = excluded.updated_at`;

const LEDGER_INSERT = `INSERT INTO wallet_ledger
  (id, uid, wallet_id, run_id, kind, amount_micro_usd, balance_after_micro_usd,
   reason, source_usage_id, agent_id, metadata, created_at)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`;

const BUDGET_UPSERT = `INSERT INTO budgets
  (id, uid, wallet_id, scope, scope_id, limit_micro_usd, spent_micro_usd,
   period, status, created_at, updated_at)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
  ON CONFLICT(id) DO UPDATE SET
    limit_micro_usd = excluded.limit_micro_usd, spent_micro_usd = excluded.spent_micro_usd,
    period = excluded.period, status = excluded.status, updated_at = excluded.updated_at`;

const DELEGATION_UPSERT = `INSERT INTO budget_delegations
  (id, uid, from_agent_id, to_agent_id, budget_id, cap_micro_usd, spent_micro_usd,
   status, expires_at, created_at)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
  ON CONFLICT(id) DO UPDATE SET
    cap_micro_usd = excluded.cap_micro_usd, spent_micro_usd = excluded.spent_micro_usd,
    status = excluded.status, expires_at = excluded.expires_at`;

async function foundationDb(): Promise<D1Like | null> {
  const db = await getChatDb();
  if (!db) return null;
  await ensureFoundationSchema(db);
  return db;
}

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function clip(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toMicro(usd: unknown): number {
  const value = Math.abs(num(usd));
  return Math.round(Math.min(value, 1_000_000) * 1_000_000);
}

function toUsd(micro: number): number {
  return Math.round((num(micro) / 1_000_000) * 1_000_000) / 1_000_000;
}

function walletId(uid: string): string {
  return `wal_${hash(uid)}`;
}

function walletKey(uid: string): string {
  return `mc_${hash(`${uid}:wallet-key`)}`;
}

function budgetId(uid: string, scope: BudgetScope, scopeId: string): string {
  return `bud_${hash(`${uid}:${scope}:${scopeId}`)}`;
}

function delegationId(uid: string, from: string, to: string): string {
  return `del_${hash(`${uid}:${from}:${to}`)}`;
}

function parseObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function mapWallet(r: WalletRow): WalletAccount {
  return {
    id: r.id,
    uid: r.uid,
    key: r.key || walletKey(r.uid),
    label: r.label || "MEDUSA wallet",
    currency: "USD_CREDIT",
    balanceMicroUsd: num(r.balance_micro_usd),
    status: "active",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapLedger(r: LedgerRow): WalletLedgerEntry {
  return {
    id: r.id,
    uid: r.uid,
    walletId: r.wallet_id,
    runId: r.run_id ?? null,
    kind: isWalletLedgerKind(r.kind) ? r.kind : "debit",
    amountMicroUsd: num(r.amount_micro_usd),
    balanceAfterMicroUsd: num(r.balance_after_micro_usd),
    reason: r.reason || "",
    sourceUsageId: r.source_usage_id ?? null,
    agentId: r.agent_id ?? null,
    metadata: parseObject(r.metadata),
    createdAt: r.created_at,
  };
}

function mapBudget(r: BudgetRow): BudgetRecord {
  return {
    id: r.id,
    uid: r.uid,
    walletId: r.wallet_id,
    scope: isBudgetScope(r.scope) ? r.scope : "global",
    scopeId: r.scope_id || "",
    limitMicroUsd: num(r.limit_micro_usd),
    spentMicroUsd: num(r.spent_micro_usd),
    period: r.period === "daily" || r.period === "monthly" ? r.period : "all-time",
    status: r.status === "paused" ? "paused" : "active",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapDelegation(r: DelegationRow): BudgetDelegation {
  return {
    id: r.id,
    uid: r.uid,
    fromAgentId: r.from_agent_id,
    toAgentId: r.to_agent_id,
    budgetId: r.budget_id,
    capMicroUsd: num(r.cap_micro_usd),
    spentMicroUsd: num(r.spent_micro_usd),
    status: r.status === "revoked" ? "revoked" : "active",
    expiresAt: r.expires_at ?? null,
    createdAt: r.created_at,
  };
}

async function walletRow(db: D1Like, uid: string): Promise<WalletRow | null> {
  const row = await db.prepare("SELECT * FROM wallet_accounts WHERE id = ?1").bind(walletId(uid)).first<WalletRow>();
  return row && row.uid === uid ? row : null;
}

async function saveWallet(db: D1Like, wallet: WalletAccount): Promise<void> {
  await db.prepare(WALLET_UPSERT).bind(
    wallet.id, wallet.uid, wallet.key, wallet.label, wallet.currency,
    wallet.balanceMicroUsd, wallet.status, wallet.createdAt, wallet.updatedAt,
  ).run();
}

async function ensureWalletOnDb(db: D1Like, uid: string, label?: string): Promise<WalletAccount> {
  const existing = await walletRow(db, uid);
  if (existing) return mapWallet(existing);
  const now = new Date().toISOString();
  const wallet: WalletAccount = {
    id: walletId(uid), uid, key: walletKey(uid),
    label: clip(label, 120) || "MEDUSA wallet",
    currency: "USD_CREDIT", balanceMicroUsd: 0, status: "active",
    createdAt: now, updatedAt: now,
  };
  await saveWallet(db, wallet);
  return wallet;
}

export async function ensureWallet(uid: string, label?: string): Promise<WalletAccount | null> {
  const db = await foundationDb();
  if (!db) return null;
  return ensureWalletOnDb(db, uid, label);
}

async function ledgerById(db: D1Like, uid: string, id: string): Promise<WalletLedgerEntry | null> {
  const row = await db.prepare("SELECT * FROM wallet_ledger WHERE id = ?1").bind(id).first<LedgerRow>();
  return row && row.uid === uid ? mapLedger(row) : null;
}

async function insertLedger(db: D1Like, entry: WalletLedgerEntry): Promise<WalletLedgerEntry> {
  await db.prepare(LEDGER_INSERT).bind(
    entry.id, entry.uid, entry.walletId, entry.runId, entry.kind,
    entry.amountMicroUsd, entry.balanceAfterMicroUsd, entry.reason,
    entry.sourceUsageId, entry.agentId, JSON.stringify(entry.metadata), entry.createdAt,
  ).run();
  return entry;
}

function periodKey(date: Date, period: BudgetRecord["period"]): string {
  if (period === "daily") return date.toISOString().slice(0, 10);
  if (period === "monthly") return date.toISOString().slice(0, 7);
  return "all-time";
}

async function loadBudgets(db: D1Like, uid: string): Promise<BudgetRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM budgets WHERE uid = ?1 ORDER BY created_at DESC")
    .bind(uid)
    .all<BudgetRow>();
  const now = new Date();
  const nowKey = `${periodKey(now, "daily")}:${periodKey(now, "monthly")}`;
  const budgets: BudgetRecord[] = [];
  for (const row of results.filter((r) => r.uid === uid)) {
    const budget = mapBudget(row);
    // The dev shim cannot UPDATE, so a period reset is a full-row upsert.
    const stampKey = `${periodKey(new Date(budget.updatedAt), "daily")}:${periodKey(new Date(budget.updatedAt), "monthly")}`;
    if (budget.period !== "all-time" && stampKey !== nowKey && budget.spentMicroUsd > 0) {
      budget.spentMicroUsd = 0;
      budget.updatedAt = now.toISOString();
      await saveBudget(db, budget);
    }
    budgets.push(budget);
  }
  return budgets;
}

async function saveBudget(db: D1Like, budget: BudgetRecord): Promise<void> {
  await db.prepare(BUDGET_UPSERT).bind(
    budget.id, budget.uid, budget.walletId, budget.scope, budget.scopeId,
    budget.limitMicroUsd, budget.spentMicroUsd, budget.period, budget.status,
    budget.createdAt, budget.updatedAt,
  ).run();
}

async function loadDelegations(db: D1Like, uid: string): Promise<BudgetDelegation[]> {
  const { results } = await db
    .prepare("SELECT * FROM budget_delegations WHERE uid = ?1 ORDER BY created_at DESC")
    .bind(uid)
    .all<DelegationRow>();
  return results.filter((r) => r.uid === uid).map(mapDelegation);
}

async function saveDelegation(db: D1Like, delegation: BudgetDelegation): Promise<void> {
  await db.prepare(DELEGATION_UPSERT).bind(
    delegation.id, delegation.uid, delegation.fromAgentId, delegation.toAgentId,
    delegation.budgetId, delegation.capMicroUsd, delegation.spentMicroUsd,
    delegation.status, delegation.expiresAt, delegation.createdAt,
  ).run();
}

async function loadLedger(db: D1Like, uid: string): Promise<WalletLedgerEntry[]> {
  const { results } = await db
    .prepare("SELECT * FROM wallet_ledger WHERE uid = ?1 ORDER BY created_at DESC")
    .bind(uid)
    .all<LedgerRow>();
  return results.filter((r) => r.uid === uid).map(mapLedger);
}

export async function listLedger(uid: string, limit = 200): Promise<WalletLedgerEntry[]> {
  const db = await foundationDb();
  if (!db) return [];
  const entries = await loadLedger(db, uid);
  return entries.slice(0, Math.max(1, Math.min(1000, limit)));
}

/**
 * Mirror one usage event into the wallet ledger. Idempotent by source usage id,
 * so retries never debit twice. Budget and delegation counters advance here —
 * the LLM usage ledger stays the single cost source of truth.
 */
export async function chargeUsageEvent(
  event: UsageEvent,
  ctx: { agentId?: string | null } = {},
): Promise<WalletLedgerEntry | null> {
  const db = await foundationDb();
  if (!db) return null;
  const wallet = await ensureWalletOnDb(db, event.uid);
  const entryId = `led_usage_${event.id}`;
  const existing = await ledgerById(db, event.uid, entryId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const amount = toMicro(event.costUsd);
  const agentId = clip(ctx.agentId ?? event.metadata?.agentId ?? event.metadata?.taskId, 120) || null;
  const entry: WalletLedgerEntry = {
    id: entryId, uid: event.uid, walletId: wallet.id, runId: event.runId ?? null,
    kind: "debit", amountMicroUsd: amount,
    balanceAfterMicroUsd: wallet.balanceMicroUsd - amount,
    reason: `${event.kind}:${event.provider}/${event.model}`.slice(0, 240),
    sourceUsageId: event.id, agentId,
    metadata: {
      provider: event.provider, model: event.model, usageKind: event.kind,
      tokens: event.totalTokens, pricingSource: event.pricingSource,
    },
    createdAt: now,
  };
  await insertLedger(db, entry);
  await saveWallet(db, { ...wallet, balanceMicroUsd: entry.balanceAfterMicroUsd, updatedAt: now });

  if (amount > 0) {
    const budgets = await loadBudgets(db, event.uid);
    for (const budget of budgets) {
      if (budget.status !== "active") continue;
      const matches =
        (budget.scope === "global") ||
        (budget.scope === "agent" && !!agentId && budget.scopeId === agentId) ||
        (budget.scope === "run" && !!event.runId && budget.scopeId === event.runId);
      if (!matches) continue;
      await saveBudget(db, { ...budget, spentMicroUsd: budget.spentMicroUsd + amount, updatedAt: now });
    }

    if (agentId) {
      const delegations = await loadDelegations(db, event.uid);
      for (const delegation of delegations) {
        if (delegation.status !== "active" || delegation.toAgentId !== agentId) continue;
        if (delegation.expiresAt && Date.parse(delegation.expiresAt) < Date.now()) continue;
        await saveDelegation(db, { ...delegation, spentMicroUsd: delegation.spentMicroUsd + amount });
      }
    }
  }
  return entry;
}

/** Preflight gate. Returns allowed when no active budget applies to the scope. */
export async function checkBudget(
  uid: string,
  estimatedCostUsd = 0,
  opts: { scope?: BudgetScope; scopeId?: string } = {},
): Promise<BudgetCheck> {
  const db = await foundationDb();
  if (!db) return { allowed: true, remainingMicroUsd: null, reason: "no D1 binding", scopes: [] };
  const all = await loadBudgets(db, uid);
  const active = all.filter((b) => b.status === "active");
  const applicable = active.filter((b) => {
    if (b.scope === "global") return true;
    if (!opts.scope || !opts.scopeId || opts.scope !== b.scope) return false;
    return b.scopeId === opts.scopeId;
  });
  if (!applicable.length) {
    return { allowed: true, remainingMicroUsd: null, reason: "no budget configured", scopes: [] };
  }
  const estimate = toMicro(estimatedCostUsd);
  let remaining = Number.POSITIVE_INFINITY;
  for (const budget of applicable) {
    remaining = Math.min(remaining, budget.limitMicroUsd - budget.spentMicroUsd - estimate);
  }
  const allowed = remaining >= 0;
  return {
    allowed,
    remainingMicroUsd: allowed ? remaining : 0,
    reason: allowed
      ? `budget remaining $${toUsd(remaining).toFixed(4)}`
      : "Budget exhausted — add credits or raise the limit",
    scopes: [...new Set(applicable.map((b) => b.scope))],
  };
}

/** Add internal credits (bounty, revenue share, admin grant or reinvestment). */
export async function creditWallet(input: {
  uid: string;
  amountUsd: number;
  reason: string;
  kind?: "credit" | "grant" | "reinvest";
  metadata?: Record<string, unknown>;
}): Promise<WalletLedgerEntry | null> {
  const db = await foundationDb();
  if (!db) return null;
  const amount = toMicro(input.amountUsd);
  if (amount <= 0) throw new Error("Amount must be greater than zero");
  const wallet = await ensureWalletOnDb(db, input.uid);
  const kind: WalletLedgerKind = input.kind ?? "credit";
  const entry: WalletLedgerEntry = {
    id: newId("led"), uid: input.uid, walletId: wallet.id, runId: null,
    kind, amountMicroUsd: amount,
    balanceAfterMicroUsd: wallet.balanceMicroUsd + amount,
    reason: clip(input.reason, 240) || `${kind} credit`,
    sourceUsageId: null, agentId: null,
    metadata: input.metadata ?? {}, createdAt: new Date().toISOString(),
  };
  await insertLedger(db, entry);
  await saveWallet(db, { ...wallet, balanceMicroUsd: entry.balanceAfterMicroUsd, updatedAt: entry.createdAt });
  return entry;
}

export async function setBudget(input: {
  uid: string;
  scope?: BudgetScope;
  scopeId?: string;
  /** Omit when pausing/resuming an existing budget so its cap is preserved. */
  limitUsd?: number;
  period?: BudgetRecord["period"];
  status?: BudgetRecord["status"];
}): Promise<BudgetRecord | null> {
  const db = await foundationDb();
  if (!db) return null;
  const scope = isBudgetScope(input.scope) ? input.scope : "global";
  const scopeId = scope === "global" ? "" : clip(input.scopeId, 120);
  if (scope !== "global" && !scopeId) throw new Error("scopeId is required for agent/run budgets");
  const wallet = await ensureWalletOnDb(db, input.uid);
  const id = budgetId(input.uid, scope, scopeId);
  const row = await db.prepare("SELECT * FROM budgets WHERE id = ?1").bind(id).first<BudgetRow>();
  const existing = row && row.uid === input.uid ? mapBudget(row) : null;
  const limit = input.limitUsd;
  const hasLimit = typeof limit === "number" && Number.isFinite(limit) && limit >= 0;
  if (!existing && !hasLimit) throw new Error("limitUsd is required for a new budget");
  const now = new Date().toISOString();
  const budget: BudgetRecord = {
    id, uid: input.uid, walletId: wallet.id, scope, scopeId,
    limitMicroUsd: hasLimit ? toMicro(limit) : existing!.limitMicroUsd,
    spentMicroUsd: existing?.spentMicroUsd ?? 0,
    period: input.period === "daily" || input.period === "monthly"
      ? input.period
      : (existing?.period ?? "all-time"),
    status: input.status === "paused" || input.status === "active"
      ? input.status
      : (existing?.status ?? "active"),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await saveBudget(db, budget);
  return budget;
}

export async function delegateBudget(input: {
  uid: string;
  fromAgentId: string;
  toAgentId: string;
  capUsd: number;
  budgetId?: string;
  expiresAt?: string | null;
}): Promise<BudgetDelegation | null> {
  const db = await foundationDb();
  if (!db) return null;
  const fromAgentId = clip(input.fromAgentId, 120);
  const toAgentId = clip(input.toAgentId, 120);
  if (!fromAgentId || !toAgentId || fromAgentId === toAgentId) {
    throw new Error("Valid, distinct fromAgentId and toAgentId are required");
  }
  const budgets = await loadBudgets(db, input.uid);
  const budget = budgets.find((b) => b.id === input.budgetId) ?? budgets.find((b) => b.scope === "global");
  if (!budget) throw new Error("Create a budget before delegating spend");
  const id = delegationId(input.uid, fromAgentId, toAgentId);
  const { results } = await db
    .prepare("SELECT * FROM budget_delegations WHERE uid = ?1")
    .bind(input.uid)
    .all<DelegationRow>();
  const existingRow = results.find((r) => r.id === id && r.uid === input.uid);
  const existing = existingRow ? mapDelegation(existingRow) : null;
  const expiresAt = input.expiresAt && Number.isFinite(Date.parse(input.expiresAt))
    ? new Date(input.expiresAt).toISOString()
    : null;
  const delegation: BudgetDelegation = {
    id, uid: input.uid, fromAgentId, toAgentId, budgetId: budget.id,
    capMicroUsd: toMicro(input.capUsd),
    spentMicroUsd: existing?.spentMicroUsd ?? 0,
    status: "active", expiresAt,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  await saveDelegation(db, delegation);
  return delegation;
}

export async function setDelegationStatus(uid: string, id: string, status: "active" | "revoked"): Promise<BudgetDelegation | null> {
  const db = await foundationDb();
  if (!db) return null;
  const row = await db.prepare("SELECT * FROM budget_delegations WHERE id = ?1").bind(id).first<DelegationRow>();
  if (!row || row.uid !== uid) return null;
  const delegation = mapDelegation(row);
  const updated = { ...delegation, status, spentMicroUsd: delegation.spentMicroUsd };
  await saveDelegation(db, updated);
  return updated;
}

export async function summarizeEconomy(uid: string, ledgerLimit = 200): Promise<EconomySnapshot> {
  const db = await foundationDb();
  if (!db) {
    return {
      wallet: null, ledger: [], budgets: [], delegations: [],
      totals: { balanceUsd: 0, spentUsd: 0, creditsUsd: 0, budgetLimitUsd: 0, budgetRemainingUsd: 0, ledgerEntries: 0 },
    };
  }
  const wallet = await ensureWalletOnDb(db, uid);
  const [allEntries, budgets, delegations] = await Promise.all([
    loadLedger(db, uid),
    loadBudgets(db, uid),
    loadDelegations(db, uid),
  ]);
  const ledger = allEntries.slice(0, Math.max(1, Math.min(1000, ledgerLimit)));
  const spent = allEntries.filter((e) => e.kind === "debit").reduce((n, e) => n + e.amountMicroUsd, 0);
  const credits = allEntries.filter((e) => e.kind !== "debit").reduce((n, e) => n + e.amountMicroUsd, 0);
  const global = budgets.filter((b) => b.scope === "global" && b.status === "active");
  const budgetLimit = global.reduce((n, b) => n + b.limitMicroUsd, 0);
  const budgetRemaining = global.reduce((n, b) => n + Math.max(0, b.limitMicroUsd - b.spentMicroUsd), 0);
  return {
    wallet, ledger, budgets, delegations,
    totals: {
      balanceUsd: toUsd(wallet.balanceMicroUsd),
      spentUsd: toUsd(spent),
      creditsUsd: toUsd(credits),
      budgetLimitUsd: toUsd(budgetLimit),
      budgetRemainingUsd: toUsd(budgetRemaining),
      ledgerEntries: allEntries.length,
    },
  };
}
