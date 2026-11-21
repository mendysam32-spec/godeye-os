/**
 * Federated memory: scoped, sealed snapshots of the local memory graph.
 *
 * A grant is an A2A `memory.grant` envelope carrying an AES-GCM bundle that is
 * bound to one pinned recipient key. Recipients verify the signed envelope and
 * the grant scope/expiry before importing nodes as a new branch with new local
 * ids. All transferred content is declarative text — never executable.
 */

import {
  createEnvelope, didFor, hashJson, safeA2AJson,
  type A2AEnvelope, type A2APublicJwk,
} from "./a2a";
import {
  isMemoryKind, isMemoryRelation, newId,
  type MemoryKind, type MemoryRelation,
} from "./foundation";
import {
  addMemoryToBranch, createMemoryBranch, linkMemories, listBranchMemories,
  listMemories, listMemoryLinks, saveMemories,
} from "./memory";
import {
  openSealedBundle, sealForRecipient, type SealedBundle,
} from "./federated-crypto";

export const FED_MEMORY_FORMAT = "medusa-memory-grant";
export const FED_SNAPSHOT_FORMAT = "medusa-memory-snapshot";
export const FED_MAX_NODES = 20;
export const FED_MAX_LINKS = 60;
export const FED_MAX_CONTENT = 400;
export const FED_DEFAULT_TTL_MS = 60 * 60 * 1000;
export const FED_MAX_TTL_MS = 24 * 60 * 60 * 1000;

export interface FedMemoryScope {
  [key: string]: unknown;
  projectId?: string;
  kinds?: string[];
  branchId?: string;
  limit?: number;
}

export interface SnapshotNode {
  kind: MemoryKind;
  content: string;
  score: number;
}

export interface SnapshotLink {
  from: number;
  to: number;
  relation: MemoryRelation;
  weight: number;
}

export interface MemorySnapshot {
  format: typeof FED_SNAPSHOT_FORMAT;
  version: 1;
  ownerDid: string;
  grantId: string;
  scope: FedMemoryScope;
  builtAt: string;
  nodes: SnapshotNode[];
  links: SnapshotLink[];
}

export interface CreateGrantInput {
  uid: string;
  agentId: string;
  peerDid: string;
  peerAgentId: string;
  peerEncryptionKey: { publicJwk: A2APublicJwk; keyId: string };
  resourceKind: string;
  resourceId: string;
  capability: string;
  scope: FedMemoryScope;
  ttlMs: number;
  displayName?: string;
  role?: string;
  capabilities?: string[];
}

export interface CreatedGrant {
  grantId: string;
  expiresAt: string;
  context: string;
  scope: FedMemoryScope;
  sealed: SealedBundle;
  bundleHash: string;
  envelope: A2AEnvelope;
  nodeCount: number;
  linkCount: number;
}

export interface ImportedGrant {
  branchId: string;
  nodeCount: number;
  linkCount: number;
  sourceDid: string;
}

function clip(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeScope(value: unknown): FedMemoryScope {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const kinds = Array.isArray(raw.kinds)
    ? raw.kinds.filter((k): k is string => typeof k === "string" && isMemoryKind(k)).slice(0, 6)
    : [];
  const limit = Number(raw.limit);
  const scope: FedMemoryScope = {};
  const projectId = clip(raw.projectId, 120);
  const branchId = clip(raw.branchId, 120);
  if (projectId) scope.projectId = projectId;
  if (kinds.length) scope.kinds = kinds;
  if (branchId) scope.branchId = branchId;
  if (Number.isFinite(limit)) scope.limit = Math.min(FED_MAX_NODES, Math.max(1, Math.floor(limit)));
  return scope;
}

/** Build a bounded graph snapshot. Vectors are deterministic and rebuilt on import. */
export async function buildMemorySnapshot(
  uid: string, ownerDid: string, grantId: string, scope: FedMemoryScope,
): Promise<MemorySnapshot> {
  const source = scope.branchId && scope.branchId !== "main"
    ? await listBranchMemories(uid, scope.branchId)
    : await listMemories(uid, 1000);
  const selected = source
    .filter((m) => !scope.projectId || m.projectId === scope.projectId)
    .filter((m) => !scope.kinds?.length || scope.kinds.includes(m.kind))
    .slice(0, scope.limit || FED_MAX_NODES);

  const index = new Map(selected.map((m, i) => [m.id, i]));
  const originalLinks = await listMemoryLinks(uid);
  const links: SnapshotLink[] = [];
  for (const link of originalLinks) {
    const from = index.get(link.fromId);
    const to = index.get(link.toId);
    if (from === undefined || to === undefined || !isMemoryRelation(link.relation)) continue;
    links.push({ from, to, relation: link.relation, weight: link.weight });
    if (links.length >= FED_MAX_LINKS) break;
  }

  return {
    format: FED_SNAPSHOT_FORMAT,
    version: 1,
    ownerDid,
    grantId,
    scope,
    builtAt: new Date().toISOString(),
    nodes: selected.map((m) => ({
      kind: isMemoryKind(m.kind) ? m.kind : "fact" as MemoryKind,
      content: m.content.slice(0, FED_MAX_CONTENT),
      score: Number(m.score) || 0,
    })),
    links,
  };
}

/** Create a signed, recipient-encrypted memory grant envelope. */
export async function createMemoryGrant(input: CreateGrantInput): Promise<CreatedGrant> {
  const grantId = newId("fgr");
  const ttlMs = Math.min(FED_MAX_TTL_MS, Math.max(60_000, Math.floor(input.ttlMs) || FED_DEFAULT_TTL_MS));
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const scope = normalizeScope(input.scope);
  const ownerDid = didFor(input.uid, input.agentId);
  const snapshot = await buildMemorySnapshot(input.uid, ownerDid, grantId, scope);

  const context = `memory-grant:${grantId}`;
  const sealed = await sealForRecipient(
    snapshot as unknown as Record<string, unknown>,
    input.peerEncryptionKey,
    { uid: input.uid, agentId: input.agentId },
    context,
  );
  const bundleHash = await hashJson(sealed);
  const payload = safeA2AJson({
    format: FED_MEMORY_FORMAT,
    version: 1,
    grantId,
    resourceKind: clip(input.resourceKind, 40) || "graph",
    resourceId: clip(input.resourceId, 200),
    capability: clip(input.capability, 80) || "memory.query",
    scope,
    sealed,
    bundleHash,
    expiresAt,
    encryptionKeyId: input.peerEncryptionKey.keyId,
    encryptionPublicKey: input.peerEncryptionKey.publicJwk,
  });
  const envelope = await createEnvelope({
    uid: input.uid,
    agentId: input.agentId,
    type: "memory.grant",
    to: { did: input.peerDid, agentId: input.peerAgentId },
    payload,
    displayName: input.displayName,
    role: input.role,
    capabilities: input.capabilities,
  });
  return {
    grantId, expiresAt, context, scope, sealed, bundleHash, envelope,
    nodeCount: snapshot.nodes.length, linkCount: snapshot.links.length,
  };
}

/** Validate the signed grant payload the inbox already authenticated. */
export function readGrantPayload(envelope: A2AEnvelope): {
  grantId: string;
  resourceKind: string;
  resourceId: string;
  capability: string;
  scope: FedMemoryScope;
  sealed: SealedBundle;
  bundleHash: string;
  expiresAt: string;
} {
  const payload = envelope.payload as Record<string, unknown>;
  if (envelope.type !== "memory.grant" || payload.format !== FED_MEMORY_FORMAT || payload.version !== 1) {
    throw new Error("Unsupported memory grant format");
  }
  const grantId = clip(payload.grantId, 200);
  if (!/^fgr_[A-Za-z0-9_-]{4,120}$/.test(grantId)) throw new Error("Invalid grant id");
  const sealed = payload.sealed as unknown as SealedBundle;
  if (!sealed || typeof sealed !== "object" || typeof sealed.ciphertext !== "string") {
    throw new Error("Grant is missing its sealed snapshot");
  }
  const expiresAt = clip(payload.expiresAt, 40);
  if (!Number.isFinite(Date.parse(expiresAt))) throw new Error("Grant has an invalid expiry");
  return {
    grantId,
    resourceKind: clip(payload.resourceKind, 40) || "graph",
    resourceId: clip(payload.resourceId, 200),
    capability: clip(payload.capability, 80) || "memory.query",
    scope: normalizeScope(payload.scope),
    sealed,
    bundleHash: clip(payload.bundleHash, 100),
    expiresAt,
  };
}

/** Decrypt and import a received grant into a fresh, provenance-tagged branch. */
export async function importMemoryGrant(input: {
  uid: string;
  recipientAgentId: string;
  grantId: string;
  peerDid: string;
  sealed: SealedBundle;
  context: string;
  expectedOwnerDid: string;
}): Promise<ImportedGrant> {
  const snapshot = await openSealedBundle(
    input.sealed, { uid: input.uid, agentId: input.recipientAgentId }, input.context,
  ) as unknown as MemorySnapshot;
  if (snapshot.format !== FED_SNAPSHOT_FORMAT || snapshot.version !== 1) {
    throw new Error("Unsupported memory snapshot format");
  }
  if (snapshot.grantId !== input.grantId || snapshot.ownerDid !== input.expectedOwnerDid) {
    throw new Error("Snapshot does not match its signed grant");
  }
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes.slice(0, FED_MAX_NODES) : [];
  if (!nodes.length) throw new Error("Grant contains no memory nodes");

  const saved = await saveMemories(input.uid, nodes.map((n) => ({
    content: typeof n.content === "string" ? n.content.slice(0, FED_MAX_CONTENT) : "",
    kind: isMemoryKind(n.kind) ? n.kind : "fact",
    pinned: false,
  })));
  const byContent = new Map(saved.map((m) => [m.content, m.id]));
  const all = await listMemories(input.uid, 1000);
  for (const node of nodes) {
    const content = typeof node.content === "string" ? node.content : "";
    if (!byContent.has(content)) {
      const match = all.find((m) => m.content === content);
      if (match) byContent.set(content, match.id);
    }
  }

  const name = `Federated: ${input.peerDid.slice(-24)} ${new Date().toISOString().slice(0, 10)}`;
  const branch = await createMemoryBranch(input.uid, name, "fed-import-empty");
  if (!branch) throw new Error("Could not create the imported memory branch");

  let linkCount = 0;
  for (const link of Array.isArray(snapshot.links) ? snapshot.links.slice(0, FED_MAX_LINKS) : []) {
    const fromId = byContent.get(nodes[link.from]?.content || "");
    const toId = byContent.get(nodes[link.to]?.content || "");
    if (!fromId || !toId) continue;
    const created = await linkMemories(input.uid, fromId, toId, link.relation, link.weight);
    if (created) linkCount += 1;
  }
  for (const id of byContent.values()) await addMemoryToBranch(input.uid, id, branch.id);

  return { branchId: branch.id, nodeCount: saved.length, linkCount, sourceDid: input.expectedOwnerDid };
}
