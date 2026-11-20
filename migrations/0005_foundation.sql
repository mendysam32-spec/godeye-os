-- 0005_foundation.sql
-- Foundation slice from MEDUSA_OS_Generational_Improvements.docx:
--   * structured, queryable memory records
--   * replayable execution runs + ordered events
--   * a per-call usage/cost ledger
--
-- `uid` is the AuthUser.id tenancy axis, matching chat sync. Mirrored by
-- FOUNDATION_SCHEMA in src/lib/d1.ts so deployed instances converge at runtime.
-- Apply with:
--   wrangler d1 migrations apply godeye-db --remote

CREATE TABLE IF NOT EXISTS memory_records (
  id                TEXT PRIMARY KEY,
  uid               TEXT NOT NULL,
  project_id        TEXT,
  kind              TEXT NOT NULL,
  content           TEXT NOT NULL,
  source_chat_id    TEXT,
  source_message_id TEXT,
  pinned            INTEGER NOT NULL DEFAULT 0,
  score             REAL NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_records_uid ON memory_records(uid, updated_at);
CREATE INDEX IF NOT EXISTS idx_memory_records_project ON memory_records(project_id, updated_at);

CREATE TABLE IF NOT EXISTS execution_runs (
  id             TEXT PRIMARY KEY,
  uid            TEXT NOT NULL,
  kind           TEXT NOT NULL,
  status         TEXT NOT NULL,
  prompt         TEXT NOT NULL DEFAULT '',
  input_snapshot TEXT,
  provider       TEXT,
  model          TEXT,
  mode           TEXT,
  chat_id        TEXT,
  started_at     TEXT NOT NULL,
  ended_at       TEXT,
  error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_execution_runs_uid ON execution_runs(uid, started_at);

CREATE TABLE IF NOT EXISTS execution_events (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL,
  uid        TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  type       TEXT NOT NULL,
  payload    TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_execution_events_run ON execution_events(run_id, seq);
CREATE INDEX IF NOT EXISTS idx_execution_events_uid ON execution_events(uid, created_at);

CREATE TABLE IF NOT EXISTS usage_events (
  id                TEXT PRIMARY KEY,
  uid               TEXT NOT NULL,
  run_id            TEXT,
  kind              TEXT NOT NULL,
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'USD',
  pricing_source    TEXT,
  latency_ms        INTEGER,
  created_at        TEXT NOT NULL,
  metadata          TEXT
);

CREATE INDEX IF NOT EXISTS idx_usage_events_uid ON usage_events(uid, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_run ON usage_events(run_id);
