-- Phase 3 #10: open agent-to-agent protocol.
-- Durable peer identities, signed delegation tasks, receipts and replay cache.
-- All identifiers are user-scoped; no private keys or executable payloads are stored.

CREATE TABLE IF NOT EXISTS a2a_agents (
  id               TEXT PRIMARY KEY,
  uid              TEXT NOT NULL,
  agent_id         TEXT NOT NULL,
  did              TEXT NOT NULL,
  display_name     TEXT NOT NULL DEFAULT '',
  role             TEXT NOT NULL DEFAULT '',
  provider         TEXT NOT NULL DEFAULT '',
  model            TEXT NOT NULL DEFAULT '',
  capabilities     TEXT NOT NULL DEFAULT '[]',
  public_key       TEXT NOT NULL DEFAULT '{}',
  key_id           TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'active',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_a2a_agents_uid ON a2a_agents(uid, updated_at);

CREATE TABLE IF NOT EXISTS a2a_peers (
  id               TEXT PRIMARY KEY,
  uid              TEXT NOT NULL,
  did              TEXT NOT NULL,
  display_name     TEXT NOT NULL DEFAULT '',
  endpoint         TEXT NOT NULL DEFAULT '',
  public_key       TEXT NOT NULL DEFAULT '{}',
  key_id           TEXT NOT NULL DEFAULT '',
  capabilities     TEXT NOT NULL DEFAULT '[]',
  trust_mode       TEXT NOT NULL DEFAULT 'pin',
  status           TEXT NOT NULL DEFAULT 'active',
  last_seen_at     TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_a2a_peers_uid ON a2a_peers(uid, updated_at);

CREATE TABLE IF NOT EXISTS a2a_tasks (
  id                    TEXT PRIMARY KEY,
  uid                   TEXT NOT NULL,
  direction             TEXT NOT NULL,
  local_agent_id        TEXT NOT NULL,
  peer_did              TEXT NOT NULL,
  peer_agent_id         TEXT NOT NULL DEFAULT '',
  message_id            TEXT NOT NULL,
  parent_message_id     TEXT NOT NULL DEFAULT '',
  kind                  TEXT NOT NULL DEFAULT 'task.delegate',
  objective             TEXT NOT NULL,
  input_json            TEXT NOT NULL DEFAULT '{}',
  required_capabilities TEXT NOT NULL DEFAULT '[]',
  budget_micro_usd      INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'pending',
  receipt_status        TEXT NOT NULL DEFAULT '',
  receipt_message_id    TEXT NOT NULL DEFAULT '',
  result_json           TEXT NOT NULL DEFAULT '',
  error                 TEXT,
  run_id                TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_uid ON a2a_tasks(uid, updated_at);

CREATE TABLE IF NOT EXISTS a2a_receipts (
  id          TEXT PRIMARY KEY,
  uid         TEXT NOT NULL,
  task_id     TEXT NOT NULL,
  message_id  TEXT NOT NULL,
  from_did    TEXT NOT NULL,
  status      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  result_hash TEXT NOT NULL DEFAULT '',
  signature   TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_a2a_receipts_uid ON a2a_receipts(uid, created_at);

CREATE TABLE IF NOT EXISTS a2a_messages (
  id           TEXT PRIMARY KEY,
  uid          TEXT NOT NULL,
  message_id   TEXT NOT NULL,
  direction    TEXT NOT NULL,
  type         TEXT NOT NULL,
  from_did     TEXT NOT NULL,
  to_did       TEXT NOT NULL,
  task_id      TEXT NOT NULL DEFAULT '',
  payload_hash TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_uid ON a2a_messages(uid, created_at);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_mid ON a2a_messages(message_id);
