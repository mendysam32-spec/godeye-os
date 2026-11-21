import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  creditWallet, delegateBudget, ensureWallet, setBudget,
  setDelegationStatus, summarizeEconomy,
} from "@/lib/economy";
import { isBudgetScope, type BudgetRecord, type BudgetScope } from "@/lib/foundation";

/**
 * Authenticated economy surface. All money amounts, scopes and ids are
 * validated here; `uid` always comes from the session. There are no external
 * transfers — credits are internal USD-equivalent accounting units.
 */

function nonnegative(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return n;
}

function positive(value: unknown): number | null {
  const n = nonnegative(value);
  return n != null && n > 0 ? n : null;
}

function plainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function safeMetadata(value: unknown): Record<string, unknown> {
  const raw = plainObject(value);
  try {
    const capped = JSON.stringify(raw).slice(0, 2_000);
    const parsed = JSON.parse(capped) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function period(value: unknown): BudgetRecord["period"] {
  return value === "daily" || value === "monthly" ? value : "all-time";
}

function budgetStatus(value: unknown): BudgetRecord["status"] {
  return value === "paused" ? "paused" : "active";
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const raw = Number(req.nextUrl.searchParams.get("limit") || 200);
  const limit = Number.isFinite(raw) ? Math.max(1, Math.min(1000, raw)) : 200;
  const snapshot = await summarizeEconomy(user.id, limit);
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const action = typeof input.action === "string" ? input.action : "";

  try {
    if (action === "wallet") {
      const label = typeof input.label === "string" ? input.label : undefined;
      const wallet = await ensureWallet(user.id, label);
      if (!wallet) return NextResponse.json({ error: "Economy storage unavailable" }, { status: 503 });
      return NextResponse.json({ ok: true, wallet });
    }

    if (action === "budget") {
      const scope: BudgetScope = isBudgetScope(input.scope) ? input.scope : "global";
      const scopeId = typeof input.scopeId === "string" ? input.scopeId : "";
      const limitUsd = input.limitUsd == null || input.limitUsd === "" ? undefined : nonnegative(input.limitUsd);
      if (limitUsd === null) return NextResponse.json({ error: "Invalid limitUsd" }, { status: 400 });
      const budget = await setBudget({
        uid: user.id, scope, scopeId, limitUsd,
        period: period(input.period), status: budgetStatus(input.status),
      });
      if (!budget) return NextResponse.json({ error: "Economy storage unavailable" }, { status: 503 });
      return NextResponse.json({ ok: true, budget });
    }

    if (action === "delegation") {
      const fromAgentId = typeof input.fromAgentId === "string" ? input.fromAgentId : "";
      const toAgentId = typeof input.toAgentId === "string" ? input.toAgentId : "";
      const capUsd = nonnegative(input.capUsd);
      if (!fromAgentId || !toAgentId || capUsd === null) {
        return NextResponse.json({ error: "fromAgentId, toAgentId and a valid capUsd are required" }, { status: 400 });
      }
      const budgetId = typeof input.budgetId === "string" ? input.budgetId : undefined;
      const expiresAt = typeof input.expiresAt === "string" && Number.isFinite(Date.parse(input.expiresAt))
        ? input.expiresAt
        : null;
      const delegation = await delegateBudget({
        uid: user.id, fromAgentId, toAgentId, capUsd, budgetId, expiresAt,
      });
      if (!delegation) return NextResponse.json({ error: "Economy storage unavailable" }, { status: 503 });
      return NextResponse.json({ ok: true, delegation });
    }

    if (action === "delegation-status") {
      const id = typeof input.id === "string" ? input.id : "";
      const status = input.status === "revoked" ? "revoked" : input.status === "active" ? "active" : null;
      if (!id || !status) return NextResponse.json({ error: "id and active/revoked status are required" }, { status: 400 });
      const delegation = await setDelegationStatus(user.id, id, status);
      if (!delegation) return NextResponse.json({ error: "Delegation not found" }, { status: 404 });
      return NextResponse.json({ ok: true, delegation });
    }

    if (action === "credit") {
      if (user.role !== "admin") {
        return NextResponse.json({ error: "Only admins can mint internal credits" }, { status: 403 });
      }
      const amountUsd = positive(input.amountUsd);
      const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : "";
      const kind = input.kind === "grant" || input.kind === "reinvest" ? input.kind : "credit";
      if (amountUsd === null || !reason) {
        return NextResponse.json({ error: "amountUsd and reason are required" }, { status: 400 });
      }
      const entry = await creditWallet({
        uid: user.id, amountUsd, reason, kind,
        metadata: { ...safeMetadata(input.metadata), source: "api", grantedBy: user.id },
      });
      if (!entry) return NextResponse.json({ error: "Economy storage unavailable" }, { status: 503 });
      return NextResponse.json({ ok: true, entry });
    }

    return NextResponse.json({ error: "Unknown economy action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message.slice(0, 300) : "Economy action failed",
    }, { status: 400 });
  }
}
