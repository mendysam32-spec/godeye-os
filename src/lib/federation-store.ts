/**
 * Durable storage for roadmap Phase 3 item 11: federated memory and the skill
 * marketplace. Follows the item 10 conventions — user-scoped rows, full-row
 * upserts and single-predicate reads so the dev JSON shim can execute them.
 *
 * Only public JWKs, signatures, sealed ciphertext and declarative manifests
 * are persisted. Private keys and executable code are never stored here.
 */

import { ensureFoundationSchema, getChatDb, type D1Like } from "./d1";
import { validatePublicJwk, type A2AEnvelope, type A2APublicJwk } from "./a2a";

export type FedDirection = "issued" | "received";
export type FedGrantStatus = "active" | "revoked" | "imported";
export type FedPackageStatus = "published" | "unpublished";
export type FedVerification = "unverified" | "signature-only" | "pinned" | "rejected";

export interface FedEncryptionKeyRecord {
  id: string;
  uid: string;
  did: string;
  agentId: string;
  keyId: string;
  publicKey: A2APublicJwk;
  trustMode: "pin" | "open";
  createdAt: string;
  updatedAt: string;
}

export interface FedMemoryGrantRecord {
  id: string;
  uid: string;
  direction: FedDirection;
  grantId: string;
  resourceKind: string;
  resourceId: string;
  localAgentId: string;
  peerDid: string;
  peerAgentId: string;
  capability: string;
  scope: Record<string, unknown>;
  sealed: Record<string, unknown>;
  envelope: A2AEnvelope | null;
  bundleHash: string;
  messageId: string;
  expiresAt: string;
  status: FedGrantStatus;
  importedBranchId: string;
  createdAt: string;
  updatedAt: string;
}

export interface FedSkillPackageRecord {
  id: string;
  uid: string;
  packageId: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  kind: "prompt" | "tool";
  publisherDid: string;
  keyId: string;
  envelope: A2AEnvelope | null;
  manifestHash: string;
  status: FedPackageStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FedSkillInstallRecord {
  id: string;
  uid: string;
  packageId: string;
  publisherDid: string;
  manifestHash: string;
  verification: FedVerification;
  genomeId: string;
  status: "candidate" | "imported";
  detail: string;
  createdAt: string;
  updatedAt: string;
}

type Row = Record<string, unknown>;

async function db(): Promise<D1Like | null> {
  const handle = await getChatDb();
  if (!handle) return null;
  await ensureFoundationSchema(handle);
  return handle;
}

function text(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function envelope(value: unknown): A2AEnvelope | null {
  const parsed = json<unknown>(value, null);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as A2AEnvelope : null;
}

function keyRow(r: Row): FedEncryptionKeyRecord {
  return {
    id: text(r.id, 200), uid: text(r.uid, 200), did: text(r.did, 300),
    agentId: text(r.agent_id, 96), keyId: text(r.key_id, 80),
    publicKey: validatePublicJwk(json<unknown>(r.public_key, null)) || { kty: "EC", crv: "P-256", x: "", y: "" },
    trustMode: r.trust_mode === "open" ? "open" : "pin",
    createdAt: text(r.created_at, 40), updatedAt: text(r.updated_at, 40),
  };
}

function grantRow(r: Row): FedMemoryGrantRecord {
  const status = text(r.status, 32);
  return {
    id: text(r.id, 200), uid: text(r.uid, 200),
    direction: r.direction === "received" ? "received" : "issued",
    grantId: text(r.grant_id, 200), resourceKind: text(r.resource_kind, 40),
    resourceId: text(r.resource_id, 200), localAgentId: text(r.local_agent_id, 96),
    peerDid: text(r.peer_did, 300),
    peerAgentId: text(r.peer_agent_id, 96), capability: text(r.capability, 80),
    scope: json<Record<string, unknown>>(r.scope_json, {}),
    sealed: json<Record<string, unknown>>(r.sealed_json, {}),
    envelope: envelope(r.envelope_json),
    bundleHash: text(r.bundle_hash, 100), messageId: text(r.message_id, 200),
    expiresAt: text(r.expires_at, 40),
    status: (["active", "revoked", "imported"].includes(status) ? status : "active") as FedGrantStatus,
    importedBranchId: text(r.imported_branch_id, 200),
    createdAt: text(r.created_at, 40), updatedAt: text(r.updated_at, 40),
  };
}

function packageRow(r: Row): FedSkillPackageRecord {
  const kind = text(r.kind, 20);
  const status = text(r.status, 20);
  return {
    id: text(r.id, 200), uid: text(r.uid, 200), packageId: text(r.package_id, 200),
    slug: text(r.slug, 80), name: text(r.name, 120), description: text(r.description, 400),
    version: text(r.version, 40), kind: kind === "tool" ? "tool" : "prompt",
    publisherDid: text(r.publisher_did, 300), keyId: text(r.key_id, 80),
    envelope: envelope(r.envelope_json), manifestHash: text(r.manifest_hash, 100),
    status: status === "unpublished" ? "unpublished" : "published",
    createdAt: text(r.created_at, 40), updatedAt: text(r.updated_at, 40),
  };
}

function installRow(r: Row): FedSkillInstallRecord {
  const verification = text(r.verification, 40);
  return {
    id: text(r.id, 200), uid: text(r.uid, 200), packageId: text(r.package_id, 200),
    publisherDid: text(r.publisher_did, 300), manifestHash: text(r.manifest_hash, 100),
    verification: (["signature-only", "pinned", "rejected"].includes(verification)
      ? verification : "unverified") as FedVerification,
    genomeId: text(r.genome_id, 200),
    status: r.status === "imported" ? "imported" : "candidate",
    detail: text(r.detail, 1000),
    createdAt: text(r.created_at, 40), updatedAt: text(r.updated_at, 40),
  };
}

/* -------------------------------------------------------------------------- */
/* encryption keys                                                             */
/* -------------------------------------------------------------------------- */

const KEY_UPSERT = `INSERT INTO fed_encryption_keys
  (id, uid, did, agent_id, key_id, public_key, trust_mode, created_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
  ON CONFLICT(id) DO UPDATE SET
    uid=excluded.uid, did=excluded.did, agent_id=excluded.agent_id,
    key_id=excluded.key_id, public_key=excluded.public_key,
    trust_mode=excluded.trust_mode, updated_at=excluded.updated_at`;

export async function upsertFedEncryptionKey(input: FedEncryptionKeyRecord): Promise<FedEncryptionKeyRecord | null> {
  const handle = await db();
  if (!handle) return null;
  await handle.prepare(KEY_UPSERT).bind(
    input.id, input.uid, input.did, input.agentId, input.keyId,
    JSON.stringify(input.publicKey), input.trustMode, input.createdAt, input.updatedAt,
  ).run();
  return input;
}

export async function listFedEncryptionKeys(uid: string): Promise<FedEncryptionKeyRecord[]> {
  const handle = await db();
  if (!handle) return [];
  const { results } = await handle.prepare(
    "SELECT * FROM fed_encryption_keys WHERE uid = ?1 ORDER BY updated_at DESC LIMIT 100",
  ).bind(uid).all<Row>();
  return results.filter((r) => r.uid === uid).map(keyRow);
}

export async function findFedEncryptionKeyByDid(uid: string, did: string): Promise<FedEncryptionKeyRecord | null> {
  const keys = await listFedEncryptionKeys(uid);
  return keys.find((k) => k.did === did && k.trustMode === "pin") || null;
}

export async function deleteFedEncryptionKey(uid: string, id: string): Promise<boolean> {
  const keys = await listFedEncryptionKeys(uid);
  if (!keys.some((k) => k.id === id)) return false;
  const handle = await db();
  if (!handle) return false;
  await handle.prepare("DELETE FROM fed_encryption_keys WHERE id = ?1").bind(id).run();
  return true;
}

/* -------------------------------------------------------------------------- */
/* memory grants                                                               */
/* -------------------------------------------------------------------------- */

const GRANT_UPSERT = `INSERT INTO fed_memory_grants
  (id, uid, direction, grant_id, resource_kind, resource_id, local_agent_id, peer_did, peer_agent_id,
   capability, scope_json, sealed_json, envelope_json, bundle_hash, message_id,
   expires_at, status, imported_branch_id, created_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
  ON CONFLICT(id) DO UPDATE SET
    uid=excluded.uid, direction=excluded.direction, grant_id=excluded.grant_id,
    resource_kind=excluded.resource_kind, resource_id=excluded.resource_id,
    local_agent_id=excluded.local_agent_id,
    peer_did=excluded.peer_did, peer_agent_id=excluded.peer_agent_id,
    capability=excluded.capability, scope_json=excluded.scope_json,
    sealed_json=excluded.sealed_json, envelope_json=excluded.envelope_json,
    bundle_hash=excluded.bundle_hash, message_id=excluded.message_id,
    expires_at=excluded.expires_at, status=excluded.status,
    imported_branch_id=excluded.imported_branch_id, updated_at=excluded.updated_at`;

export async function upsertFedMemoryGrant(input: FedMemoryGrantRecord): Promise<FedMemoryGrantRecord | null> {
  const handle = await db();
  if (!handle) return null;
  await handle.prepare(GRANT_UPSERT).bind(
    input.id, input.uid, input.direction, input.grantId, input.resourceKind,
    input.resourceId, input.localAgentId, input.peerDid, input.peerAgentId, input.capability,
    JSON.stringify(input.scope), JSON.stringify(input.sealed),
    input.envelope ? JSON.stringify(input.envelope) : "",
    input.bundleHash, input.messageId, input.expiresAt, input.status,
    input.importedBranchId, input.createdAt, input.updatedAt,
  ).run();
  return input;
}

export async function listFedMemoryGrants(uid: string): Promise<FedMemoryGrantRecord[]> {
  const handle = await db();
  if (!handle) return [];
  const { results } = await handle.prepare(
    "SELECT * FROM fed_memory_grants WHERE uid = ?1 ORDER BY updated_at DESC LIMIT 200",
  ).bind(uid).all<Row>();
  return results.filter((r) => r.uid === uid).map(grantRow);
}

export async function getFedMemoryGrant(uid: string, id: string): Promise<FedMemoryGrantRecord | null> {
  const handle = await db();
  if (!handle) return null;
  const row = await handle.prepare("SELECT * FROM fed_memory_grants WHERE id = ?1 LIMIT 1").bind(id).first<Row>();
  if (!row || row.uid !== uid) return null;
  return grantRow(row);
}

export async function findFedGrantByGrantId(grantId: string): Promise<FedMemoryGrantRecord | null> {
  const handle = await db();
  if (!handle) return null;
  const { results } = await handle.prepare(
    "SELECT * FROM fed_memory_grants WHERE grant_id = ?1 LIMIT 100",
  ).bind(grantId).all<Row>();
  return results.map(grantRow).find((g) => g.grantId === grantId) || null;
}

export async function deleteFedMemoryGrant(uid: string, id: string): Promise<boolean> {
  const existing = await getFedMemoryGrant(uid, id);
  if (!existing) return false;
  const handle = await db();
  if (!handle) return false;
  await handle.prepare("DELETE FROM fed_memory_grants WHERE id = ?1").bind(id).run();
  return true;
}

/* -------------------------------------------------------------------------- */
/* skill packages                                                              */
/* -------------------------------------------------------------------------- */

const PACKAGE_UPSERT = `INSERT INTO fed_skill_packages
  (id, uid, package_id, slug, name, description, version, kind, publisher_did,
   key_id, envelope_json, manifest_hash, status, created_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
  ON CONFLICT(id) DO UPDATE SET
    uid=excluded.uid, package_id=excluded.package_id, slug=excluded.slug,
    name=excluded.name, description=excluded.description, version=excluded.version,
    kind=excluded.kind, publisher_did=excluded.publisher_did, key_id=excluded.key_id,
    envelope_json=excluded.envelope_json, manifest_hash=excluded.manifest_hash,
    status=excluded.status, updated_at=excluded.updated_at`;

export async function upsertFedSkillPackage(input: FedSkillPackageRecord): Promise<FedSkillPackageRecord | null> {
  const handle = await db();
  if (!handle) return null;
  await handle.prepare(PACKAGE_UPSERT).bind(
    input.id, input.uid, input.packageId, input.slug, input.name, input.description,
    input.version, input.kind, input.publisherDid, input.keyId,
    input.envelope ? JSON.stringify(input.envelope) : "",
    input.manifestHash, input.status, input.createdAt, input.updatedAt,
  ).run();
  return input;
}

export async function listFedSkillPackages(uid: string): Promise<FedSkillPackageRecord[]> {
  const handle = await db();
  if (!handle) return [];
  const { results } = await handle.prepare(
    "SELECT * FROM fed_skill_packages WHERE uid = ?1 ORDER BY updated_at DESC LIMIT 200",
  ).bind(uid).all<Row>();
  return results.filter((r) => r.uid === uid).map(packageRow);
}

export async function getFedSkillPackage(uid: string, id: string): Promise<FedSkillPackageRecord | null> {
  const handle = await db();
  if (!handle) return null;
  const row = await handle.prepare("SELECT * FROM fed_skill_packages WHERE id = ?1 LIMIT 1").bind(id).first<Row>();
  if (!row || row.uid !== uid) return null;
  return packageRow(row);
}

export async function findFedPackageByPackageId(packageId: string): Promise<FedSkillPackageRecord | null> {
  const handle = await db();
  if (!handle) return null;
  const { results } = await handle.prepare(
    "SELECT * FROM fed_skill_packages WHERE package_id = ?1 LIMIT 100",
  ).bind(packageId).all<Row>();
  return results.map(packageRow).find((p) => p.packageId === packageId && p.status === "published") || null;
}

export async function deleteFedSkillPackage(uid: string, id: string): Promise<boolean> {
  const existing = await getFedSkillPackage(uid, id);
  if (!existing) return false;
  const handle = await db();
  if (!handle) return false;
  await handle.prepare("DELETE FROM fed_skill_packages WHERE id = ?1").bind(id).run();
  return true;
}

/* -------------------------------------------------------------------------- */
/* installs                                                                    */
/* -------------------------------------------------------------------------- */

const INSTALL_UPSERT = `INSERT INTO fed_skill_installs
  (id, uid, package_id, publisher_did, manifest_hash, verification, genome_id,
   status, detail, created_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
  ON CONFLICT(id) DO UPDATE SET
    uid=excluded.uid, package_id=excluded.package_id,
    publisher_did=excluded.publisher_did, manifest_hash=excluded.manifest_hash,
    verification=excluded.verification, genome_id=excluded.genome_id,
    status=excluded.status, detail=excluded.detail, updated_at=excluded.updated_at`;

export async function upsertFedSkillInstall(input: FedSkillInstallRecord): Promise<FedSkillInstallRecord | null> {
  const handle = await db();
  if (!handle) return null;
  await handle.prepare(INSTALL_UPSERT).bind(
    input.id, input.uid, input.packageId, input.publisherDid, input.manifestHash,
    input.verification, input.genomeId, input.status, input.detail,
    input.createdAt, input.updatedAt,
  ).run();
  return input;
}

export async function listFedSkillInstalls(uid: string): Promise<FedSkillInstallRecord[]> {
  const handle = await db();
  if (!handle) return [];
  const { results } = await handle.prepare(
    "SELECT * FROM fed_skill_installs WHERE uid = ?1 ORDER BY created_at DESC LIMIT 200",
  ).bind(uid).all<Row>();
  return results.filter((r) => r.uid === uid).map(installRow);
}

export async function findFedSkillInstall(uid: string, packageId: string): Promise<FedSkillInstallRecord | null> {
  const installs = await listFedSkillInstalls(uid);
  return installs.find((i) => i.packageId === packageId) || null;
}

export async function federationStorageReady(): Promise<boolean> {
  return !!(await db());
}
