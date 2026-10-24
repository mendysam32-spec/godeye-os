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
