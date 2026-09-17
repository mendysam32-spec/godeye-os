-- GodEye persistence — D1 ready for projects/chats sync (future)
-- Run: npx wrangler d1 create godeye-db --local then apply
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  color TEXT,
  agent_ids TEXT, -- JSON array
  tasks_total INTEGER DEFAULT 0,
  tasks_done INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  title TEXT,
  mode TEXT,
  provider TEXT,
  model TEXT,
  messages TEXT, -- JSON
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS vault_meta (
  provider TEXT PRIMARY KEY,
  connected INTEGER DEFAULT 0,
  last_tested TEXT
  -- keys stay client-side encrypted; server only stores meta
);
