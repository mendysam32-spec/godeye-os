-- 0009_canvas.sql
-- Implementation roadmap / Phase 1 item 5: spatial/canvas interface with
-- real-time CRDT sync. Nodes and edges are LWW-element-set registers with
-- tombstones, so concurrent edits from tabs/devices converge deterministically.
-- Mirrored by FOUNDATION_SCHEMA in src/lib/d1.ts.
-- Apply with:
--   wrangler d1 migrations apply godeye-db --remote

CREATE TABLE IF NOT EXISTS canvas_nodes (
  id         TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  board_id   TEXT NOT NULL DEFAULT 'main',
  kind       TEXT NOT NULL DEFAULT 'note',
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  x          REAL NOT NULL DEFAULT 0,
  y          REAL NOT NULL DEFAULT 0,
  color      TEXT NOT NULL DEFAULT '#22d3ee',
  branch     TEXT NOT NULL DEFAULT 'main',
  parent_id  TEXT,
  source     TEXT,
  device_id  TEXT NOT NULL DEFAULT 'unknown',
  lamport    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_canvas_nodes_board ON canvas_nodes(uid, board_id);
CREATE INDEX IF NOT EXISTS idx_canvas_nodes_branch ON canvas_nodes(uid, board_id, branch);

CREATE TABLE IF NOT EXISTS canvas_edges (
  id         TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  board_id   TEXT NOT NULL DEFAULT 'main',
  from_id    TEXT NOT NULL,
  to_id      TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  relation   TEXT NOT NULL DEFAULT 'related',
  device_id  TEXT NOT NULL DEFAULT 'unknown',
  lamport    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_canvas_edges_board ON canvas_edges(uid, board_id);
