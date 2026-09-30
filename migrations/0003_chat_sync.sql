-- GodEye chat sync (Phase 1)
--
-- Chats and messages are stored per user so a conversation started on a phone
-- is there on a desktop and vice versa. There is no organisation/team concept
-- anywhere in the codebase, so `uid` (from auth.ts AuthUser.id) is the only
-- tenancy axis that exists today.
--
-- Binary attachment payloads are intentionally NOT stored. R2 is not enabled
-- on this account and a base64 image is far past what belongs in a SQL row,
-- so the client strips binary parts on push and keeps the marker text. See
-- `src/lib/chat-sync.ts` for the stripping rules.
--
-- This file mirrors CHAT_SCHEMA in src/lib/d1.ts. Apply with:
--   wrangler d1 migrations apply godeye-db --remote

CREATE TABLE IF NOT EXISTS chat_threads (
  id         TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  mode       TEXT,
  provider   TEXT,
  model      TEXT,
  project_id TEXT,
  folder_id  TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- soft delete so a removal propagates to other devices instead of the
  -- thread reappearing from another device's stale local copy
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_uid ON chat_threads(uid, updated_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL,
  uid         TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  -- JSON arrays; kept as TEXT because D1/SQLite has no native array type
  parts       TEXT,
  attachments TEXT,
  media       TEXT,
  provider    TEXT,
  model       TEXT,
  mode        TEXT,
  ts          TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, seq);
CREATE INDEX IF NOT EXISTS idx_chat_messages_uid ON chat_messages(uid, ts);
