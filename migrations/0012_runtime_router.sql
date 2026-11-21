-- 0012_runtime_router.sql
-- Implementation roadmap / Phase 2 item 9: model-agnostic router with
-- local/remote support. Declarative, user-scoped runtime policy and health
-- metadata only. NO API keys, secrets, or raw endpoint URLs are stored here —
-- credentials and endpoints stay in the encrypted client vault.
-- Mirrored by FOUNDATION_SCHEMA in src/lib/d1.ts.
-- Apply with:
--   wrangler d1 migrations apply medusa-db --remote

CREATE TABLE IF NOT EXISTS runtime_provider_config (
  id                TEXT PRIMARY KEY,
  uid               TEXT NOT NULL,
  provider          TEXT NOT NULL,
  provider_kind     TEXT NOT NULL DEFAULT 'openai-compatible',
  auth_mode         TEXT NOT NULL DEFAULT 'api-key',
  enabled           INTEGER NOT NULL DEFAULT 1,
  priority          INTEGER NOT NULL DEFAULT 0,
  endpoint_policy   TEXT NOT NULL DEFAULT 'catalog',
  health_status     TEXT NOT NULL DEFAULT 'unknown',
  health_checked_at TEXT,
  metadata          TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_provider_config_uid ON runtime_provider_config(uid, updated_at);

CREATE TABLE IF NOT EXISTS runtime_model_policy (
  id                    TEXT PRIMARY KEY,
  uid                   TEXT NOT NULL,
  task_class            TEXT NOT NULL,
  provider              TEXT NOT NULL,
  model                 TEXT NOT NULL,
  enabled               INTEGER NOT NULL DEFAULT 1,
  priority              INTEGER NOT NULL DEFAULT 0,
  required_capabilities TEXT NOT NULL DEFAULT '[]',
  fallback_json         TEXT NOT NULL DEFAULT '[]',
  max_attempts          INTEGER NOT NULL DEFAULT 3,
  local_only            INTEGER NOT NULL DEFAULT 0,
  metadata              TEXT NOT NULL DEFAULT '{}',
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_model_policy_uid ON runtime_model_policy(uid, updated_at);

CREATE TABLE IF NOT EXISTS runtime_health_checks (
  id                  TEXT PRIMARY KEY,
  uid                 TEXT NOT NULL,
  provider            TEXT NOT NULL,
  model               TEXT NOT NULL DEFAULT '',
  endpoint_fingerprint TEXT NOT NULL DEFAULT '',
  ok                  INTEGER NOT NULL DEFAULT 0,
  status_code         INTEGER,
  latency_ms          INTEGER,
  error               TEXT,
  checked_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_health_checks_uid ON runtime_health_checks(uid, checked_at);
