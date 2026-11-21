-- 0010_self_improvement.sql
-- Implementation roadmap / Phase 2 item 7: the self-improvement core loop.
-- Execute → Record → Analyze → Synthesize → Propose → Validate → Merge → Genome++.
-- Every row is user-scoped and derived from existing traces/usage/runtime data.
-- Proposals and adopted config are declarative only; no executable code is
-- stored or evaluated. Mirrored by FOUNDATION_SCHEMA in src/lib/d1.ts.
-- Apply with:
--   wrangler d1 migrations apply medusa-db --remote

CREATE TABLE IF NOT EXISTS improvement_postmortems (
  id          TEXT PRIMARY KEY,
  uid         TEXT NOT NULL,
  run_id      TEXT NOT NULL,
  kind        TEXT NOT NULL,
  status      TEXT NOT NULL,
  prompt      TEXT NOT NULL DEFAULT '',
  task_class  TEXT NOT NULL DEFAULT 'chat',
  summary     TEXT NOT NULL DEFAULT '',
  findings    TEXT NOT NULL DEFAULT '[]',
  metrics     TEXT NOT NULL DEFAULT '{}',
  signals     TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_improvement_postmortems_uid
  ON improvement_postmortems(uid, created_at);
CREATE INDEX IF NOT EXISTS idx_improvement_postmortems_run
  ON improvement_postmortems(run_id);

CREATE TABLE IF NOT EXISTS improvement_patterns (
  id            TEXT PRIMARY KEY,
  uid           TEXT NOT NULL,
  key           TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  task_class    TEXT NOT NULL,
  pain          TEXT NOT NULL,
  occurrences   INTEGER NOT NULL DEFAULT 1,
  run_ids       TEXT NOT NULL DEFAULT '[]',
  avg_cost_usd  REAL NOT NULL DEFAULT 0,
  avg_latency_ms REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_improvement_patterns_uid
  ON improvement_patterns(uid, updated_at);

CREATE TABLE IF NOT EXISTS improvement_proposals (
  id          TEXT PRIMARY KEY,
  uid         TEXT NOT NULL,
  type        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'proposed',
  title       TEXT NOT NULL,
  rationale   TEXT NOT NULL DEFAULT '',
  evidence    TEXT NOT NULL DEFAULT '{}',
  payload     TEXT NOT NULL DEFAULT '{}',
  validation  TEXT NOT NULL DEFAULT '{}',
  pattern_id  TEXT,
  skill_id    TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_improvement_proposals_uid
  ON improvement_proposals(uid, updated_at);
CREATE INDEX IF NOT EXISTS idx_improvement_proposals_status
  ON improvement_proposals(uid, status);

CREATE TABLE IF NOT EXISTS model_preferences (
  id          TEXT PRIMARY KEY,
  uid         TEXT NOT NULL,
  run_id      TEXT NOT NULL,
  task_class  TEXT NOT NULL,
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  outcome     TEXT NOT NULL,
  score       REAL NOT NULL DEFAULT 0,
  tokens      INTEGER NOT NULL DEFAULT 0,
  cost_usd    REAL NOT NULL DEFAULT 0,
  latency_ms  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_model_preferences_uid
  ON model_preferences(uid, task_class, created_at);

CREATE TABLE IF NOT EXISTS improvement_config (
  id          TEXT PRIMARY KEY,
  uid         TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL DEFAULT '{}',
  proposal_id TEXT,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_improvement_config_uid
  ON improvement_config(uid, updated_at);
