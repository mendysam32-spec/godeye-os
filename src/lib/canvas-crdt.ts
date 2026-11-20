/**
 * Client-safe CRDT rules for the spatial canvas.
 *
 * This module deliberately has no server imports so client components can use
 * the exact same conflict resolution as the API. Nodes and edges are
 * LWW-element-set registers: every mutation carries (lamport, updatedAt,
 * deviceId), deletion is a tombstone, and a deterministic total order makes
 * concurrent edits from separate tabs/devices converge.
 */

import type { CanvasEdge, CanvasNode, CanvasRevision, CanvasState } from "./foundation";

function parseIntSafe(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Total order for LWW conflicts. Larger wins; ties fall back to device id. */
export function compareRevision(a: CanvasRevision, b: CanvasRevision): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  const at = Date.parse(a.updatedAt) || 0;
  const bt = Date.parse(b.updatedAt) || 0;
  if (at !== bt) return at - bt;
  return a.deviceId.localeCompare(b.deviceId);
}

/** Produce the next local revision, always ahead of everything we have seen. */
export function nextRevision(current: CanvasRevision | undefined, deviceId: string): CanvasRevision {
  return { deviceId, lamport: parseIntSafe(current?.lamport) + 1, updatedAt: new Date().toISOString() };
}

export function mergeNodes(local: CanvasNode[], remote: CanvasNode[]): CanvasNode[] {
  const byId = new Map(local.map((n) => [n.id, n]));
  for (const node of remote) {
    const current = byId.get(node.id);
    if (!current || compareRevision(node, current) > 0) byId.set(node.id, node);
  }
  return [...byId.values()];
}

export function mergeEdges(local: CanvasEdge[], remote: CanvasEdge[]): CanvasEdge[] {
  const byId = new Map(local.map((e) => [e.id, e]));
  for (const edge of remote) {
    const current = byId.get(edge.id);
    if (!current || compareRevision(edge, current) > 0) byId.set(edge.id, edge);
  }
  return [...byId.values()];
}

/** Highest lamport across a canvas — used to seed the next local mutation. */
export function canvasClock(state: CanvasState): number {
  let clock = 0;
  for (const r of [...state.nodes, ...state.edges]) clock = Math.max(clock, parseIntSafe(r.lamport));
  return clock;
}
