/**
 * Cross-device chat sync driver (Phase 1).
 *
 * Mounted once from `auth-gate.tsx`. Responsibilities:
 *   - coalesce local `chats` mutations into a batched PUT
 *   - pull remote changes on login, on tab focus, and on a slow timer
 *   - merge with last-write-wins per thread
 *
 * The dirty set is the important part. Streaming calls `updateLastMessage`
 * many times a second, so a naive push-per-mutation would hammer D1 hundreds
 * of times per reply. Instead every mutation only marks its thread dirty and
 * a trailing timer flushes the batch; the final flush carries the settled
 * text, so intermediate states are simply never sent.
 *
 * Incognito chats are filtered out of both directions at every exit point
 * rather than relying on the caller to remember.
 */

import { useMEDUSA, subscribeChats, type ChatSession } from "./store";
import { mergeThreads, threadToRow, messagesToRows, deletedThreadRow, type SyncThread, type SyncMessage } from "./chat-sync";

const FLUSH_DEBOUNCE_MS = 6_000;
const PULL_MIN_INTERVAL_MS = 20_000;
const POLL_INTERVAL_MS = 120_000;
const ENDPOINT = "/api/chat/sync";

const cursorKey = (uid: string) => `medusa:chatsync:cursor:${uid}`;
const dirtyKey = (uid: string) => `medusa:chatsync:dirty:${uid}`;
const tombstonesKey = (uid: string) => `medusa:chatsync:gone:${uid}`;
const syncedKey = (uid: string) => `medusa:chatsync:synced:${uid}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — the dirty set is a hint, losing it only delays sync */
  }
}

/* -------------------------------------------------------------------------- */

let started = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPull = 0;
let inFlight: Promise<void> | null = null;

/** thread id -> the updatedAt we last successfully pushed */
let dirty = new Map<string, string>();
/** thread id -> tombstone timestamp */
let gone = new Map<string, string>();
/** thread id -> the updatedAt the server is known to hold, so a restart does not re-push */
let synced = new Map<string, string>();
let uid = "";

function loadLocal(who: string): void {
  uid = who;
  dirty = new Map(Object.entries(readJson<Record<string, string>>(dirtyKey(who), {})));
  gone = new Map(Object.entries(readJson<Record<string, string>>(tombstonesKey(who), {})));
  synced = new Map(Object.entries(readJson<Record<string, string>>(syncedKey(who), {})));
}

function persistDirty(): void {
  writeJson(dirtyKey(uid), Object.fromEntries(dirty));
  writeJson(tombstonesKey(uid), Object.fromEntries(gone));
  writeJson(syncedKey(uid), Object.fromEntries(synced));
  useMEDUSA.getState().setChatSync({ pending: dirty.size + gone.size });
}

/**
 * Queue every local thread the server has not acknowledged yet.
 *
 * The observer only sees mutations that happen *after* it subscribes, so
 * without this a chat history that predates the sync client — or one restored
 * from a legacy workspace blob — would never be uploaded, and the user would
 * silently not get their history on other devices.
 */
function seedDirty(): void {
  const s = useMEDUSA.getState();
  if (!s.currentUser || s.incognito) return;
  for (const c of s.chats) {
    if (c.incognito || gone.has(c.id)) continue;
    if (synced.get(c.id) === c.updatedAt) continue;
    dirty.set(c.id, c.updatedAt);
  }
  // prune tombstones the server has already applied, or whose thread came back
  for (const id of [...gone.keys()]) {
    if (s.chats.some((c) => c.id === id)) gone.delete(id);
  }
  for (const id of [...synced.keys()]) {
    if (!s.chats.some((c) => c.id === id)) synced.delete(id);
  }
}

/* -------------------------------------------------------------------------- */
/* mark                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A thread vanished from the store and we never queued a tombstone for it.
 *
 * Only `dirty` is pruned: an entry there can never be flushed (there is no
 * thread left to read `updatedAt` from), so dropping it just keeps the pending
 * count honest. `gone` must be left alone — a tombstone is deliberately for a
 * thread that is no longer present, and pruning it here would silently undo any
 * deletion whenever an unrelated chat mutates before the flush lands, which
 * then resurrects the thread on every other device.
 */
function observeRemovals(present: Set<string>): void {
  for (const id of [...dirty.keys()]) if (!present.has(id)) dirty.delete(id);
}

function onChatsChanged(): void {
  const s = useMEDUSA.getState();
  // no user, or incognito is on: never touch the network
  if (!s.currentUser || s.incognito) return;

  const chats = s.chats.filter((c) => !c.incognito);
  const present = new Set(chats.map((c) => c.id));

  // A thread that just became incognito is still on the server. Toggling the
  // flag has to retract it, otherwise "incognito" only hides local history
  // while the transcript stays readable from any other device.
  for (const c of s.chats) {
    if (c.incognito && synced.has(c.id)) {
      const at = new Date().toISOString();
      synced.delete(c.id);
      dirty.delete(c.id);
      gone.set(c.id, at);
    }
  }

  // anything that used to be incognito and now is not, or vice versa
  observeRemovals(present);

  for (const c of chats) {
    if (dirty.get(c.id) === c.updatedAt) continue;
    dirty.set(c.id, c.updatedAt);
  }

  persistDirty();
  scheduleFlush();
}

function markDeleted(chatId: string): void {
  const s = useMEDUSA.getState();
  if (!s.currentUser || s.incognito) return;
  const at = new Date().toISOString();
  dirty.delete(chatId);
  synced.delete(chatId);
  gone.set(chatId, at);
  persistDirty();
  scheduleFlush(0);
}

export function noteChatDeleted(chatId: string): void {
  markDeleted(chatId);
}

/* -------------------------------------------------------------------------- */
/* push                                                                        */
/* -------------------------------------------------------------------------- */

function scheduleFlush(delay = FLUSH_DEBOUNCE_MS): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, delay);
}

async function flush(): Promise<void> {
  if (inFlight) return inFlight;
  const s = useMEDUSA.getState();
  if (!s.currentUser || s.incognito) return;
  if (!dirty.size && !gone.size) return;

  const chats = s.chats.filter((c) => !c.incognito);
  const byId = new Map(chats.map((c) => [c.id, c]));

  const threads: SyncThread[] = [];
  const messages: SyncMessage[] = [];
  /** id -> the updatedAt actually being sent, for the synced ledger below */
  const sent = new Map<string, string>();
  for (const [id, at] of gone) threads.push(deletedThreadRow(id, at));
  for (const [id, at] of dirty) {
    const c = byId.get(id);
    if (!c) continue;
    // a thread already marked for deletion must not also be pushed as live
    if (gone.has(id)) continue;
    if (c.updatedAt !== at) {
      // mutated again since we queued it; pick up the newer stamp
      dirty.set(id, c.updatedAt);
    }
    sent.set(id, c.updatedAt);
    threads.push(threadToRow(c));
    messages.push(...messagesToRows(c));
  }

  if (!threads.length) {
    dirty.clear();
    persistDirty();
    return;
  }

  // Do not let a concurrent push re-enter and interleave batches.
  useMEDUSA.getState().setChatSync({ status: "syncing" });

  inFlight = (async () => {
    try {
      const res = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threads, messages }),
      });
      if (!res.ok) throw new Error(`push failed (${res.status})`);
      const out = (await res.json()) as { confirmedIds?: string[]; rejectedIds?: string[]; degraded?: string };
      if (out.degraded) {
        useMEDUSA.getState().setChatSync({ status: "offline", error: "server unavailable" });
        return;
      }
      // The server will never accept these (they collide with another user's
      // id). Evict rather than retry, otherwise a refused thread stays queued
      // and re-pushes on every debounce for the life of the tab.
      for (const id of out.rejectedIds ?? []) {
        dirty.delete(id);
        gone.delete(id);
        synced.delete(id);
      }
      // Only clear ids the server confirmed. Anything else stays queued so a
      // partial failure cannot silently drop a conversation.
      const confirmed = new Set(out.confirmedIds ?? threads.map((t) => t.id));
      for (const t of threads) {
        if (t.deletedAt) {
          if (confirmed.has(t.id)) {
            gone.delete(t.id);
            synced.delete(t.id);
          }
        } else if (confirmed.has(t.id)) {
          dirty.delete(t.id);
          const at = sent.get(t.id);
          if (at) synced.set(t.id, at);
        }
      }
      persistDirty();
      useMEDUSA.getState().setChatSync({
        status: "synced",
        lastSyncedAt: new Date().toISOString(),
        error: undefined,
      });
    } catch (e) {
      useMEDUSA.getState().setChatSync({ status: navigator.onLine ? "error" : "offline", error: (e as Error)?.message });
    } finally {
      inFlight = null;
      if (dirty.size || gone.size) scheduleFlush();
    }
  })();
  return inFlight;
}

/* -------------------------------------------------------------------------- */
/* pull                                                                        */
/* -------------------------------------------------------------------------- */

export async function pullChats(force = false): Promise<void> {
  const s = useMEDUSA.getState();
  if (!s.currentUser || s.incognito) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const now = Date.now();
  if (!force && now - lastPull < PULL_MIN_INTERVAL_MS) return;
  lastPull = now;

  const who = s.currentUser.id;
  const since = readJson<{ cursor?: string }>(cursorKey(who), {}).cursor ?? "";
  if (s.chatSync.status !== "syncing") s.setChatSync({ status: "syncing" });

  try {
    const url = `${ENDPOINT}?since=${encodeURIComponent(since)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`pull failed (${res.status})`);
    const data = (await res.json()) as {
      threads: SyncThread[];
      messages: SyncMessage[];
      degraded?: string;
    };
    if (data.degraded) {
      s.setChatSync({ status: "offline", error: "server unavailable" });
      return;
    }

    const grouped = new Map<string, SyncMessage[]>();
    for (const m of data.messages) {
      const list = grouped.get(m.threadId);
      if (list) list.push(m);
      else grouped.set(m.threadId, [m]);
    }

    const current = useMEDUSA.getState();
    const result = mergeThreads(current.chats, data.threads, grouped, []);

    if (result.chats.length !== current.chats.length || result.overwritten.length) {
      current.applyRemoteChats(result.chats, result.deleted);
    }

    // The server has acknowledged these threads, so seeding on the next load
    // must not treat them as local-only edits and push them straight back.
    for (const row of data.threads) {
      if (!row.deletedAt) synced.set(row.id, row.updatedAt);
      else {
        synced.delete(row.id);
        dirty.delete(row.id);
      }
    }
    for (const id of [...dirty.keys()]) {
      const row = data.threads.find((t) => t.id === id);
      if (row && !row.deletedAt && dirty.get(id) === row.updatedAt) dirty.delete(id);
    }
    persistDirty();

    writeJson(cursorKey(who), { cursor: new Date().toISOString() });
    current.setChatSync({ status: "synced", lastSyncedAt: new Date().toISOString(), error: undefined });
  } catch (e) {
    useMEDUSA.getState().setChatSync({ status: navigator.onLine ? "error" : "offline", error: (e as Error)?.message });
  }
}

/* -------------------------------------------------------------------------- */
/* lifecycle                                                                   */
/* -------------------------------------------------------------------------- */

export function startChatSync(): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;

  const user = useMEDUSA.getState().currentUser;
  loadLocal(user?.id ?? "anon");
  seedDirty();

  const unsub = subscribeChats(onChatsChanged);

  // Named, not inline: removeEventListener only matches the same function
  // reference, so inline arrows here would survive teardown and stack up on
  // every remount, multiplying every pull.
  const onVisible = () => {
    if (document.visibilityState === "visible") void pullChats();
  };
  const onOnline = () => {
    useMEDUSA.getState().setChatSync({ status: "idle" });
    scheduleFlush(0);
    void pullChats(true);
  };
  const onOffline = () => useMEDUSA.getState().setChatSync({ status: "offline" });
  const onFocus = () => void pullChats();
  // Best-effort final push. `pagehide` is the reliable one on mobile Safari,
  // where `beforeunload` often never fires.
  const onPageHide = () => {
    if (dirty.size || gone.size) void flush();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisible);

  pollTimer = setInterval(() => void pullChats(), POLL_INTERVAL_MS);

  // prime: push anything the server has not acknowledged yet, then pull
  scheduleFlush(400);
  void pullChats(true);

  return () => {
    started = false;
    unsub();
    if (flushTimer) clearTimeout(flushTimer);
    if (pollTimer) clearInterval(pollTimer);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** Test/teardown seam. */
export function __resetChatSync(): void {
  dirty = new Map();
  gone = new Map();
  synced = new Map();
  started = false;
  if (flushTimer) clearTimeout(flushTimer);
  if (pollTimer) clearInterval(pollTimer);
}

/**
 * Switch sync bookkeeping to another user, then queue that user's local
 * threads. Called on login and logout so a fresh account still uploads the
 * history it already holds locally.
 */
export function adoptUser(who: string): void {
  loadLocal(who);
  seedDirty();
  persistDirty();
  if (useMEDUSA.getState().currentUser) scheduleFlush(0);
}

export type { ChatSession };
