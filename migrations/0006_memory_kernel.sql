-- 0006_memory_kernel.sql
-- Phase 1 / item 1 of MEDUSA_OS_Generational_Improvements.docx:
-- upgrade durable memory into a memory kernel with
--   * Git-like version history (every content change is an immutable commit)
--   * a typed graph of relationships between memories
--   * local deterministic feature vectors for semantic ranking
--
-- Additive only: existing memory_records rows keep working. Mirrored by
-- FOUNDATION_SCHEMA in src/lib/d1.ts so deployed instances converge at runtime.
-- Apply with:
--   wrangler d1 migrations apply godeye-db --remote

CREATE TABLE IF NOT EXISTS memory_versions (
  id           TEXT PRIMARY KEY,
  memory_id    TEXT NOT NULL,
  uid          TEXT NOT NULL,
  version      INTEGER NOT NULL,
  content      TEXT NOT NULL,
  kind         TEXT NOT NULL,
  pinned       INTEGER NOT NULL DEFAULT 0,
  score        REAL NOT NULL DEFAULT 0,
  change_note  TEXT,
  changed_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_versions_memory ON memory_versions(memory_id, version);
CREATE INDEX IF NOT EXISTS idx_memory_versions_uid ON memory_versions(uid, changed_at);

CREATE TABLE IF NOT EXISTS memory_links (
  id         TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  from_id    TEXT NOT NULL,
  to_id      TEXT NOT NULL,
  relation   TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_links_uid ON memory_links(uid);
CREATE INDEX IF NOT EXISTS idx_memory_links_from ON memory_links(from_id);
CREATE INDEX IF NOT EXISTS idx_memory_links_to ON memory_links(to_id);

-- `id` is the owning memory_records.id, so one vector per memory and the dev
-- JSON fallback (which merges by id) behaves identically to D1.
CREATE TABLE IF NOT EXISTS memory_vectors (
  id         TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  dims       INTEGER NOT NULL,
  vector     TEXT NOT NULL,
  model      TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_vectors_uid ON memory_vectors(uid);

-- Memory inheritance: named, project-scoped forks and merges. Branch items are
-- references to memory_records, so a module can be shared without duplicating
-- its contents. Merging copies insights into the target with `derived_from`
-- provenance links so both sides keep their own history.
CREATE TABLE IF NOT EXISTS memory_branches (
  id         TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  name       TEXT NOT NULL,
  project_id TEXT,
  source_id  TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_branches_uid ON memory_branches(uid, created_at);

CREATE TABLE IF NOT EXISTS memory_branch_items (
  id         TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  branch_id  TEXT NOT NULL,
  memory_id  TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_branch_items_branch ON memory_branch_items(branch_id);
