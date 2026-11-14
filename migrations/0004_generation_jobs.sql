-- 0004_generation_jobs.sql
-- Persisted video-generation jobs: the provider job handle survives tab
-- closes, reloads and poll-budget timeouts so a run can be reattached by
-- row id at any time.
-- Mirrored by GENERATION_SCHEMA in src/lib/d1.ts (runtime convergence);
-- keep the two in sync.

CREATE TABLE IF NOT EXISTS generation_jobs (
  id         TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  provider   TEXT NOT NULL,
  model      TEXT NOT NULL,
  prompt     TEXT,
  job        TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  error      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_uid ON generation_jobs(uid, created_at);
