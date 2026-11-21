/**
 * Memory kernel: durable structured memory with Git-like versioning, a typed
 * relationship graph and local semantic ranking. D1 is the source of truth;
 * in plain `next dev` the shared JSON file fallback from `d1.ts` is used
 * instead. All reads and writes are scoped by `uid`.
 */

import { ensureFoundationSchema, getChatDb, type D1Like } from "./d1";
import {
  MAX_MEMORY_CHARS,
  MAX_MEMORY_ITEMS,
  isMemoryKind,
  isMemoryRelation,
  newId,
  sanitizeMemoryText,
  type MemoryContext,
  type MemoryGraph,
  type MemoryKind,
  type MemoryLink,
  type MemoryBranch,
  type MemoryRecord,
  type MemoryRelation,
  type MemoryVersion,
} from "./foundation";
import { VECTOR_DIMS, VECTOR_MODEL, cosineSimilarity, embedText, parseVector } from "./vector";

interface MemoryRow {
  id: string;
  uid: string;
  project_id: string | null;
  kind: string;
  content: string;
  source_chat_id: string | null;
  source_message_id: string | null;
  pinned: number | boolean;
  score: number | string;
  created_at: string;
  updated_at: string;
}

interface VersionRow {
  id: string;
  memory_id: string;
  uid: string;
  version: number | string;
  content: string;
  kind: string;
  pinned: number | boolean;
  score: number | string;
  change_note: string | null;
  changed_at: string;
}

interface LinkRow {
  id: string;
  uid: string;
  from_id: string;
  to_id: string;
  relation: string;
  weight: number | string;
  created_at: string;
}

interface VectorRow {
  id: string;
  uid: string;
  dims: number | string;
  vector: string;
  model: string;
  created_at: string;
}

interface BranchRow {
  id: string;
  uid: string;
  name: string;
  project_id: string | null;
  source_id: string | null;
  created_at: string;
}

interface BranchItemRow {
  id: string;
  uid: string;
  branch_id: string;
  memory_id: string;
  created_at: string;
}

export interface SaveMemoryInput {
  content: string;
  kind?: MemoryKind;
  projectId?: string | null;
  sourceChatId?: string | null;
  sourceMessageId?: string | null;
  pinned?: boolean;
}

async function foundationDb(): Promise<D1Like | null> {
  const db = await getChatDb();
  if (!db) return null;
  await ensureFoundationSchema(db);
  return db;
}

function mapRow(r: MemoryRow): MemoryRecord {
  return {
    id: r.id,
    uid: r.uid,
    projectId: r.project_id ?? null,
    kind: isMemoryKind(r.kind) ? r.kind : "fact",
    content: r.content,
    sourceChatId: r.source_chat_id ?? null,
    sourceMessageId: r.source_message_id ?? null,
    pinned: r.pinned === 1 || r.pinned === true,
    score: Number(r.score) || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowFor(m: MemoryRecord): MemoryRow {
  return {
    id: m.id,
    uid: m.uid,
    project_id: m.projectId ?? null,
    kind: m.kind,
    content: m.content,
    source_chat_id: m.sourceChatId ?? null,
    source_message_id: m.sourceMessageId ?? null,
    pinned: m.pinned ? 1 : 0,
    score: m.score ?? 0,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  };
}

function mapVersion(r: VersionRow): MemoryVersion {
  return {
    id: r.id,
    memoryId: r.memory_id,
    uid: r.uid,
    version: Number(r.version) || 1,
    content: r.content,
    kind: isMemoryKind(r.kind) ? r.kind : "fact",
    pinned: r.pinned === 1 || r.pinned === true,
    score: Number(r.score) || 0,
    changeNote: r.change_note ?? null,
    changedAt: r.changed_at,
  };
}

function mapLink(r: LinkRow): MemoryLink {
  return {
    id: r.id,
    uid: r.uid,
    fromId: r.from_id,
    toId: r.to_id,
    relation: isMemoryRelation(r.relation) ? r.relation : "related",
    weight: Number(r.weight) || 1,
    createdAt: r.created_at,
  };
}

const UPSERT = `INSERT INTO memory_records
  (id, uid, project_id, kind, content, source_chat_id, source_message_id, pinned, score, created_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
  ON CONFLICT(id) DO UPDATE SET
    content = excluded.content,
    kind = excluded.kind,
    project_id = excluded.project_id,
    source_chat_id = excluded.source_chat_id,
    source_message_id = excluded.source_message_id,
    pinned = excluded.pinned,
    score = excluded.score,
    updated_at = excluded.updated_at`;

const VERSION_INSERT = `INSERT INTO memory_versions
  (id, memory_id, uid, version, content, kind, pinned, score, change_note, changed_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`;

const LINK_INSERT = `INSERT INTO memory_links
  (id, uid, from_id, to_id, relation, weight, created_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`;

const VECTOR_INSERT = `INSERT INTO memory_vectors
  (id, uid, dims, vector, model, created_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  ON CONFLICT(id) DO UPDATE SET
    dims = excluded.dims,
    vector = excluded.vector,
    model = excluded.model,
    created_at = excluded.created_at`;

const BRANCH_INSERT = `INSERT INTO memory_branches
  (id, uid, name, project_id, source_id, created_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6)`;

const BRANCH_ITEM_INSERT = `INSERT INTO memory_branch_items
  (id, uid, branch_id, memory_id, created_at)
  VALUES (?1, ?2, ?3, ?4, ?5)`;

async function upsert(db: D1Like, m: MemoryRecord): Promise<void> {
  const r = rowFor(m);
  await db
    .prepare(UPSERT)
    .bind(r.id, r.uid, r.project_id, r.kind, r.content, r.source_chat_id, r.source_message_id, r.pinned, r.score, r.created_at, r.updated_at)
    .run();
}

async function versionsFor(db: D1Like, uid: string, memoryId: string): Promise<MemoryVersion[]> {
  const { results } = await db
    .prepare("SELECT * FROM memory_versions WHERE memory_id = ?1 ORDER BY version DESC")
    .bind(memoryId)
    .all<VersionRow>();
  return results.filter((r) => r.uid === uid).map(mapVersion);
}

/** Append an immutable commit only when user-visible memory state changed. */
async function writeVersion(db: D1Like, record: MemoryRecord, prior: MemoryRecord | null, note: string): Promise<void> {
  const changed =
    !prior ||
    prior.content !== record.content ||
    prior.kind !== record.kind ||
    prior.pinned !== record.pinned;
  if (!changed) return;
  const history = await versionsFor(db, record.uid, record.id);
  const version = history.reduce((max, v) => Math.max(max, v.version), 0) + 1;
  await db
    .prepare(VERSION_INSERT)
    .bind(
      newId("mv"), record.id, record.uid, version, record.content, record.kind,
      record.pinned ? 1 : 0, record.score ?? 0, note, new Date().toISOString(),
    )
    .run();
}

async function writeVector(db: D1Like, record: MemoryRecord, prior: MemoryRecord | null): Promise<void> {
  if (prior && prior.content === record.content) return;
  await db
    .prepare(VECTOR_INSERT)
    .bind(
      record.id, record.uid, VECTOR_DIMS, JSON.stringify(embedText(record.content)),
      VECTOR_MODEL, new Date().toISOString(),
    )
    .run();
}

/** Write the record plus its version commit and embedding as one logical unit. */
async function persist(
  db: D1Like, record: MemoryRecord, prior: MemoryRecord | null, note: string,
): Promise<void> {
  await upsert(db, record);
  await writeVersion(db, record, prior, note);
  await writeVector(db, record, prior);
}

export async function listMemories(uid: string, limit = 200): Promise<MemoryRecord[]> {
  const db = await foundationDb();
  if (!db) return [];
  const { results } = await db
    .prepare("SELECT * FROM memory_records WHERE uid = ?1 ORDER BY updated_at DESC")
    .bind(uid)
    .all<MemoryRow>();
  return results.map(mapRow).slice(0, Math.max(1, Math.min(1000, limit)));
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "what", "when", "where", "which",
  "about", "into", "your", "youre", "please", "would", "could", "should", "them", "then", "than",
]);

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? []).filter((t) => !STOP_WORDS.has(t));
}

function lexicalParts(m: MemoryRecord, query: string, terms: string[]): { score: number; hits: number } {
  const hay = m.content.toLowerCase();
  let score = (m.score ?? 0) + (m.pinned ? 5 : 0);
  if (query && hay.includes(query)) score += 6;
  let hits = 0;
  for (const term of terms) {
    if (hay.includes(term)) {
      score += 2;
      hits++;
    }
  }
  return { score, hits };
}

async function vectorsFor(uid: string): Promise<Map<string, number[]>> {
  const db = await foundationDb();
  if (!db) return new Map();
  const { results } = await db
    .prepare("SELECT * FROM memory_vectors WHERE uid = ?1")
    .bind(uid)
    .all<VectorRow>();
  const map = new Map<string, number[]>();
  for (const row of results) {
    if (row.model !== VECTOR_MODEL || Number(row.dims) !== VECTOR_DIMS) continue;
    const vector = parseVector(row.vector);
    if (vector) map.set(row.id, vector);
  }
  return map;
}

/**
 * Hybrid retrieval: lexical matches + local vector similarity + a graph
 * proximity boost + pinning/recency. Empty query returns pinned/recent items.
 */
export async function searchMemories(
  uid: string,
  query: string,
  opts: { projectId?: string | null; limit?: number; hybridWeight?: number } = {},
): Promise<MemoryContext[]> {
  const [all, links, vectors] = await Promise.all([
    listMemories(uid, 500),
    listMemoryLinks(uid),
    vectorsFor(uid),
  ]);
  const q = String(query ?? "").toLowerCase().trim();
  const terms = tokens(q);
  const queryVector = q ? embedText(q) : null;
  const limit = Math.max(1, Math.min(MAX_MEMORY_ITEMS, opts.limit ?? MAX_MEMORY_ITEMS));
  const rawHybridWeight = Number(opts.hybridWeight);
  const hybridWeight = Number.isFinite(rawHybridWeight)
    ? Math.min(2, Math.max(0, rawHybridWeight))
    : 1;

  const hits = new Map(all.map((m) => [m.id, lexicalParts(m, q, terms)]));

  // Graph signal: if a query-matching memory is linked to another one, the
  // neighbour is relevant even when its own text does not repeat the terms.
  const graphBoost = new Map<string, number>();
  if (q && terms.length) {
    for (const link of links) {
      const from = hits.get(link.fromId);
      const to = hits.get(link.toId);
      if (!from || !to) continue;
      const weight = Math.max(0.1, Math.min(3, link.weight));
      if (from.hits > 0 && to.hits === 0) graphBoost.set(link.toId, (graphBoost.get(link.toId) ?? 0) + 1.5 * weight);
      if (to.hits > 0 && from.hits === 0) graphBoost.set(link.fromId, (graphBoost.get(link.fromId) ?? 0) + 1.5 * weight);
    }
  }

  const scored = all
    .filter((m) => !opts.projectId || !m.projectId || m.projectId === opts.projectId)
    .map((m) => {
      const vector = vectors.get(m.id);
      const similarity = queryVector && vector ? Math.max(0, cosineSimilarity(queryVector, vector)) : 0;
      let score = (hits.get(m.id)?.score ?? 0) + similarity * 5 * hybridWeight + (graphBoost.get(m.id) ?? 0);
      // A tiny recency nudge breaks ties without drowning older, pinned facts.
      const ageDays = (Date.now() - Date.parse(m.updatedAt)) / 86_400_000;
      if (Number.isFinite(ageDays)) score += Math.max(0, 1.5 - ageDays / 30);
      return { id: m.id, kind: m.kind, content: m.content, score: Math.round(score * 100) / 100 };
    })
    .filter((m) => !q || !terms.length || m.score > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return scored.slice(0, limit);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Save a bounded batch, collapsing exact duplicates so repeated turns don't pile up. */
export async function saveMemories(uid: string, inputs: SaveMemoryInput[]): Promise<MemoryRecord[]> {
  const db = await foundationDb();
  if (!db || !inputs.length) return [];

  const existing = await listMemories(uid, 1000);
  const byContent = new Map(existing.map((m) => [normalize(m.content), m]));
  const now = new Date().toISOString();
  const saved: MemoryRecord[] = [];

  for (const item of inputs.slice(0, 20)) {
    const content = sanitizeMemoryText(item.content);
    if (content.length < 4) continue;
    const key = normalize(content);
    const kind: MemoryKind = isMemoryKind(item.kind) ? item.kind : "fact";
    const prior = byContent.get(key);
    const record: MemoryRecord = prior
      ? {
          ...prior,
          kind,
          content,
          projectId: item.projectId ?? prior.projectId ?? null,
          pinned: prior.pinned || !!item.pinned,
          score: (prior.score ?? 0) + 0.25,
          updatedAt: now,
        }
      : {
          id: newId("mem"),
          uid,
          projectId: item.projectId ?? null,
          kind,
          content,
          sourceChatId: item.sourceChatId ?? null,
          sourceMessageId: item.sourceMessageId ?? null,
          pinned: !!item.pinned,
          score: 0,
          createdAt: now,
          updatedAt: now,
        };
    await persist(db, record, prior ?? null, prior ? "updated" : "created");
    byContent.set(key, record);
    saved.push(record);
  }

  // Keep the store queryable: retire the oldest unpinned records past the cap.
  if (existing.length + saved.length > 1000) {
    const all = await listMemories(uid, 1000);
    const stale = all.filter((m) => !m.pinned).slice(-Math.min(200, all.length - 900));
    for (const m of stale) await deleteMemory(uid, m.id);
  }
  return saved;
}

export async function setMemoryPinned(uid: string, id: string, pinned: boolean): Promise<MemoryRecord | null> {
  const db = await foundationDb();
  if (!db) return null;
  const { results } = await db.prepare("SELECT * FROM memory_records WHERE id = ?1").bind(id).all<MemoryRow>();
  const row = results.find((r) => r.uid === uid);
  if (!row) return null;
  const prior = mapRow(row);
  const record: MemoryRecord = { ...prior, pinned, updatedAt: new Date().toISOString() };
  await persist(db, record, prior, pinned ? "pinned" : "unpinned");
  return record;
}

export async function deleteMemory(uid: string, id: string): Promise<boolean> {
  const db = await foundationDb();
  if (!db) return false;
  const { results } = await db.prepare("SELECT * FROM memory_records WHERE id = ?1").bind(id).all<MemoryRow>();
  const row = results.find((r) => r.id === id && r.uid === uid);
  if (!row) return false;
  // Cascade the kernel sidecars so a deleted memory leaves no orphan graph or history.
  await db.prepare("DELETE FROM memory_records WHERE id = ?1").bind(id).run();
  await db.prepare("DELETE FROM memory_versions WHERE memory_id = ?1").bind(id).run();
  await db.prepare("DELETE FROM memory_vectors WHERE id = ?1").bind(id).run();
  const links = await listMemoryLinks(uid);
  for (const link of links) {
    if (link.fromId === id || link.toId === id) {
      await db.prepare("DELETE FROM memory_links WHERE id = ?1").bind(link.id).run();
    }
  }
  const items = await branchItems(uid);
  for (const item of items) {
    if (item.memoryId === id) {
      await db.prepare("DELETE FROM memory_branch_items WHERE id = ?1").bind(item.id).run();
    }
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* Git-like history                                                            */
/* -------------------------------------------------------------------------- */

/** Newest-first commit history for one memory. */
export async function listMemoryVersions(uid: string, memoryId: string): Promise<MemoryVersion[]> {
  const db = await foundationDb();
  if (!db) return [];
  return versionsFor(db, uid, memoryId);
}

/** Restore an older commit as a NEW commit — history is never rewritten. */
export async function revertMemory(uid: string, memoryId: string, version: number): Promise<MemoryRecord | null> {
  const db = await foundationDb();
  if (!db) return null;
  const target = (await versionsFor(db, uid, memoryId)).find((v) => v.version === version);
  if (!target) return null;
  const current = (await listMemories(uid, 1000)).find((m) => m.id === memoryId);
  if (!current) return null;
  const restored: MemoryRecord = {
    ...current,
    content: target.content,
    kind: target.kind,
    pinned: target.pinned,
    updatedAt: new Date().toISOString(),
  };
  await persist(db, restored, current, `restored v${version}`);
  return restored;
}

/* -------------------------------------------------------------------------- */
/* Memory graph                                                                */
/* -------------------------------------------------------------------------- */

export async function listMemoryLinks(uid: string): Promise<MemoryLink[]> {
  const db = await foundationDb();
  if (!db) return [];
  const { results } = await db
    .prepare("SELECT * FROM memory_links WHERE uid = ?1")
    .bind(uid)
    .all<LinkRow>();
  return results.map(mapLink).slice(0, 2000);
}

export async function linkMemories(
  uid: string, fromId: string, toId: string, relation: MemoryRelation = "related", weight = 1,
): Promise<MemoryLink | null> {
  const db = await foundationDb();
  if (!db || fromId === toId) return null;
  const ids = new Set((await listMemories(uid, 1000)).map((m) => m.id));
  if (!ids.has(fromId) || !ids.has(toId)) return null;
  const rel = isMemoryRelation(relation) ? relation : "related";
  const existing = (await listMemoryLinks(uid)).find(
    (l) => l.fromId === fromId && l.toId === toId && l.relation === rel,
  );
  if (existing) return existing;
  const link: MemoryLink = {
    id: newId("ml"),
    uid,
    fromId,
    toId,
    relation: rel,
    weight: Math.max(0.1, Math.min(3, Number(weight) || 1)),
    createdAt: new Date().toISOString(),
  };
  await db
    .prepare(LINK_INSERT)
    .bind(link.id, link.uid, link.fromId, link.toId, link.relation, link.weight, link.createdAt)
    .run();
  return link;
}

export async function unlinkMemories(uid: string, id: string): Promise<boolean> {
  const db = await foundationDb();
  if (!db) return false;
  const link = (await listMemoryLinks(uid)).find((l) => l.id === id && l.uid === uid);
  if (!link) return false;
  await db.prepare("DELETE FROM memory_links WHERE id = ?1").bind(id).run();
  return true;
}

/** Nodes + edges for graph rendering and link-target selection. */
export async function getMemoryGraph(uid: string): Promise<MemoryGraph> {
  const [all, links] = await Promise.all([listMemories(uid, 500), listMemoryLinks(uid)]);
  const ids = new Set(all.map((m) => m.id));
  return {
    nodes: all.map((m) => ({ id: m.id, kind: m.kind, content: m.content, score: m.score })),
    links: links.filter((l) => ids.has(l.fromId) && ids.has(l.toId)),
  };
}

/* -------------------------------------------------------------------------- */
/* Memory inheritance                                                          */
/* -------------------------------------------------------------------------- */

interface BranchItemRef {
  id: string;
  branchId: string;
  memoryId: string;
}

async function branchItems(uid: string): Promise<BranchItemRef[]> {
  const db = await foundationDb();
  if (!db) return [];
  const { results } = await db
    .prepare("SELECT * FROM memory_branch_items WHERE uid = ?1")
    .bind(uid)
    .all<BranchItemRow>();
  return results.map((r) => ({ id: r.id, branchId: r.branch_id, memoryId: r.memory_id }));
}

export async function listMemoryBranches(uid: string): Promise<MemoryBranch[]> {
  const db = await foundationDb();
  if (!db) return [];
  const { results } = await db
    .prepare("SELECT * FROM memory_branches WHERE uid = ?1")
    .bind(uid)
    .all<BranchRow>();
  const items = await branchItems(uid);
  return results
    .map((r) => ({
      id: r.id,
      uid: r.uid,
      name: r.name,
      projectId: r.project_id ?? null,
      sourceId: r.source_id ?? null,
      memories: items.filter((i) => i.branchId === r.id).length,
      createdAt: r.created_at,
    }))
    .slice(0, 200);
}

/** `"main"` is the implicit root branch: every memory owned by the user. */
export async function listBranchMemories(uid: string, branchId: string): Promise<MemoryRecord[]> {
  const all = await listMemories(uid, 1000);
  if (!branchId || branchId === "main") return all;
  const ids = new Set((await branchItems(uid)).filter((i) => i.branchId === branchId).map((i) => i.memoryId));
  return all.filter((m) => ids.has(m.id));
}

/** Fork a branch (or main) into a named module; items are references, not copies. */
export async function createMemoryBranch(
  uid: string, name: string, sourceId?: string | null, projectId?: string | null,
): Promise<MemoryBranch | null> {
  const db = await foundationDb();
  const cleanName = sanitizeMemoryText(name, 80);
  if (!db || !cleanName) return null;
  const source = await listBranchMemories(uid, sourceId || "main");
  const picked = (projectId ? source.filter((m) => m.projectId === projectId) : source).slice(0, 500);
  const now = new Date().toISOString();
  const branch: BranchRow = {
    id: newId("mb"),
    uid,
    name: cleanName,
    project_id: projectId ?? null,
    source_id: sourceId || "main",
    created_at: now,
  };
  await db
    .prepare(BRANCH_INSERT)
    .bind(branch.id, branch.uid, branch.name, branch.project_id, branch.source_id, branch.created_at)
    .run();
  for (const m of picked) {
    await db
      .prepare(BRANCH_ITEM_INSERT)
      .bind(newId("mbi"), uid, branch.id, m.id, now)
      .run();
  }
  return (await listMemoryBranches(uid)).find((b) => b.id === branch.id) ?? null;
}

export async function addMemoryToBranch(uid: string, memoryId: string, branchId: string): Promise<boolean> {
  const db = await foundationDb();
  if (!db || !branchId || branchId === "main") return false;
  const ownsMemory = (await listMemories(uid, 1000)).some((m) => m.id === memoryId);
  const ownsBranch = (await listMemoryBranches(uid)).some((b) => b.id === branchId);
  if (!ownsMemory || !ownsBranch) return false;
  if ((await branchItems(uid)).some((i) => i.branchId === branchId && i.memoryId === memoryId)) return true;
  await db
    .prepare(BRANCH_ITEM_INSERT)
    .bind(newId("mbi"), uid, branchId, memoryId, new Date().toISOString())
    .run();
  return true;
}

/**
 * Merge insights back: copy each source memory that the target lacks into a
 * NEW record, tagged with a `derived_from` link to its origin so provenance is
 * preserved and neither branch rewrites the other's history.
 */
export async function mergeMemoryBranch(
  uid: string, sourceId: string, targetId: string,
): Promise<{ added: number; linked: number }> {
  const db = await foundationDb();
  const empty = { added: 0, linked: 0 };
  if (!db || !sourceId || !targetId || sourceId === targetId) return empty;
  const branches = await listMemoryBranches(uid);
  const targetBranch = targetId === "main" ? null : branches.find((b) => b.id === targetId);
  if (targetId !== "main" && !targetBranch) return empty;
  const source = await listBranchMemories(uid, sourceId);
  if (!source.length) return empty;
  const targetIds = new Set((await listBranchMemories(uid, targetId)).map((m) => m.id));
  const now = new Date().toISOString();
  let added = 0;
  let linked = 0;

  for (const m of source) {
    if (targetIds.has(m.id)) continue;
    const copy: MemoryRecord = {
      ...m,
      id: newId("mem"),
      sourceChatId: null,
      sourceMessageId: null,
      createdAt: now,
      updatedAt: now,
    };
    await persist(db, copy, null, `merged from ${sourceId}`);
    if (targetBranch) {
      await db.prepare(BRANCH_ITEM_INSERT).bind(newId("mbi"), uid, targetId, copy.id, now).run();
    }
    await db
      .prepare(LINK_INSERT)
      .bind(newId("ml"), uid, copy.id, m.id, "derived_from", 1, now)
      .run();
    added++;
    linked++;
  }
  return { added, linked };
}

export { MAX_MEMORY_CHARS, MAX_MEMORY_ITEMS };
