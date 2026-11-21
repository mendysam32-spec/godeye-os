-- Phase 3 #11: Federated memory & skill marketplace.
-- All payloads are declarative JSON. No executable code, private keys, or
-- endpoint authority is ever stored here. Every row is user-scoped.

CREATE TABLE IF NOT EXISTS fed_encryption_keys (
  id            TEXT PRIMARY KEY,
  uid           TEXT NOT NULL,
  did           TEXT NOT NULL,
  agent_id      TEXT NOT NULL DEFAULT '',
  key_id        TEXT NOT NULL DEFAULT '',
  public_key    TEXT NOT NULL DEFAULT '{}',
  trust_mode    TEXT NOT NULL DEFAULT 'pin',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fed_encryption_keys_uid ON fed_encryption_keys(uid, updated_at);

CREATE TABLE IF NOT EXISTS fed_memory_grants (
  id                 TEXT PRIMARY KEY,
  uid                TEXT NOT NULL,
  direction          TEXT NOT NULL DEFAULT 'issued',
  grant_id           TEXT NOT NULL,
  resource_kind      TEXT NOT NULL DEFAULT 'graph',
  resource_id        TEXT NOT NULL DEFAULT '',
  local_agent_id     TEXT NOT NULL DEFAULT '',
  peer_did           TEXT NOT NULL,
  peer_agent_id      TEXT NOT NULL DEFAULT '',
  capability         TEXT NOT NULL DEFAULT 'memory.query',
  scope_json         TEXT NOT NULL DEFAULT '{}',
  sealed_json        TEXT NOT NULL DEFAULT '{}',
  envelope_json      TEXT NOT NULL DEFAULT '',
  bundle_hash        TEXT NOT NULL DEFAULT '',
  message_id         TEXT NOT NULL DEFAULT '',
  expires_at         TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'active',
  imported_branch_id TEXT NOT NULL DEFAULT '',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fed_memory_grants_uid ON fed_memory_grants(uid, updated_at);
CREATE INDEX IF NOT EXISTS idx_fed_memory_grants_gid ON fed_memory_grants(grant_id);

CREATE TABLE IF NOT EXISTS fed_skill_packages (
  id            TEXT PRIMARY KEY,
  uid           TEXT NOT NULL,
  package_id    TEXT NOT NULL,
  slug          TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  version       TEXT NOT NULL DEFAULT '1.0.0',
  kind          TEXT NOT NULL DEFAULT 'prompt',
  publisher_did TEXT NOT NULL DEFAULT '',
  key_id        TEXT NOT NULL DEFAULT '',
  envelope_json TEXT NOT NULL DEFAULT '',
  manifest_hash TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'published',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fed_skill_packages_uid ON fed_skill_packages(uid, updated_at);
CREATE INDEX IF NOT EXISTS idx_fed_skill_packages_pid ON fed_skill_packages(package_id);

CREATE TABLE IF NOT EXISTS fed_skill_installs (
  id            TEXT PRIMARY KEY,
  uid           TEXT NOT NULL,
  package_id    TEXT NOT NULL,
  publisher_did TEXT NOT NULL DEFAULT '',
  manifest_hash TEXT NOT NULL DEFAULT '',
  verification  TEXT NOT NULL DEFAULT 'unverified',
  genome_id     TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'candidate',
  detail        TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fed_skill_installs_uid ON fed_skill_installs(uid, created_at);
