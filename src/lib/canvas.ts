/**
 * Spatial canvas persistence and the CRDT rules that keep concurrent edits
 * from different tabs/devices convergent.
 *
 * Implementation roadmap / Phase 1 item 5. Nodes and edges are
 * LWW-element-set registers: every mutation carries (lamport, updatedAt,
 * deviceId), deletion is a tombstone, and both the server and each client
 * resolve conflicts with the same comparison. That gives last-writer-wins
 * convergence without requiring a WebSocket connection — a short poll is
 * enough, and the whole canvas still works offline.
 */

import { ensureFoundationSchema, getChatDb, type D1Like } from "./d1";
import { compareRevision, nextRevision } from "./canvas-crdt";
import {
  DEFAULT_CANVAS_BOARD,
  isCanvasNodeKind,
  isCanvasRelation,
  newId,
  type CanvasEdge,
  type CanvasNode,
  type CanvasSource,
  type CanvasState,
} from "./foundation";

export { canvasClock, compareRevision, mergeEdges, mergeNodes, nextRevision } from "./canvas-crdt";

const MAX_TITLE = 160;
const MAX_BODY = 8_000;
const MAX_LABEL = 120;
const MAX_NODES = 600;
const MAX_EDGES = 1_200;

interface NodeRow {
  id: string;
  uid: string;
  board_id: string;
  kind: string;
  title: string;
  body: string;
  x: number | string;
  y: number | string;
  color: string;
  branch: string;
  parent_id: string | null;
  source: string | null;
  device_id: string;
  lamport: number | string;
  created_at: string;
  updated_at: string;
  deleted: number | boolean;
}

interface EdgeRow {
  id: string;
  uid: string;
  board_id: string;
  from_id: string;
  to_id: string;
  label: string;
  relation: string;
  device_id: string;
  lamport: number | string;
  created_at: string;
  updated_at: string;
  deleted: number | boolean;
}

const NODE_UPSERT = `INSERT INTO canvas_nodes
  (id, uid, board_id, kind, title, body, x, y, color, branch, parent_id, source,
   device_id, lamport, created_at, updated_at, deleted)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
  ON CONFLICT(id) DO UPDATE SET
    kind = excluded.kind, title = excluded.title, body = excluded.body,
    x = excluded.x, y = excluded.y, color = excluded.color, branch = excluded.branch,
    parent_id = excluded.parent_id, source = excluded.source,
    device_id = excluded.device_id, lamport = excluded.lamport,
    updated_at = excluded.updated_at, deleted = excluded.deleted`;

const EDGE_UPSERT = `INSERT INTO canvas_edges
  (id, uid, board_id, from_id, to_id, label, relation, device_id, lamport,
   created_at, updated_at, deleted)
  VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
  ON CONFLICT(id) DO UPDATE SET
    from_id = excluded.from_id, to_id = excluded.to_id, label = excluded.label,
    relation = excluded.relation, device_id = excluded.device_id,
    lamport = excluded.lamport, updated_at = excluded.updated_at,
    deleted = excluded.deleted`;

async function canvasDb(): Promise<D1Like | null> {
  const db = await getChatDb();
  if (!db) return null;
  await ensureFoundationSchema(db);
  return db;
}

function clip(value: unknown, max: number): string {
  return String(value ?? "").slice(0, max);
}

function finite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(-100_000, Math.min(100_000, Math.round(n * 10) / 10)) : fallback;
}

function parseIntSafe(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function parseSource(value: unknown): CanvasSource | null {
  // D1 stores this as JSON text; incoming client ops still send an object.
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed) as unknown; } catch { return null; }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const s = parsed as Record<string, unknown>;
  const type = s.type;
  if (typeof type !== "string" || !["chat", "message", "memory", "skill", "agent", "genome"].includes(type)) return null;
  const id = clip(s.id, 120);
  return id ? { type: type as CanvasSource["type"], id } : null;
}

export function normalizeNode(value: Partial<CanvasNode> | null | undefined, uid: string, deviceId: string): CanvasNode | null {
  if (!value || typeof value !== "object") return null;
  const id = clip(value.id, 120) || newId("node");
  const now = new Date().toISOString();
  const revision = value.updatedAt ? value : nextRevision(undefined, deviceId);
  const lamport = parseIntSafe(revision.lamport);
  const updatedAt = typeof revision.updatedAt === "string" && revision.updatedAt ? clip(revision.updatedAt, 40) : now;
  return {
    id,
    uid,
    boardId: clip(value.boardId, 80) || DEFAULT_CANVAS_BOARD,
    kind: isCanvasNodeKind(value.kind) ? value.kind : "note",
    title: clip(value.title, MAX_TITLE) || "Untitled",
    body: clip(value.body, MAX_BODY),
    x: finite(value.x),
    y: finite(value.y),
    color: /^#[0-9a-f]{6}$/i.test(value.color ?? "") ? String(value.color) : "#22d3ee",
    branch: clip(value.branch, 80) || DEFAULT_CANVAS_BOARD,
    parentId: value.parentId ? clip(value.parentId, 120) : null,
    source: parseSource(value.source),
    deviceId: clip(revision.deviceId, 80) || deviceId,
    lamport,
    createdAt: typeof value.createdAt === "string" && value.createdAt ? clip(value.createdAt, 40) : now,
    updatedAt,
    deleted: value.deleted === true,
  };
}

export function normalizeEdge(value: Partial<CanvasEdge> | null | undefined, uid: string, deviceId: string): CanvasEdge | null {
  if (!value || typeof value !== "object") return null;
  const fromId = clip(value.fromId, 120);
  const toId = clip(value.toId, 120);
  if (!fromId || !toId || fromId === toId) return null;
  const now = new Date().toISOString();
  const lamport = parseIntSafe(value.lamport);
  return {
    id: clip(value.id, 120) || newId("edge"),
    uid,
    boardId: clip(value.boardId, 80) || DEFAULT_CANVAS_BOARD,
    fromId,
    toId,
    label: clip(value.label, MAX_LABEL),
    relation: isCanvasRelation(value.relation) ? value.relation : "related",
    deviceId: clip(value.deviceId, 80) || deviceId,
    lamport,
    createdAt: typeof value.createdAt === "string" && value.createdAt ? clip(value.createdAt, 40) : now,
    updatedAt: typeof value.updatedAt === "string" && value.updatedAt ? clip(value.updatedAt, 40) : now,
    deleted: value.deleted === true,
  };
}

function mapNode(r: NodeRow): CanvasNode {
  return {
    id: r.id,
    uid: r.uid,
    boardId: r.board_id || DEFAULT_CANVAS_BOARD,
    kind: isCanvasNodeKind(r.kind) ? r.kind : "note",
    title: r.title ?? "",
    body: r.body ?? "",
    x: Number(r.x) || 0,
    y: Number(r.y) || 0,
    color: /^#[0-9a-f]{6}$/i.test(r.color ?? "") ? r.color : "#22d3ee",
    branch: r.branch || DEFAULT_CANVAS_BOARD,
    parentId: r.parent_id ?? null,
    source: parseSource(r.source),
    deviceId: r.device_id || "unknown",
    lamport: parseIntSafe(r.lamport),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deleted: r.deleted === 1 || r.deleted === true,
  };
}

function mapEdge(r: EdgeRow): CanvasEdge {
  return {
    id: r.id,
    uid: r.uid,
    boardId: r.board_id || DEFAULT_CANVAS_BOARD,
    fromId: r.from_id,
    toId: r.to_id,
    label: r.label ?? "",
    relation: isCanvasRelation(r.relation) ? r.relation : "related",
    deviceId: r.device_id || "unknown",
    lamport: parseIntSafe(r.lamport),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deleted: r.deleted === 1 || r.deleted === true,
  };
}

/** Return every record (including tombstones) so peers cannot resurrect deletes. */
export async function listCanvas(uid: string, boardId = DEFAULT_CANVAS_BOARD): Promise<CanvasState> {
  const db = await canvasDb();
  if (!db) return { boardId, nodes: [], edges: [] };
  // The dev file shim supports a single equality predicate, so filter boardId here.
  const [nodesRes, edgesRes] = await Promise.all([
    db.prepare("SELECT * FROM canvas_nodes WHERE uid = ?1 LIMIT 2000").bind(uid).all<NodeRow>(),
    db.prepare("SELECT * FROM canvas_edges WHERE uid = ?1 LIMIT 4000").bind(uid).all<EdgeRow>(),
  ]);
  return {
    boardId,
    nodes: (nodesRes.results || []).map(mapNode).filter((n) => n.boardId === boardId).slice(0, MAX_NODES),
    edges: (edgesRes.results || []).map(mapEdge).filter((e) => e.boardId === boardId).slice(0, MAX_EDGES),
  };
}

/**
 * Apply incoming registers with the same comparison clients use. Stale edits
 * are ignored, so two devices editing the same node still converge.
 */
export async function applyCanvasOps(
  uid: string,
  ops: { nodes?: Partial<CanvasNode>[]; edges?: Partial<CanvasEdge>[] },
): Promise<CanvasState> {
  const db = await canvasDb();
  if (!db) return { boardId: DEFAULT_CANVAS_BOARD, nodes: [], edges: [] };
  const deviceId = "server";
  const [existing] = await Promise.all([
    (async () => {
      const [n, e] = await Promise.all([
        db.prepare("SELECT * FROM canvas_nodes WHERE uid = ?1 LIMIT 2000").bind(uid).all<NodeRow>(),
        db.prepare("SELECT * FROM canvas_edges WHERE uid = ?1 LIMIT 4000").bind(uid).all<EdgeRow>(),
      ]);
      return {
        nodes: new Map((n.results || []).map((r) => [r.id, mapNode(r)])),
        edges: new Map((e.results || []).map((r) => [r.id, mapEdge(r)])),
      };
    })(),
  ]);

  for (const raw of (ops.nodes ?? []).slice(0, 400)) {
    const node = normalizeNode(raw, uid, deviceId);
    if (!node) continue;
    const current = existing.nodes.get(node.id);
    if (current && compareRevision(current, node) > 0) continue;
    await db.prepare(NODE_UPSERT).bind(
      node.id, node.uid, node.boardId, node.kind, node.title, node.body,
      node.x, node.y, node.color, node.branch, node.parentId, node.source ? JSON.stringify(node.source) : null,
      node.deviceId, node.lamport, node.createdAt, node.updatedAt, node.deleted ? 1 : 0,
    ).run();
    existing.nodes.set(node.id, node);
  }

  for (const raw of (ops.edges ?? []).slice(0, 800)) {
    const edge = normalizeEdge(raw, uid, deviceId);
    if (!edge) continue;
    const current = existing.edges.get(edge.id);
    if (current && compareRevision(current, edge) > 0) continue;
    await db.prepare(EDGE_UPSERT).bind(
      edge.id, edge.uid, edge.boardId, edge.fromId, edge.toId, edge.label,
      edge.relation, edge.deviceId, edge.lamport, edge.createdAt, edge.updatedAt,
      edge.deleted ? 1 : 0,
    ).run();
    existing.edges.set(edge.id, edge);
  }

  const boardId = (ops.nodes ?? []).find((n) => typeof n?.boardId === "string")?.boardId as string | undefined
    ?? DEFAULT_CANVAS_BOARD;
  return {
    boardId,
    nodes: [...existing.nodes.values()].filter((n) => n.boardId === boardId).slice(0, MAX_NODES),
    edges: [...existing.edges.values()].filter((e) => e.boardId === boardId).slice(0, MAX_EDGES),
  };
}
