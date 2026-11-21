/**
 * Shared D1 access for anything that needs real database tables.
 *
 * `auth.ts` deliberately keeps its own private accessor because auth must work
 * even when the binding is missing. Everything else goes through here so there
 * is one place that knows how to reach the `medusa_db` binding.
 *
 * Two things matter for callers:
 *   - `getDb()` never throws. If there is no binding (plain `next dev` on a
 *     laptop that has never run wrangler) it returns `null` and the caller is
 *     expected to degrade to local behaviour rather than break the request.
 *   - `ensureChatSchema()` is idempotent and cheap, because D1 statements are
 *     billed per invocation and we do not want to run DDL on every request.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export interface D1Stmt {
  bind(...params: unknown[]): D1Stmt;
  run(): Promise<unknown>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

export interface D1Like {
  exec(sql: string): Promise<void>;
  prepare(sql: string): D1Stmt;
  batch<T = unknown>(stmts: D1Stmt[]): Promise<{ results?: T[] }[]>;
}

/* -------------------------------------------------------------------------- */
/* schema                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Applied on first touch of the chat sync routes. The numbered files in
 * `migrations/` are the source of truth for a fresh database; these mirror
 * them so an already-deployed instance converges without a manual migration
 * step. Keep the two in sync.
 *
 * Each DDL statement is a separate array entry on purpose: D1's `exec()` only
 * runs one statement per call and fails with `incomplete input` on anything
 * else, so the list is executed entry by entry.
 */
export const CHAT_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS chat_threads (
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
     deleted_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_chat_threads_uid ON chat_threads(uid, updated_at)`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
     id          TEXT PRIMARY KEY,
     thread_id   TEXT NOT NULL,
     uid         TEXT NOT NULL,
     seq         INTEGER NOT NULL,
     role        TEXT NOT NULL,
     content     TEXT NOT NULL DEFAULT '',
     parts       TEXT,
     attachments TEXT,
     media       TEXT,
     provider    TEXT,
     model       TEXT,
     mode        TEXT,
     ts          TEXT NOT NULL,
     updated_at  TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, seq)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_uid ON chat_messages(uid, ts)`,
];

/**
 * Video-generation jobs: the provider job handle is persisted so a run
 * survives tab closes, reloads and poll-budget timeouts — the status route
 * can reattach by row id at any time. Mirrors
 * `migrations/0004_generation_jobs.sql`; keep the two in sync.
 */
export const GENERATION_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS generation_jobs (
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
   )`,
  `CREATE INDEX IF NOT EXISTS idx_generation_jobs_uid ON generation_jobs(uid, created_at)`,
];

/**
 * Foundation slice: durable memory, replayable execution traces and a usage
 * ledger, plus the memory kernel (versions, graph links, local vectors).
 * Mirrors `migrations/0005_foundation.sql`, `0006_memory_kernel.sql`,
 * `0007_agent_runtime.sql`, `0008_skill_genome.sql`, `0009_canvas.sql`,
 * `0010_self_improvement.sql`, `0011_economic.sql`, `0012_runtime_router.sql`
 * and `0013_a2a_protocol.sql`; keep them in sync. The file fallback below
 * understands the simple INSERT/SELECT/DELETE statements these routes issue,
 * so the whole slice also works in plain `next dev`.
 */
export const FOUNDATION_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS memory_records (
     id                TEXT PRIMARY KEY,
     uid               TEXT NOT NULL,
     project_id        TEXT,
     kind              TEXT NOT NULL,
     content           TEXT NOT NULL,
     source_chat_id    TEXT,
     source_message_id TEXT,
     pinned            INTEGER NOT NULL DEFAULT 0,
     score             REAL NOT NULL DEFAULT 0,
     created_at        TEXT NOT NULL,
     updated_at        TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_memory_records_uid ON memory_records(uid, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_records_project ON memory_records(project_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS execution_runs (
     id             TEXT PRIMARY KEY,
     uid            TEXT NOT NULL,
     kind           TEXT NOT NULL,
     status         TEXT NOT NULL,
     prompt         TEXT NOT NULL DEFAULT '',
     input_snapshot TEXT,
     provider       TEXT,
     model          TEXT,
     mode           TEXT,
     chat_id        TEXT,
     started_at     TEXT NOT NULL,
     ended_at       TEXT,
     error          TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_execution_runs_uid ON execution_runs(uid, started_at)`,
  `CREATE TABLE IF NOT EXISTS execution_events (
     id         TEXT PRIMARY KEY,
     run_id     TEXT NOT NULL,
     uid        TEXT NOT NULL,
     seq        INTEGER NOT NULL,
     type       TEXT NOT NULL,
     payload    TEXT,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_execution_events_run ON execution_events(run_id, seq)`,
  `CREATE INDEX IF NOT EXISTS idx_execution_events_uid ON execution_events(uid, created_at)`,
  `CREATE TABLE IF NOT EXISTS usage_events (
     id                TEXT PRIMARY KEY,
     uid               TEXT NOT NULL,
     run_id            TEXT,
     kind              TEXT NOT NULL,
     provider          TEXT NOT NULL,
     model             TEXT NOT NULL,
     prompt_tokens     INTEGER NOT NULL DEFAULT 0,
     completion_tokens INTEGER NOT NULL DEFAULT 0,
     total_tokens      INTEGER NOT NULL DEFAULT 0,
     cost_usd          REAL NOT NULL DEFAULT 0,
     currency          TEXT NOT NULL DEFAULT 'USD',
     pricing_source    TEXT,
     latency_ms        INTEGER,
     created_at        TEXT NOT NULL,
     metadata          TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_usage_events_uid ON usage_events(uid, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_events_run ON usage_events(run_id)`,
  `CREATE TABLE IF NOT EXISTS memory_versions (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_memory_versions_memory ON memory_versions(memory_id, version)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_versions_uid ON memory_versions(uid, changed_at)`,
  `CREATE TABLE IF NOT EXISTS memory_links (
      id         TEXT PRIMARY KEY,
      uid        TEXT NOT NULL,
      from_id    TEXT NOT NULL,
      to_id      TEXT NOT NULL,
      relation   TEXT NOT NULL,
      weight     REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_memory_links_uid ON memory_links(uid)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_links_from ON memory_links(from_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_links_to ON memory_links(to_id)`,
  `CREATE TABLE IF NOT EXISTS memory_vectors (
      id         TEXT PRIMARY KEY,
      uid        TEXT NOT NULL,
      dims       INTEGER NOT NULL,
      vector     TEXT NOT NULL,
      model      TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_memory_vectors_uid ON memory_vectors(uid)`,
  `CREATE TABLE IF NOT EXISTS memory_branches (
      id         TEXT PRIMARY KEY,
      uid        TEXT NOT NULL,
      name       TEXT NOT NULL,
      project_id TEXT,
      source_id  TEXT,
      created_at TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_memory_branches_uid ON memory_branches(uid, created_at)`,
  `CREATE TABLE IF NOT EXISTS memory_branch_items (
      id         TEXT PRIMARY KEY,
      uid        TEXT NOT NULL,
      branch_id  TEXT NOT NULL,
      memory_id  TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_memory_branch_items_branch ON memory_branch_items(branch_id)`,
  `CREATE TABLE IF NOT EXISTS agent_tasks (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_tasks_run ON agent_tasks(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_tasks_uid ON agent_tasks(uid, created_at)`,
  `CREATE TABLE IF NOT EXISTS agent_messages (
      id         TEXT PRIMARY KEY,
      uid        TEXT NOT NULL,
      run_id     TEXT NOT NULL,
      seq        INTEGER NOT NULL,
      type       TEXT NOT NULL,
      from_id    TEXT NOT NULL,
      to_id      TEXT NOT NULL,
      payload    TEXT,
      created_at TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_messages_run ON agent_messages(run_id, seq)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_messages_uid ON agent_messages(uid, created_at)`,
  `CREATE TABLE IF NOT EXISTS agent_workspace (
      id         TEXT PRIMARY KEY,
      uid        TEXT NOT NULL,
      run_id     TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      revision   INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_agent_workspace_run ON agent_workspace(run_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_workspace_uid ON agent_workspace(uid, updated_at)`,
  `CREATE TABLE IF NOT EXISTS skill_genome (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_skill_genome_uid ON skill_genome(uid, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_skill_genome_family ON skill_genome(family_id, version)`,
  `CREATE INDEX IF NOT EXISTS idx_skill_genome_status ON skill_genome(uid, status)`,
  `CREATE TABLE IF NOT EXISTS skill_outcomes (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_skill_outcomes_skill ON skill_outcomes(skill_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_skill_outcomes_uid ON skill_outcomes(uid, created_at)`,
  `CREATE TABLE IF NOT EXISTS canvas_nodes (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_canvas_nodes_board ON canvas_nodes(uid, board_id)`,
  `CREATE INDEX IF NOT EXISTS idx_canvas_nodes_branch ON canvas_nodes(uid, board_id, branch)`,
  `CREATE TABLE IF NOT EXISTS canvas_edges (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_canvas_edges_board ON canvas_edges(uid, board_id)`,
  `CREATE TABLE IF NOT EXISTS improvement_postmortems (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_improvement_postmortems_uid ON improvement_postmortems(uid, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_improvement_postmortems_run ON improvement_postmortems(run_id)`,
  `CREATE TABLE IF NOT EXISTS improvement_patterns (
      id             TEXT PRIMARY KEY,
      uid            TEXT NOT NULL,
      key            TEXT NOT NULL,
      title          TEXT NOT NULL,
      description    TEXT NOT NULL DEFAULT '',
      task_class     TEXT NOT NULL,
      pain           TEXT NOT NULL,
      occurrences    INTEGER NOT NULL DEFAULT 1,
      run_ids        TEXT NOT NULL DEFAULT '[]',
      avg_cost_usd   REAL NOT NULL DEFAULT 0,
      avg_latency_ms REAL NOT NULL DEFAULT 0,
      status         TEXT NOT NULL DEFAULT 'open',
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_improvement_patterns_uid ON improvement_patterns(uid, updated_at)`,
  `CREATE TABLE IF NOT EXISTS improvement_proposals (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_improvement_proposals_uid ON improvement_proposals(uid, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_improvement_proposals_status ON improvement_proposals(uid, status)`,
  `CREATE TABLE IF NOT EXISTS model_preferences (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_model_preferences_uid ON model_preferences(uid, task_class, created_at)`,
  `CREATE TABLE IF NOT EXISTS improvement_config (
      id          TEXT PRIMARY KEY,
      uid         TEXT NOT NULL,
      key         TEXT NOT NULL,
      value       TEXT NOT NULL DEFAULT '{}',
      proposal_id TEXT,
      updated_at  TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_improvement_config_uid ON improvement_config(uid, updated_at)`,
  `CREATE TABLE IF NOT EXISTS wallet_accounts (
      id                TEXT PRIMARY KEY,
      uid               TEXT NOT NULL,
      key               TEXT NOT NULL,
      label             TEXT NOT NULL DEFAULT 'MEDUSA wallet',
      currency          TEXT NOT NULL DEFAULT 'USD_CREDIT',
      balance_micro_usd INTEGER NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'active',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_accounts_uid ON wallet_accounts(uid, updated_at)`,
  `CREATE TABLE IF NOT EXISTS wallet_ledger (
      id                       TEXT PRIMARY KEY,
      uid                      TEXT NOT NULL,
      wallet_id                TEXT NOT NULL,
      run_id                   TEXT,
      kind                     TEXT NOT NULL,
      amount_micro_usd         INTEGER NOT NULL DEFAULT 0,
      balance_after_micro_usd  INTEGER NOT NULL DEFAULT 0,
      reason                   TEXT NOT NULL DEFAULT '',
      source_usage_id          TEXT,
      agent_id                 TEXT,
      metadata                 TEXT NOT NULL DEFAULT '{}',
      created_at               TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_ledger_uid ON wallet_ledger(uid, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet ON wallet_ledger(wallet_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_wallet_ledger_usage ON wallet_ledger(source_usage_id)`,
  `CREATE TABLE IF NOT EXISTS budgets (
      id                TEXT PRIMARY KEY,
      uid               TEXT NOT NULL,
      wallet_id         TEXT NOT NULL,
      scope             TEXT NOT NULL DEFAULT 'global',
      scope_id          TEXT NOT NULL DEFAULT '',
      limit_micro_usd   INTEGER NOT NULL DEFAULT 0,
      spent_micro_usd   INTEGER NOT NULL DEFAULT 0,
      period            TEXT NOT NULL DEFAULT 'all-time',
      status            TEXT NOT NULL DEFAULT 'active',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_budgets_uid ON budgets(uid, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_budgets_scope ON budgets(uid, scope, scope_id)`,
  `CREATE TABLE IF NOT EXISTS budget_delegations (
      id                TEXT PRIMARY KEY,
      uid               TEXT NOT NULL,
      from_agent_id     TEXT NOT NULL,
      to_agent_id       TEXT NOT NULL,
      budget_id         TEXT NOT NULL,
      cap_micro_usd     INTEGER NOT NULL DEFAULT 0,
      spent_micro_usd   INTEGER NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'active',
      expires_at        TEXT,
      created_at        TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_budget_delegations_uid ON budget_delegations(uid, created_at)`,
  // --- 0012_runtime_router.sql -------------------------------------------
  `CREATE TABLE IF NOT EXISTS runtime_provider_config (
     id                TEXT PRIMARY KEY,
     uid               TEXT NOT NULL,
     provider          TEXT NOT NULL,
     provider_kind     TEXT NOT NULL DEFAULT 'openai-compatible',
     auth_mode         TEXT NOT NULL DEFAULT 'api-key',
     enabled           INTEGER NOT NULL DEFAULT 1,
     priority          INTEGER NOT NULL DEFAULT 0,
     endpoint_policy   TEXT NOT NULL DEFAULT 'catalog',
     health_status     TEXT NOT NULL DEFAULT 'unknown',
     health_checked_at TEXT,
     metadata          TEXT NOT NULL DEFAULT '{}',
     created_at        TEXT NOT NULL,
     updated_at        TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_runtime_provider_config_uid ON runtime_provider_config(uid, updated_at)`,
  `CREATE TABLE IF NOT EXISTS runtime_model_policy (
     id                    TEXT PRIMARY KEY,
     uid                   TEXT NOT NULL,
     task_class            TEXT NOT NULL,
     provider              TEXT NOT NULL,
     model                 TEXT NOT NULL,
     enabled               INTEGER NOT NULL DEFAULT 1,
     priority              INTEGER NOT NULL DEFAULT 0,
     required_capabilities TEXT NOT NULL DEFAULT '[]',
     fallback_json         TEXT NOT NULL DEFAULT '[]',
     max_attempts          INTEGER NOT NULL DEFAULT 3,
     local_only            INTEGER NOT NULL DEFAULT 0,
     metadata              TEXT NOT NULL DEFAULT '{}',
     created_at            TEXT NOT NULL,
     updated_at            TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_runtime_model_policy_uid ON runtime_model_policy(uid, updated_at)`,
  `CREATE TABLE IF NOT EXISTS runtime_health_checks (
     id                  TEXT PRIMARY KEY,
     uid                 TEXT NOT NULL,
     provider            TEXT NOT NULL,
     model               TEXT NOT NULL DEFAULT '',
     endpoint_fingerprint TEXT NOT NULL DEFAULT '',
     ok                  INTEGER NOT NULL DEFAULT 0,
     status_code         INTEGER,
     latency_ms          INTEGER,
     error               TEXT,
     checked_at          TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_runtime_health_checks_uid ON runtime_health_checks(uid, checked_at)`,
  // --- 0013_a2a_protocol.sql -----------------------------------------------
  `CREATE TABLE IF NOT EXISTS a2a_agents (
      id                TEXT PRIMARY KEY,
      uid               TEXT NOT NULL,
      agent_id          TEXT NOT NULL,
      did               TEXT NOT NULL,
      display_name      TEXT NOT NULL DEFAULT '',
      role              TEXT NOT NULL DEFAULT '',
      provider          TEXT NOT NULL DEFAULT '',
      model             TEXT NOT NULL DEFAULT '',
      capabilities      TEXT NOT NULL DEFAULT '[]',
      public_key        TEXT NOT NULL DEFAULT '{}',
      key_id            TEXT NOT NULL DEFAULT '',
      status            TEXT NOT NULL DEFAULT 'active',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_a2a_agents_uid ON a2a_agents(uid, updated_at)`,
  `CREATE TABLE IF NOT EXISTS a2a_peers (
      id                TEXT PRIMARY KEY,
      uid               TEXT NOT NULL,
      did               TEXT NOT NULL,
      display_name      TEXT NOT NULL DEFAULT '',
      endpoint          TEXT NOT NULL DEFAULT '',
      public_key        TEXT NOT NULL DEFAULT '{}',
      key_id            TEXT NOT NULL DEFAULT '',
      capabilities      TEXT NOT NULL DEFAULT '[]',
      trust_mode        TEXT NOT NULL DEFAULT 'pin',
      status            TEXT NOT NULL DEFAULT 'active',
      last_seen_at      TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_a2a_peers_uid ON a2a_peers(uid, updated_at)`,
  `CREATE TABLE IF NOT EXISTS a2a_tasks (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_a2a_tasks_uid ON a2a_tasks(uid, updated_at)`,
  `CREATE TABLE IF NOT EXISTS a2a_receipts (
      id           TEXT PRIMARY KEY,
      uid          TEXT NOT NULL,
      task_id      TEXT NOT NULL,
      message_id   TEXT NOT NULL,
      from_did     TEXT NOT NULL,
      status       TEXT NOT NULL,
      detail       TEXT NOT NULL DEFAULT '',
      result_hash  TEXT NOT NULL DEFAULT '',
      signature    TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_a2a_receipts_uid ON a2a_receipts(uid, created_at)`,
  `CREATE TABLE IF NOT EXISTS a2a_messages (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_a2a_messages_uid ON a2a_messages(uid, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_a2a_messages_mid ON a2a_messages(message_id)`,
];

/* -------------------------------------------------------------------------- */
/* accessor                                                                    */
/* -------------------------------------------------------------------------- */

let dbPromise: Promise<D1Like | null> | null = null;
/** Resolve the D1 binding, or `null` when this runtime has none. */
export function getDb(): Promise<D1Like | null> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const ctx = await getCloudflareContext({ async: true });
      const db = (ctx.env as { medusa_db?: D1Like }).medusa_db;
      return db ?? null;
    } catch {
      return null;
    }
  })();
  return dbPromise;
}

/** Test seam: force a specific handle (or `null`) and drop the memo. */
export function __setDbForTests(db: D1Like | null): void {
  dbPromise = Promise.resolve(db);
}

let schemaPromise: Promise<void> | null = null;

/** Run the chat DDL once per isolate. Safe to call on every request. */
export function ensureChatSchema(db: D1Like): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      for (const stmt of CHAT_SCHEMA) {
        await db.prepare(stmt).run();
      }
    })().catch((e) => {
      // A failed bootstrap must not poison every later request.
      schemaPromise = null;
      throw e;
    });
  }
  return schemaPromise;
}

let genSchemaPromise: Promise<void> | null = null;

/** Run the generation-jobs DDL once per isolate. Safe to call on every request. */
export function ensureGenerationSchema(db: D1Like): Promise<void> {
  if (!genSchemaPromise) {
    genSchemaPromise = (async () => {
      for (const stmt of GENERATION_SCHEMA) {
        await db.prepare(stmt).run();
      }
    })().catch((e) => {
      genSchemaPromise = null;
      throw e;
    });
  }
  return genSchemaPromise;
}

let foundationSchemaPromise: Promise<void> | null = null;

/** Run the foundation DDL once per isolate. Safe to call on every request. */
export function ensureFoundationSchema(db: D1Like): Promise<void> {
  if (!foundationSchemaPromise) {
    foundationSchemaPromise = (async () => {
      for (const stmt of FOUNDATION_SCHEMA) {
        await db.prepare(stmt).run();
      }
    })().catch((e) => {
      foundationSchemaPromise = null;
      throw e;
    });
  }
  return foundationSchemaPromise;
}

/* -------------------------------------------------------------------------- */
/* dev fallback                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `wrangler.jsonc` ships the real D1 binding, but `next dev` on a machine
 * without a Cloudflare context has nowhere to put SQL. Rather than making
 * every sync call site branch on "am I in dev", we back the chat tables with
 * a JSON file under `.data/` that speaks the same four statements the routes
 * actually use. Dev-only: never selected in production.
 */
export function isFileFallback(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function getChatDb(): Promise<D1Like | null> {
  const real = await getDb();
  if (real) return real;
  if (!isFileFallback()) return null;
  return fileChatDb();
}

const FILES = new Map<string, string>();

async function loadTable(table: string): Promise<Record<string, unknown>[]> {
  if (FILES.has(table)) return JSON.parse(FILES.get(table)!) as Record<string, unknown>[];
  try {
    const p = path.join(process.cwd(), ".data", `chat-${table}.json`);
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    FILES.set(table, JSON.stringify(parsed));
    return parsed;
  } catch {
    FILES.set(table, "[]");
    return [];
  }
}

async function saveTable(table: string, rows: Record<string, unknown>[]): Promise<void> {
  FILES.set(table, JSON.stringify(rows));
  const dir = path.join(process.cwd(), ".data");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `chat-${table}.json`), JSON.stringify(rows), "utf8");
}

type Row = Record<string, unknown>;

function whereClause(rows: Row[], where: string, params: unknown[]): Row[] {
  const m = where.match(/^([a-z_]+)\s*=\s*\?(\d+)$/i);
  if (!m) return rows;
  const [, col, idx] = m;
  const want = params[Number(idx) - 1];
  return rows.filter((r) => String(r[col]) === String(want));
}

async function upsert(table: string, rows: Row[]): Promise<void> {
  const existing = await loadTable(table);
  for (const row of rows) {
    const i = existing.findIndex((r) => r.id === row.id);
    if (i >= 0) existing[i] = { ...existing[i], ...row };
    else existing.push(row);
  }
  await saveTable(table, existing);
}

function fileChatDb(): D1Like {
  const mk = (sql: string): D1Stmt => {
    let params: unknown[] = [];
    const stmt: D1Stmt = {
      bind(...p: unknown[]) {
        params = p;
        return stmt;
      },
      async run() {
        const up = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        if (up) {
          const [, table, colList, valList] = up;
          const cols = colList.split(",").map((s) => s.trim());
          const vals = valList.split(",").map((s) => s.trim());
          const row: Row = {};
          cols.forEach((c, i) => {
            const raw = vals[i];
            const ph = raw.match(/\?(\d+)/);
            row[c] = ph ? params[Number(ph[1]) - 1] : raw === "NULL" ? null : raw.replace(/^'|'$/g, "");
          });
          await upsert(table, [row]);
          return;
        }
        const del = sql.match(/DELETE\s+FROM\s+(\w+)\s+WHERE\s+(.+)$/i);
        if (del) {
          const [, table, where] = del;
          const rows = await loadTable(table);
          await saveTable(table, rows.filter((r) => !whereClause([r], where, params).length));
          return;
        }
        return;
      },
      async first<T>() {
        const sel = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)\s+WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
        if (!sel) return null;
        const [, cols, table, where] = sel;
        const rows = await loadTable(table);
        const hit = whereClause(rows, where, params)[0];
        if (!hit) return null;
        if (cols.trim() === "*") return hit as T;
        const out: Row = {};
        for (const c of cols.split(",").map((s) => s.trim())) out[c] = hit[c];
        return out as T;
      },
      async all<T>() {
        const sel = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER|\s+LIMIT|$)/i);
        if (!sel) return { results: [] };
        const [, cols, table, where] = sel;
        let rows = await loadTable(table);
        if (where) rows = whereClause(rows, where, params);
        const order = sql.match(/ORDER\s+BY\s+(\w+)\s+(ASC|DESC)/i);
        if (order) {
          const dir = order[2].toUpperCase() === "DESC" ? -1 : 1;
          rows = [...rows].sort((a, b) => (String(a[order[1]]) > String(b[order[1]]) ? dir : -dir));
        }
        const limit = sql.match(/LIMIT\s+(\d+)/i);
        if (limit) rows = rows.slice(0, Number(limit[1]));
        if (cols.trim() === "*") return { results: rows as T[] };
        const wanted = cols.split(",").map((s) => s.trim());
        return { results: rows.map((r) => Object.fromEntries(wanted.map((c) => [c, r[c]]))) as T[] };
      },
    };
    return stmt;
  };
  return {
    prepare: (sql: string) => mk(sql),
    async exec(sql: string) {
      // DDL is a no-op for the file shim.
      void sql;
    },
    async batch<T>(stmts: D1Stmt[]) {
      const results = [];
      for (const s of stmts) {
        await s.run();
        results.push({} as { results?: T[] });
      }
      return results;
    },
  };
}
