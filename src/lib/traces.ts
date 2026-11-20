/**
 * Replayable execution traces. A run is one user turn (possibly spanning many
 * tool rounds); events are an ordered, bounded log that can be rendered as a
 * timeline. Payloads never contain API keys or full binary artifacts.
 */

import { ensureFoundationSchema, getChatDb, type D1Like } from "./d1";
import {
  MAX_TRACE_SNAPSHOT_CHARS,
  safeTracePayload,
  type ExecutionEvent,
  type ExecutionRun,
  type RunKind,
  type RunStatus,
} from "./foundation";

interface RunRow {
  id: string;
  uid: string;
  kind: string;
  status: string;
  prompt: string;
  input_snapshot: string | null;
  provider: string | null;
  model: string | null;
  mode: string | null;
  chat_id: string | null;
  started_at: string;
  ended_at: string | null;
  error: string | null;
}

interface EventRow {
  id: string;
  run_id: string;
  uid: string;
  seq: number | string;
  type: string;
  payload: string | null;
  created_at: string;
}

export interface StartRunInput {
  id: string;
  uid: string;
  kind?: RunKind;
  prompt: string;
  inputSnapshot?: unknown;
  provider?: string | null;
  model?: string | null;
  mode?: string | null;
  chatId?: string | null;
  parentRunId?: string | null;
  replayOf?: string | null;
  divergence?: Record<string, unknown> | null;
}

async function foundationDb(): Promise<D1Like | null> {
  const db = await getChatDb();
  if (!db) return null;
  await ensureFoundationSchema(db);
  return db;
}

function parseSnapshot(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function mapRun(r: RunRow): ExecutionRun {
  const snapshot = parseSnapshot(r.input_snapshot);
  const divergence = snapshot.divergence;
  return {
    id: r.id,
    uid: r.uid,
    kind: (r.kind as RunKind) || "chat",
    status: (r.status as RunStatus) || "running",
    prompt: r.prompt ?? "",
    inputSnapshot: r.input_snapshot ?? null,
    provider: r.provider ?? null,
    model: r.model ?? null,
    mode: r.mode ?? null,
    chatId: r.chat_id ?? null,
    parentRunId: typeof snapshot.parentRunId === "string" ? snapshot.parentRunId : null,
    replayOf: typeof snapshot.replayOf === "string" ? snapshot.replayOf : null,
    divergence: divergence && typeof divergence === "object" && !Array.isArray(divergence)
      ? divergence as Record<string, unknown>
      : null,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? null,
    error: r.error ?? null,
  };
}

function mapEvent(r: EventRow): ExecutionEvent {
  let payload: Record<string, unknown> = {};
  try {
    payload = (JSON.parse(r.payload || "{}") as Record<string, unknown>) || {};
  } catch {
    payload = { raw: String(r.payload ?? "").slice(0, 500) };
  }
  return {
    id: r.id,
    runId: r.run_id,
    uid: r.uid,
    seq: Number(r.seq) || 0,
    type: r.type,
    payload,
    createdAt: r.created_at,
  };
}

const RUN_UPSERT = `INSERT INTO execution_runs
  (id, uid, kind, status, prompt, input_snapshot, provider, model, mode, chat_id, started_at, ended_at, error)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
  ON CONFLICT(id) DO UPDATE SET
    status = excluded.status,
    ended_at = excluded.ended_at,
    error = excluded.error`;

/** Idempotent: the chat route calls this on every tool round with the same id. */
export async function startRun(input: StartRunInput): Promise<ExecutionRun> {
  const baseSnapshot = input.inputSnapshot && typeof input.inputSnapshot === "object" && !Array.isArray(input.inputSnapshot)
    ? input.inputSnapshot as Record<string, unknown>
    : {};
  const snapshot = safeTracePayload({
    ...baseSnapshot,
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    ...(input.replayOf ? { replayOf: input.replayOf } : {}),
    ...(input.divergence ? { divergence: input.divergence } : {}),
  }, MAX_TRACE_SNAPSHOT_CHARS);
  const run: ExecutionRun = {
    id: input.id,
    uid: input.uid,
    kind: input.kind ?? "chat",
    status: "running",
    prompt: String(input.prompt ?? "").slice(0, 8_000),
    inputSnapshot: input.inputSnapshot === undefined && !input.parentRunId && !input.replayOf && !input.divergence
      ? null
      : JSON.stringify(snapshot),
    provider: input.provider ?? null,
    model: input.model ?? null,
    mode: input.mode ?? null,
    chatId: input.chatId ?? null,
    parentRunId: input.parentRunId ?? null,
    replayOf: input.replayOf ?? null,
    divergence: input.divergence ?? null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    error: null,
  };
  const db = await foundationDb();
  if (!db) return run;
  const existing = await getRunRow(db, input.id, input.uid);
  if (existing) {
    // First round owns the snapshot; later rounds only reuse the run.
    return mapRun(existing);
  }
  await db
    .prepare(RUN_UPSERT)
    .bind(
      run.id, run.uid, run.kind, run.status, run.prompt, run.inputSnapshot,
      run.provider, run.model, run.mode, run.chatId, run.startedAt, run.endedAt, run.error,
    )
    .run();
  return run;
}

async function getRunRow(db: D1Like, id: string, uid: string): Promise<RunRow | null> {
  const { results } = await db.prepare("SELECT * FROM execution_runs WHERE id = ?1").bind(id).all<RunRow>();
  const row = results.find((r) => r.id === id && r.uid === uid);
  return row ?? null;
}

function runToBind(r: ExecutionRun): unknown[] {
  return [
    r.id, r.uid, r.kind, r.status, r.prompt, r.inputSnapshot ?? null,
    r.provider ?? null, r.model ?? null, r.mode ?? null, r.chatId ?? null,
    r.startedAt, r.endedAt ?? null, r.error ?? null,
  ];
}

export async function appendEvent(input: {
  uid: string;
  runId: string;
  type: string;
  payload?: unknown;
}): Promise<ExecutionEvent | null> {
  const db = await foundationDb();
  if (!db) return null;
  const runRow = await getRunRow(db, input.runId, input.uid);
  if (!runRow) return null;
  const { results } = await db
    .prepare("SELECT seq FROM execution_events WHERE run_id = ?1")
    .bind(input.runId)
    .all<{ seq: number | string }>();
  const seq = results.reduce((max, r) => Math.max(max, Number(r.seq) || 0), 0) + 1;
  const event: ExecutionEvent = {
    id: `${input.runId}:${seq}`,
    runId: input.runId,
    uid: input.uid,
    seq,
    type: input.type.slice(0, 80),
    payload: safeTracePayload(input.payload),
    createdAt: new Date().toISOString(),
  };
  await db
    .prepare("INSERT INTO execution_events (id, run_id, uid, seq, type, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
    .bind(event.id, event.runId, event.uid, event.seq, event.type, JSON.stringify(event.payload), event.createdAt)
    .run();
  return event;
}

export async function finishRun(
  uid: string,
  id: string,
  status: RunStatus,
  error?: string | null,
): Promise<ExecutionRun | null> {
  const db = await foundationDb();
  if (!db) return null;
  const row = await getRunRow(db, id, uid);
  if (!row) return null;
  const run = mapRun(row);
  run.status = status;
  run.endedAt = new Date().toISOString();
  run.error = error ? String(error).slice(0, 2_000) : null;
  await db.prepare(RUN_UPSERT).bind(...runToBind(run)).run();
  return run;
}

export async function listRuns(uid: string, limit = 50): Promise<ExecutionRun[]> {
  const db = await foundationDb();
  if (!db) return [];
  const { results } = await db
    .prepare("SELECT * FROM execution_runs WHERE uid = ?1 ORDER BY started_at DESC")
    .bind(uid)
    .all<RunRow>();
  return results.map(mapRun).slice(0, Math.max(1, Math.min(200, limit)));
}

export async function getRun(uid: string, id: string): Promise<{ run: ExecutionRun; events: ExecutionEvent[] } | null> {
  const db = await foundationDb();
  if (!db) return null;
  const row = await getRunRow(db, id, uid);
  if (!row) return null;
  const { results } = await db
    .prepare("SELECT * FROM execution_events WHERE run_id = ?1 ORDER BY seq ASC")
    .bind(id)
    .all<EventRow>();
  return {
    run: mapRun(row),
    events: results.map(mapEvent).sort((a, b) => a.seq - b.seq).slice(0, 500),
  };
}

/** Replay input reconstructed from the snapshot, with the prompt as fallback. */
export function replayInput(run: ExecutionRun): Record<string, unknown> {
  let snapshot: unknown = null;
  try {
    snapshot = run.inputSnapshot ? JSON.parse(run.inputSnapshot) : null;
  } catch {
    snapshot = null;
  }
  const base: Record<string, unknown> = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? { ...(snapshot as Record<string, unknown>) }
    : {};
  return {
    prompt: base.prompt ?? run.prompt,
    provider: base.provider ?? run.provider ?? null,
    model: base.model ?? run.model ?? null,
    mode: base.mode ?? run.mode ?? "chat",
    ...base,
    parentRunId: base.parentRunId ?? run.parentRunId ?? null,
    replayOf: base.replayOf ?? run.replayOf ?? null,
    divergence: base.divergence ?? run.divergence ?? null,
  };
}
