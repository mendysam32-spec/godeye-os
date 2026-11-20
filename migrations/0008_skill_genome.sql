-- 0008_skill_genome.sql
-- Phase 1 / item 3 of MEDUSA_OS_Generational_Improvements.docx:
-- a self-modifying, versioned skill/tool genome. Each row is one immutable
-- version; genetic operators create descendants instead of rewriting history.
-- Measured outcomes drive fitness and selection. Mirrored by FOUNDATION_SCHEMA
-- in src/lib/d1.ts.
-- Apply with:
--   wrangler d1 migrations apply godeye-db --remote

CREATE TABLE IF NOT EXISTS skill_genome (
  id           TEXT PRIMARY KEY,
  uid          TEXT NOT NULL,
  family_id    TEXT NOT NULL,
  slug         TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL DEFAULT 'prompt',
  body         TEXT NOT NULL,
  dna          TEXT NOT NULL DEFAULT '{}',
  tests        TEXT NOT NULL DEFAULT '[]',
  version      INTEGER NOT NULL DEFAULT 1,
  generation   INTEGER NOT NULL DEFAULT 0,
  parent_ids   TEXT NOT NULL DEFAULT '[]',
  operator     TEXT NOT NULL DEFAULT 'seed',
  status       TEXT NOT NULL DEFAULT 'draft',
  fitness      REAL NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_genome_uid ON skill_genome(uid, created_at);
CREATE INDEX IF NOT EXISTS idx_skill_genome_family ON skill_genome(family_id, version);
CREATE INDEX IF NOT EXISTS idx_skill_genome_status ON skill_genome(uid, status);

CREATE TABLE IF NOT EXISTS skill_outcomes (
  id                TEXT PRIMARY KEY,
  uid               TEXT NOT NULL,
  skill_id          TEXT NOT NULL,
  run_id            TEXT,
  passed            INTEGER NOT NULL DEFAULT 0,
  score             REAL NOT NULL DEFAULT 0,
  checks            TEXT NOT NULL DEFAULT '[]',
  latency_ms        INTEGER,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL NOT NULL DEFAULT 0,
  provider          TEXT,
  model             TEXT,
  error             TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_outcomes_skill ON skill_outcomes(skill_id, created_at);
CREATE INDEX IF NOT EXISTS idx_skill_outcomes_uid ON skill_outcomes(uid, created_at);
