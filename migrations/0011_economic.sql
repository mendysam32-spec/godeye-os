-- 0011_economic.sql
-- Implementation roadmap / Phase 2 item 8: economic layer.
-- Internal USD-equivalent credits only. No private keys, signatures, or
-- external payment credentials are stored here. The usage_events ledger from
-- 0005_foundation.sql remains the authoritative cost source; these tables add
-- wallet balances, budgets, agent delegations and a double-entry-style audit
-- trail. Mirrored by FOUNDATION_SCHEMA in src/lib/d1.ts.
-- Apply with:
--   wrangler d1 migrations apply medusa-db --remote

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id                TEXT PRIMARY KEY,
  uid               TEXT NOT NULL,
  key               TEXT NOT NULL,
  label             TEXT NOT NULL DEFAULT 'MEDUSA wallet',
  currency          TEXT NOT NULL DEFAULT 'USD_CREDIT',
  balance_micro_usd INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_accounts_uid ON wallet_accounts(uid, updated_at);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id                        TEXT PRIMARY KEY,
  uid                       TEXT NOT NULL,
  wallet_id                 TEXT NOT NULL,
  run_id                    TEXT,
  kind                      TEXT NOT NULL,
  amount_micro_usd          INTEGER NOT NULL DEFAULT 0,
  balance_after_micro_usd   INTEGER NOT NULL DEFAULT 0,
  reason                    TEXT NOT NULL DEFAULT '',
  source_usage_id           TEXT,
  agent_id                  TEXT,
  metadata                  TEXT NOT NULL DEFAULT '{}',
  created_at                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_uid ON wallet_ledger(uid, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet ON wallet_ledger(wallet_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_usage ON wallet_ledger(source_usage_id);

CREATE TABLE IF NOT EXISTS budgets (
  id                TEXT PRIMARY KEY,
  uid               TEXT NOT NULL,
  wallet_id         TEXT NOT NULL,
  scope             TEXT NOT NULL DEFAULT 'global',
  scope_id          TEXT NOT NULL DEFAULT '',
  limit_micro_usd   INTEGER NOT NULL DEFAULT 0,
  spent_micro_usd   INTEGER NOT NULL DEFAULT 0,
  period            TEXT NOT NULL DEFAULT 'all-time',
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budgets_uid ON budgets(uid, updated_at);
CREATE INDEX IF NOT EXISTS idx_budgets_scope ON budgets(uid, scope, scope_id);

CREATE TABLE IF NOT EXISTS budget_delegations (
  id                TEXT PRIMARY KEY,
  uid               TEXT NOT NULL,
  from_agent_id     TEXT NOT NULL,
  to_agent_id       TEXT NOT NULL,
  budget_id         TEXT NOT NULL,
  cap_micro_usd     INTEGER NOT NULL DEFAULT 0,
  spent_micro_usd   INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active',
  expires_at        TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budget_delegations_uid ON budget_delegations(uid, created_at);
