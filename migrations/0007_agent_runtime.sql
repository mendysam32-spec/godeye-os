-- 0007_agent_runtime.sql
-- Phase 1 / item 2 of MEDUSA_OS_Generational_Improvements.docx:
-- an agent runtime with a scheduler, a structured inter-agent protocol, a
-- versioned shared workspace (optimistic CAS) and verifier audit records.
--
-- Runs themselves reuse execution_runs (kind = 'workforce') from 0005; this
-- migration only stores the runtime-specific state. Mirrored by
-- FOUNDATION_SCHEMA in src/lib/d1.ts.
-- Apply with:
--   wrangler d1 migrations apply godeye-db --remote

CREATE TABLE IF NOT EXISTS agent_tasks (
  id             TEXT PRIMARY KEY,
  uid            TEXT NOT NULL,
  run_id         TEXT NOT NULL,
  agent_id       TEXT NOT NULL,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL,
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  priority       INTEGER NOT NULL DEFAULT 0,
  depends_on     TEXT NOT NULL DEFAULT '[]',
  status         TEXT NOT NULL DEFAULT 'queued',
  quota_tokens   INTEGER,
  quota_ms       INTEGER,
  score          REAL,
  result_preview TEXT,
  error          TEXT,
  created_at     TEXT NOT NULL,
  started_at     TEXT,
  ended_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_run ON agent_tasks(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_uid ON agent_tasks(uid, created_at);

CREATE TABLE IF NOT EXISTS agent_messages (
  id         TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  run_id     TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  type       TEXT NOT NULL,
  from_id    TEXT NOT NULL,
  to_id      TEXT NOT NULL,
  payload    TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_run ON agent_messages(run_id, seq);
CREATE INDEX IF NOT EXISTS idx_agent_messages_uid ON agent_messages(uid, created_at);

-- `id` is "<runId>:<key>" so the dev JSON fallback (which merges by id) and D1
-- share one row per key. `revision` enables compare-and-swap writes.
CREATE TABLE IF NOT EXISTS agent_workspace (
  id         TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  run_id     TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  revision   INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_workspace_run ON agent_workspace(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_workspace_uid ON agent_workspace(uid, updated_at);
