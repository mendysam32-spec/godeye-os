import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getChatDb, ensureChatSchema, type D1Stmt } from "@/lib/d1";
import type { SyncMessage, SyncThread } from "@/lib/chat-sync";

export const maxDuration = 60;

/** Defensive caps so one client cannot blow up the row limit or the bill. */
const MAX_THREADS_PER_PUSH = 50;
const MAX_MESSAGES_PER_PUSH = 2_000;
const MAX_VALUE_CHARS = 400_000;

function s(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function jsonOrNull(v: unknown, max = MAX_VALUE_CHARS): string | null {
  if (v === null || v === undefined) return null;
  try {
    const str = JSON.stringify(v);
    if (!str) return null;
    // Trim rather than reject: a truncated array is still useful history, and
    // the client already applies its own size ceiling before pushing.
    return str.length > max ? str.slice(0, max) : str;
  } catch {
    return null;
  }
}
function row<T>(r: unknown): T | null {
  return r && typeof r === "object" ? (r as T) : null;
}
/** Corrupt JSON in a row must degrade to "no attachments", not a 500. */
function jsonParse<T>(v: unknown): T | undefined {
  if (v === null || v === undefined) return undefined;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* GET - pull                                                                  */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const db = await getChatDb();
  if (!db) {
    return NextResponse.json({ threads: [], messages: [], serverTime: new Date().toISOString(), degraded: "no-database" });
  }
  await ensureChatSchema(db);

  const since = s(req.nextUrl.searchParams.get("since") ?? "", 40);
  const threadCutoff = since || "1970-01-01T00:00:00.000Z";

  // Everything the user changed since the cursor, plus every thread still
  // alive. The second set is what keeps a *deleted* thread deleted: a tombstone
  // older than the cursor would otherwise be missed and the thread would
  // reappear from a stale local copy on some other device. Ordered DESC so the
  // LIMIT keeps the most recent 500 changes rather than the oldest — returning
  // every tombstone forever would grow without bound, and a fresh client
  // (empty cursor, cutoff at the epoch) still sees its whole history.
  const threadsRes = await db
    .prepare(
      `SELECT id, title, mode, provider, model, project_id, folder_id, created_at, updated_at, deleted_at
       FROM chat_threads
       WHERE uid = ?1 AND (updated_at > ?2 OR deleted_at IS NOT NULL)
       ORDER BY updated_at DESC
       LIMIT 500`,
    )
    .bind(user.id, threadCutoff)
    .all<Record<string, unknown>>();

  const threadRows = threadsRes.results;
  const ids = threadRows.map((r) => String(r.id));
  const live = ids.filter((_, i) => !threadRows[i].deleted_at);

  let messages: SyncMessage[] = [];
  if (live.length) {
    const placeholders = live.map((_, i) => `?${i + 2}`).join(",");
    const msgRes = await db
      .prepare(
        `SELECT id, thread_id, seq, role, content, parts, attachments, media, provider, model, mode, ts
         FROM chat_messages
         WHERE uid = ?1 AND thread_id IN (${placeholders})
         ORDER BY thread_id ASC, seq ASC`,
      )
      .bind(user.id, ...live)
      .all<Record<string, unknown>>();

    messages = msgRes.results.map((r) => ({
      id: String(r.id),
      threadId: String(r.thread_id),
      seq: Number(r.seq ?? 0),
      role: String(r.role) as SyncMessage["role"],
      content: String(r.content ?? ""),
      parts: jsonParse(r.parts),
      attachments: jsonParse(r.attachments),
      media: jsonParse(r.media),
      provider: (r.provider ?? undefined) as SyncMessage["provider"],
      model: (r.model ?? undefined) as string | undefined,
      mode: (r.mode ?? undefined) as SyncMessage["mode"],
      timestamp: String(r.ts ?? new Date().toISOString()),
    }));
  }

  const threads: SyncThread[] = threadRows.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    mode: (r.mode ?? undefined) as SyncThread["mode"],
    provider: (r.provider ?? undefined) as SyncThread["provider"],
    model: (r.model ?? undefined) as string | undefined,
    projectId: (r.project_id ?? null) as string | null,
    folderId: (r.folder_id ?? null) as string | null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
    deletedAt: (r.deleted_at ?? null) as string | null,
  }));

  return NextResponse.json({
    threads,
    messages,
    // highest updated_at we served, so the next call can resume from here
    serverTime: new Date().toISOString(),
  });
}

/* -------------------------------------------------------------------------- */
/* PUT - push                                                                  */
/* -------------------------------------------------------------------------- */

export async function PUT(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const db = await getChatDb();
  if (!db) return NextResponse.json({ ok: true, accepted: 0, degraded: "no-database" });
  await ensureChatSchema(db);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const rawThreads = Array.isArray(body.threads) ? body.threads.slice(0, MAX_THREADS_PER_PUSH) : [];
  const rawMessages = Array.isArray(body.messages) ? body.messages.slice(0, MAX_MESSAGES_PER_PUSH) : [];

  const threads = rawThreads.filter((t: unknown) => row<SyncThread>(t)?.id);
  const messages = rawMessages.filter((m: unknown) => row<SyncMessage & { threadId: string }>(m)?.id && row<SyncMessage>(m)?.threadId);

  const now = new Date().toISOString();
  const stmts: D1Stmt[] = [];

  /* ---- tenancy ------------------------------------------------------------
     `id` and `thread_id` both arrive from the client, and they are client-
     generated (`Date.now()` + random), so they are guessable and a crafted
     payload must not be able to touch another user's rows. Any id that already
     exists under a different uid is dropped outright rather than upserted —
     the conflict target is the bare id, so without this an `ON CONFLICT` update
     would overwrite a victim's thread or message in place.
  */
  const allIds = [
    ...new Set([
      ...(threads as SyncThread[]).map((t) => s(t.id, 64)),
      ...(messages as (SyncMessage & { threadId: string })[]).map((m) => s(m.threadId, 64)),
    ]),
  ].filter(Boolean);

  const foreign = new Set<string>();
  if (allIds.length) {
    const ph = allIds.map((_, i) => `?${i + 2}`).join(",");
    const ownedRes = await db
      .prepare(`SELECT id FROM chat_threads WHERE id IN (${ph}) AND uid <> ?1`)
      .bind(user.id, ...allIds)
      .all<{ id: string }>();
    for (const o of ownedRes.results) foreign.add(String(o.id));
  }

  const ownedThreads = (threads as SyncThread[]).filter((t) => !foreign.has(s(t.id, 64)));
  const ownedMessages = (messages as (SyncMessage & { threadId: string })[]).filter(
    (m) => !foreign.has(s(m.threadId, 64)),
  );
  // Report every dropped row, not just threads: the client keeps refused writes
  // queued on `accepted` alone, so an undercount looks like a successful sync.
  const rejectedIds = [
    ...(threads as SyncThread[])
      .filter((t) => foreign.has(s(t.id, 64)))
      .map((t) => s(t.id, 64)),
    ...new Set((messages as (SyncMessage & { threadId: string })[])
      .filter((m) => foreign.has(s(m.threadId, 64)))
      .map((m) => s(m.threadId, 64))),
  ];
  const rejected =
    (threads as SyncThread[]).length - ownedThreads.length +
    ((messages as (SyncMessage & { threadId: string })[]).length - ownedMessages.length);

  for (const t of ownedThreads) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO chat_threads
             (id, uid, title, mode, provider, model, project_id, folder_id, created_at, updated_at, deleted_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             mode = excluded.mode,
             provider = excluded.provider,
             model = excluded.model,
             project_id = excluded.project_id,
             folder_id = excluded.folder_id,
             updated_at = excluded.updated_at,
             deleted_at = excluded.deleted_at
           WHERE chat_threads.uid = excluded.uid`,
        )
        .bind(
          s(t.id, 64),
          user.id,
          s(t.title, 300),
          s(t.mode, 24) || null,
          s(t.provider, 48) || null,
          s(t.model, 120) || null,
          s(t.projectId, 64) || null,
          s(t.folderId, 64) || null,
          s(t.createdAt, 40) || now,
          s(t.updatedAt, 40) || now,
          s(t.deletedAt, 40) || null,
        ),
    );
  }

  for (const m of ownedMessages) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO chat_messages
             (id, thread_id, uid, seq, role, content, parts, attachments, media, provider, model, mode, ts, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
           ON CONFLICT(id) DO UPDATE SET
             content = excluded.content,
             parts = excluded.parts,
             attachments = excluded.attachments,
             media = excluded.media,
             updated_at = excluded.updated_at
           WHERE chat_messages.uid = excluded.uid`,
        )
        .bind(
          s(m.id, 64),
          s(m.threadId, 64),
          user.id,
          Number.isFinite(m.seq) ? m.seq : 0,
          s(m.role, 16) || "assistant",
          s(m.content, MAX_VALUE_CHARS),
          jsonOrNull(m.parts),
          jsonOrNull(m.attachments, 20_000),
          jsonOrNull(m.media, 100_000),
          s(m.provider, 48) || null,
          s(m.model, 120) || null,
          s(m.mode, 24) || null,
          s(m.timestamp, 40) || now,
          now,
        ),
    );
  }

  if (!stmts.length) {
    return NextResponse.json({ ok: true, accepted: 0, rejected, rejectedIds, confirmedIds: [] });
  }

  try {
    await db.batch(stmts);
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "sync write failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    accepted: ownedThreads.length + ownedMessages.length,
    rejected,
    rejectedIds,
    confirmedIds: ownedThreads.map((t) => t.id),
  });
}

/* -------------------------------------------------------------------------- */
/* DELETE - clear this user's synced chats (incognito purge / account reset)    */
/* -------------------------------------------------------------------------- */

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const db = await getChatDb();
  if (!db) return NextResponse.json({ ok: true, degraded: "no-database" });
  await ensureChatSchema(db);

  await db.prepare("DELETE FROM chat_messages WHERE uid = ?1").bind(user.id).run();
  await db.prepare("DELETE FROM chat_threads WHERE uid = ?1").bind(user.id).run();
  return NextResponse.json({ ok: true });
}
