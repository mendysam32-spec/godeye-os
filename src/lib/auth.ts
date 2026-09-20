import { NextRequest, NextResponse } from "next/server";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type AuthRole = "admin" | "user";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: AuthRole;
  enabled: boolean;
  failedAttempts: number;
  lockUntil?: string;
  createdAt: string;
  updatedAt: string;
  // 0 / missing = unlimited. Only enforced for non-admin accounts.
  tokenLimit?: number;
  tokensUsed?: number;
}

export interface AccessRequest {
  id: string;
  username: string;
  email: string;
  status: "pending" | "approved" | "denied";
  createdAt: string;
}

export interface AuthState {
  users: AuthUser[];
  sessions: Record<string, { uid: string; exp: number }>;
  requests: AccessRequest[];
}

export const OWNER_EMAIL = "mendysam32@gmail.com";
export const COOKIE_NAME = "godeye_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 200;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: AuthRole;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  tokenLimit: number;
  tokensUsed: number;
}

export function sanitizeUser(u: AuthUser): PublicUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName || u.username,
    role: u.role,
    enabled: u.enabled,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    tokenLimit: u.tokenLimit ?? 0,
    tokensUsed: u.tokensUsed ?? 0,
  };
}

/* ------------------------------ passwords ------------------------------ */

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key as Buffer)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const key = await scryptAsync(password, salt);
  const expected = Buffer.from(hash, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/* --------------------------------- store -------------------------------- */

interface Store {
  load(): Promise<AuthState | null>;
  save(s: AuthState): Promise<void>;
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface D1Stmt {
  bind(...params: unknown[]): D1Stmt;
  run(): Promise<unknown>;
  first(): Promise<unknown>;
}

interface D1Like {
  exec(sql: string): Promise<void>;
  prepare(sql: string): D1Stmt;
}

class D1Store implements Store {
  private ready: Promise<void>;
  constructor(private db: D1Like) {
    this.ready = db.exec("CREATE TABLE IF NOT EXISTS auth_state (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
  }
  async load(): Promise<AuthState | null> {
    await this.ready;
    const row = (await this.db.prepare("SELECT v FROM auth_state WHERE k = 'state'").first()) as { v?: string } | null;
    return row?.v ? JSON.parse(row.v) : null;
  }
  async save(s: AuthState): Promise<void> {
    await this.ready;
    await this.db
      .prepare("INSERT INTO auth_state (k, v) VALUES ('state', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1")
      .bind(JSON.stringify(s))
      .run();
  }
  async get(key: string): Promise<string | null> {
    await this.ready;
    const row = (await this.db.prepare("SELECT v FROM auth_state WHERE k = ?1").bind(key).first()) as { v?: string } | null;
    return row?.v ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    await this.ready;
    await this.db.prepare("INSERT INTO auth_state (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = ?2").bind(key, value).run();
  }
}

class FileStore implements Store {
  private mem: AuthState | null = null;
  private async path(): Promise<string> {
    const path = await import("node:path");
    return path.join(process.cwd(), ".data", "auth.json");
  }
  private async keyPath(key: string): Promise<string> {
    const path = await import("node:path");
    const safe = key.replace(/[^A-Za-z0-9_-]/g, "_");
    return path.join(process.cwd(), ".data", `${safe}.json`);
  }
  async load(): Promise<AuthState | null> {
    try {
      const fs = await import("node:fs/promises");
      const txt = await fs.readFile(await this.path(), "utf8");
      this.mem = JSON.parse(txt);
    } catch {
      /* keep previous mem (or null) */
    }
    return this.mem;
  }
  async save(s: AuthState): Promise<void> {
    try {
      const fs = await import("node:fs/promises");
      const p = await this.path();
      await fs.mkdir(await (await import("node:path")).dirname(p), { recursive: true });
      const tmp = p + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(s, null, 2), "utf8");
      await fs.rename(tmp, p);
      this.mem = s;
    } catch {
      this.mem = s;
    }
  }
  async get(key: string): Promise<string | null> {
    try {
      const fs = await import("node:fs/promises");
      return await fs.readFile(await this.keyPath(key), "utf8");
    } catch {
      return null;
    }
  }
  async put(key: string, value: string): Promise<void> {
    try {
      const fs = await import("node:fs/promises");
      const p = await this.keyPath(key);
      await fs.mkdir(await (await import("node:path")).dirname(p), { recursive: true });
      const tmp = p + ".tmp";
      await fs.writeFile(tmp, value, "utf8");
      await fs.rename(tmp, p);
    } catch {
      /* keep in memory */
    }
  }
}

class MemoryStore implements Store {
  private mem: AuthState | null = null;
  private kv: Record<string, string> = {};
  async load(): Promise<AuthState | null> {
    return this.mem;
  }
  async save(s: AuthState): Promise<void> {
    this.mem = s;
  }
  async get(key: string): Promise<string | null> {
    return this.kv[key] ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.kv[key] = value;
  }
}

let storePromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = (async () => {
      // Local development (next dev / next start on Node): use a JSON file.
      // D1 via getPlatformProxy is unreliable here because each route module
      // can end up with its own isolated miniflare instance.
      if (process.env.NODE_ENV !== "production") {
        try {
          if (typeof process !== "undefined" && process.versions && process.versions.node) {
            return new FileStore();
          }
        } catch {
          /* ignore */
        }
      }
      // Cloudflare Workers (OpenNext deploy) -> D1
      try {
        const ctx = await getCloudflareContext({ async: true });
        const db = (ctx.env as { godeye_db?: D1Like }).godeye_db;
        if (db) return new D1Store(db);
      } catch {
        /* not on Cloudflare */
      }
      // Fallback: JSON file (Node) or memory (edge)
      try {
        if (typeof process !== "undefined" && process.versions && process.versions.node) {
          return new FileStore();
        }
      } catch {
        /* ignore */
      }
      return new MemoryStore();
    })();
  }
  return storePromise;
}

export async function getState(): Promise<AuthState> {
  const store = await getStore();
  const raw = await store.load();
  if (!raw) return { users: [], sessions: {}, requests: [] };
  if (!Array.isArray(raw.users)) raw.users = [];
  if (!raw.sessions || typeof raw.sessions !== "object") raw.sessions = {};
  if (!Array.isArray(raw.requests)) raw.requests = [];
  return raw;
}

export async function saveState(state: AuthState): Promise<void> {
  const now = Date.now();
  for (const [token, s] of Object.entries(state.sessions)) {
    if (s.exp < now) delete state.sessions[token];
  }
  const tokens = Object.keys(state.sessions);
  if (tokens.length > MAX_SESSIONS) {
    for (const t of tokens.slice(0, tokens.length - MAX_SESSIONS)) delete state.sessions[t];
  }
  const store = await getStore();
  await store.save(state);
}

/* ------------------------------ workspace ------------------------------- */

// Per-user workspace blobs (settings/vault/agents/projects/chats/folders) are
// stored in the same KV table under "ws:<userId>" so the same account can pull
// them on any device. Workspace rows are kept separate from the AuthState row.
export async function getWorkspace(uid: string): Promise<Record<string, unknown> | null> {
  const store = await getStore();
  const raw = await store.get(`ws:${uid}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveWorkspace(uid: string, data: unknown): Promise<void> {
  const store = await getStore();
  await store.put(`ws:${uid}`, JSON.stringify(data));
}

/* --------------------------------- seed --------------------------------- */

export async function ensureSeed(): Promise<void> {
  const state = await getState();
  if (state.users.length > 0) return;
  state.users.push({
    id: randomBytes(8).toString("hex"),
    username: "venom",
    email: OWNER_EMAIL,
    displayName: "GodEye Owner",
    role: "admin",
    enabled: true,
    failedAttempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    passwordHash: await hashPassword("venom123"),
    tokenLimit: 0,
    tokensUsed: 0,
  });
  await saveState(state);
}

/* -------------------------------- sessions ------------------------------- */

export async function createSession(userId: string, state?: AuthState): Promise<string> {
  const token = randomBytes(24).toString("hex");
  const s = state ?? (await getState());
  s.sessions[token] = { uid: userId, exp: Date.now() + SESSION_TTL_MS };
  if (!state) await saveState(s);
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  const state = await getState();
  delete state.sessions[token];
  await saveState(state);
}

export interface AuthedRecord {
  state: AuthState;
  user: AuthUser;
}

// Validate the session cookie and return the full user record + state so the
// caller can enforce limits and record token usage. Mutates the session expiry
// (rolling) but does NOT save — the caller saves once it has updated usage.
export async function authedRecord(req: NextRequest): Promise<AuthedRecord | null> {
  await ensureSeed();
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const state = await getState();
  const session = state.sessions[token];
  if (!session || session.exp < Date.now()) return null;
  const user = state.users.find((u) => u.id === session.uid && u.enabled);
  if (!user) return null;
  session.exp = Date.now() + SESSION_TTL_MS;
  return { state, user };
}

export async function requireUser(req: NextRequest): Promise<PublicUser | null> {
  const rec = await authedRecord(req);
  if (!rec) return null;
  await saveState(rec.state);
  return sanitizeUser(rec.user);
}

export async function requireAdmin(req: NextRequest): Promise<PublicUser | null> {
  const user = await requireUser(req);
  if (!user || user.role !== "admin") return null;
  return user;
}

/* ------------------------------- responses ------------------------------ */

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export function lockAccount(user: AuthUser): void {
  user.failedAttempts += 1;
  if (user.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    user.lockUntil = new Date(Date.now() + LOCK_MS).toISOString();
  }
}