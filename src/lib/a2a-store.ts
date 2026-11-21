/**
 * Durable storage for the open agent-to-agent protocol.
 *
 * Follows the item 9 runtime-config conventions: user-scoped rows, full-row
 * upserts, and single-predicate reads so the dev JSON shim can execute them.
 * No private keys are stored here — only public JWKs and pinned key ids.
 */

import { ensureFoundationSchema, getChatDb, type D1Like } from "./d1";
import { normalizeCapabilities, validatePublicJwk, type A2APublicJwk, type A2AMessageType } from "./a2a";

export type A2ATaskDirection = "outbound" | "inbound";
export type A2APeerTrust = "pin" | "open";

export interface A2AAgentRecord {
  id: string;
  uid: string;
  agentId: string;
  did: string;
  displayName: string;
  role: string;
  provider: string;
  model: string;
  capabilities: string[];
  publicKey: A2APublicJwk;
  keyId: string;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export interface A2APeerRecord {
  id: string;
  uid: string;
  did: string;
  displayName: string;
  endpoint: string;
  publicKey: A2APublicJwk;
  keyId: string;
  capabilities: string[];
  trustMode: A2APeerTrust;
  status: "active" | "disabled";
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface A2ATaskRecord {
  id: string;
  uid: string;
  direction: A2ATaskDirection;
  localAgentId: string;
  peerDid: string;
  peerAgentId: string;
  messageId: string;
  parentMessageId: string;
  kind: A2AMessageType;
  objective: string;
  input: Record<string, unknown>;
  requiredCapabilities: string[];
  budgetMicroUsd: number;
  status: "pending" | "accepted" | "rejected" | "running" | "completed" | "failed";
  receiptStatus: string;
  receiptMessageId: string;
  result: Record<string, unknown> | null;
  error: string | null;
  runId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface A2AReceiptRecord {
  id: string;
  uid: string;
  taskId: string;
  messageId: string;
  fromDid: string;
  status: string;
  detail: string;
  resultHash: string;
  signature: string;
  createdAt: string;
}

export interface A2AMessageRecord {
  id: string;
  uid: string;
  messageId: string;
  direction: A2ATaskDirection;
  type: A2AMessageType;
  fromDid: string;
  toDid: string;
  taskId: string;
  payloadHash: string;
  createdAt: string;
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

function agentRow(r: Row): A2AAgentRecord {
  return {
    id: text(r.id, 200),
    uid: text(r.uid, 200),
    agentId: text(r.agent_id, 200),
    did: text(r.did, 300),
    displayName: text(r.display_name, 200),
    role: text(r.role, 200),
    provider: text(r.provider, 80),
    model: text(r.model, 200),
    capabilities: normalizeCapabilities(json<unknown>(r.capabilities, [])),
    publicKey: validatePublicJwk(json<unknown>(r.public_key, null)) || { kty: "EC", crv: "P-256", x: "", y: "" },
    keyId: text(r.key_id, 80),
    status: r.status === "disabled" ? "disabled" : "active",
    createdAt: text(r.created_at, 40),
    updatedAt: text(r.updated_at, 40),
  };
}

function peerRow(r: Row): A2APeerRecord {
  return {
    id: text(r.id, 200),
    uid: text(r.uid, 200),
    did: text(r.did, 300),
    displayName: text(r.display_name, 200),
    endpoint: text(r.endpoint, 2000),
    publicKey: validatePublicJwk(json<unknown>(r.public_key, null)) || { kty: "EC", crv: "P-256", x: "", y: "" },
    keyId: text(r.key_id, 80),
    capabilities: normalizeCapabilities(json<unknown>(r.capabilities, [])),
    trustMode: r.trust_mode === "open" ? "open" : "pin",
    status: r.status === "disabled" ? "disabled" : "active",
    lastSeenAt: typeof r.last_seen_at === "string" ? r.last_seen_at : null,
    createdAt: text(r.created_at, 40),
    updatedAt: text(r.updated_at, 40),
  };
}

function taskRow(r: Row): A2ATaskRecord {
  const status = text(r.status, 32);
  return {
    id: text(r.id, 200),
    uid: text(r.uid, 200),
    direction: r.direction === "inbound" ? "inbound" : "outbound",
    localAgentId: text(r.local_agent_id, 200),
    peerDid: text(r.peer_did, 300),
    peerAgentId: text(r.peer_agent_id, 200),
    messageId: text(r.message_id, 200),
    parentMessageId: text(r.parent_message_id, 200),
    kind: (text(r.kind, 40) || "task.delegate") as A2AMessageType,
    objective: text(r.objective, 12_000),
    input: json<Record<string, unknown>>(r.input_json, {}),
    requiredCapabilities: normalizeCapabilities(json<unknown>(r.required_capabilities, [])),
    budgetMicroUsd: Number(r.budget_micro_usd) || 0,
    status: (["pending", "accepted", "rejected", "running", "completed", "failed"].includes(status)
      ? status : "pending") as A2ATaskRecord["status"],
    receiptStatus: text(r.receipt_status, 80),
    receiptMessageId: text(r.receipt_message_id, 200),
    result: typeof r.result_json === "string" && r.result_json ? json<Record<string, unknown>>(r.result_json, {}) : null,
    error: typeof r.error === "string" ? r.error : null,
    runId: typeof r.run_id === "string" && r.run_id ? r.run_id : null,
    createdAt: text(r.created_at, 40),
    updatedAt: text(r.updated_at, 40),
  };
}

function receiptRow(r: Row): A2AReceiptRecord {
  return {
    id: text(r.id, 200), uid: text(r.uid, 200), taskId: text(r.task_id, 200),
    messageId: text(r.message_id, 200), fromDid: text(r.from_did, 300),
    status: text(r.status, 80), detail: text(r.detail, 1000),
    resultHash: text(r.result_hash, 100), signature: text(r.signature, 300),
    createdAt: text(r.created_at, 40),
  };
}

function messageRow(r: Row): A2AMessageRecord {
  return {
    id: text(r.id, 200), uid: text(r.uid, 200), messageId: text(r.message_id, 200),
    direction: r.direction === "inbound" ? "inbound" : "outbound",
    type: (text(r.type, 40) || "error") as A2AMessageType,
    fromDid: text(r.from_did, 300), toDid: text(r.to_did, 300),
    taskId: text(r.task_id, 200), payloadHash: text(r.payload_hash, 100),
    createdAt: text(r.created_at, 40),
  };
}

/* -------------------------------------------------------------------------- */
/* agents                                                                     */
/* -------------------------------------------------------------------------- */

const AGENT_UPSERT = `INSERT INTO a2a_agents
  (id, uid, agent_id, did, display_name, role, provider, model, capabilities, public_key, key_id, status, created_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
  ON CONFLICT(id) DO UPDATE SET
    uid=excluded.uid, agent_id=excluded.agent_id, did=excluded.did,
    display_name=excluded.display_name, role=excluded.role,
    provider=excluded.provider, model=excluded.model,
    capabilities=excluded.capabilities, public_key=excluded.public_key,
    key_id=excluded.key_id, status=excluded.status, updated_at=excluded.updated_at`;

export async function upsertA2AAgent(input: A2AAgentRecord): Promise<A2AAgentRecord | null> {
  const handle = await db();
  if (!handle) return null;
  await handle.prepare(AGENT_UPSERT).bind(
    input.id, input.uid, input.agentId, input.did, input.displayName, input.role,
    input.provider, input.model, JSON.stringify(input.capabilities),
    JSON.stringify(input.publicKey), input.keyId, input.status,
    input.createdAt, input.updatedAt,
  ).run();
  return input;
}

export async function listA2AAgents(uid: string): Promise<A2AAgentRecord[]> {
  const handle = await db();
  if (!handle) return [];
  const { results } = await handle.prepare(
    "SELECT * FROM a2a_agents WHERE uid = ?1 ORDER BY updated_at DESC LIMIT 100",
  ).bind(uid).all<Row>();
  return results.filter((r) => r.uid === uid).map(agentRow);
}

export async function getA2AAgent(uid: string, id: string): Promise<A2AAgentRecord | null> {
  const handle = await db();
  if (!handle) return null;
  const row = await handle.prepare("SELECT * FROM a2a_agents WHERE id = ?1 LIMIT 1").bind(id).first<Row>();
  if (!row || row.uid !== uid) return null;
  return agentRow(row);
}

export async function findA2AAgentByDid(did: string): Promise<A2AAgentRecord | null> {
  const handle = await db();
  if (!handle) return null;
  const row = await handle.prepare("SELECT * FROM a2a_agents WHERE did = ?1 LIMIT 1").bind(did).first<Row>();
  if (!row || row.status === "disabled") return null;
  return agentRow(row);
}

export async function deleteA2AAgent(uid: string, id: string): Promise<boolean> {
  const existing = await getA2AAgent(uid, id);
  if (!existing) return false;
  const handle = await db();
  if (!handle) return false;
  await handle.prepare("DELETE FROM a2a_agents WHERE id = ?1").bind(id).run();
  return true;
}

/* -------------------------------------------------------------------------- */
/* peers                                                                      */
/* -------------------------------------------------------------------------- */

const PEER_UPSERT = `INSERT INTO a2a_peers
  (id, uid, did, display_name, endpoint, public_key, key_id, capabilities, trust_mode, status, last_seen_at, created_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
  ON CONFLICT(id) DO UPDATE SET
    uid=excluded.uid, did=excluded.did, display_name=excluded.display_name,
    endpoint=excluded.endpoint, public_key=excluded.public_key,
    key_id=excluded.key_id, capabilities=excluded.capabilities,
    trust_mode=excluded.trust_mode, status=excluded.status,
    last_seen_at=excluded.last_seen_at, updated_at=excluded.updated_at`;

export async function upsertA2APeer(input: A2APeerRecord): Promise<A2APeerRecord | null> {
  const handle = await db();
  if (!handle) return null;
  await handle.prepare(PEER_UPSERT).bind(
    input.id, input.uid, input.did, input.displayName, input.endpoint,
    JSON.stringify(input.publicKey), input.keyId, JSON.stringify(input.capabilities),
    input.trustMode, input.status, input.lastSeenAt, input.createdAt, input.updatedAt,
  ).run();
  return input;
}

export async function listA2APeers(uid: string): Promise<A2APeerRecord[]> {
  const handle = await db();
  if (!handle) return [];
  const { results } = await handle.prepare(
    "SELECT * FROM a2a_peers WHERE uid = ?1 ORDER BY updated_at DESC LIMIT 100",
  ).bind(uid).all<Row>();
  return results.filter((r) => r.uid === uid).map(peerRow);
}

export async function findA2APeerByDid(uid: string, did: string): Promise<A2APeerRecord | null> {
  const peers = await listA2APeers(uid);
  return peers.find((p) => p.did === did && p.status === "active") || null;
}

export async function deleteA2APeer(uid: string, id: string): Promise<boolean> {
  const peers = await listA2APeers(uid);
  if (!peers.some((p) => p.id === id)) return false;
  const handle = await db();
  if (!handle) return false;
  await handle.prepare("DELETE FROM a2a_peers WHERE id = ?1").bind(id).run();
  return true;
}

/* -------------------------------------------------------------------------- */
/* tasks                                                                      */
/* -------------------------------------------------------------------------- */

const TASK_UPSERT = `INSERT INTO a2a_tasks
  (id, uid, direction, local_agent_id, peer_did, peer_agent_id, message_id,
   parent_message_id, kind, objective, input_json, required_capabilities,
   budget_micro_usd, status, receipt_status, receipt_message_id, result_json,
   error, run_id, created_at, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
  ON CONFLICT(id) DO UPDATE SET
    uid=excluded.uid, direction=excluded.direction, local_agent_id=excluded.local_agent_id,
    peer_did=excluded.peer_did, peer_agent_id=excluded.peer_agent_id,
    message_id=excluded.message_id, parent_message_id=excluded.parent_message_id,
    kind=excluded.kind, objective=excluded.objective, input_json=excluded.input_json,
    required_capabilities=excluded.required_capabilities,
    budget_micro_usd=excluded.budget_micro_usd, status=excluded.status,
    receipt_status=excluded.receipt_status, receipt_message_id=excluded.receipt_message_id,
    result_json=excluded.result_json, error=excluded.error, run_id=excluded.run_id,
    updated_at=excluded.updated_at`;

export async function upsertA2ATask(input: A2ATaskRecord): Promise<A2ATaskRecord | null> {
  const handle = await db();
  if (!handle) return null;
  await handle.prepare(TASK_UPSERT).bind(
    input.id, input.uid, input.direction, input.localAgentId, input.peerDid,
    input.peerAgentId, input.messageId, input.parentMessageId, input.kind,
    input.objective, JSON.stringify(input.input), JSON.stringify(input.requiredCapabilities),
    input.budgetMicroUsd, input.status, input.receiptStatus, input.receiptMessageId,
    input.result ? JSON.stringify(input.result) : "", input.error, input.runId,
    input.createdAt, input.updatedAt,
  ).run();
  return input;
}

export async function listA2ATasks(uid: string): Promise<A2ATaskRecord[]> {
  const handle = await db();
  if (!handle) return [];
  const { results } = await handle.prepare(
    "SELECT * FROM a2a_tasks WHERE uid = ?1 ORDER BY updated_at DESC LIMIT 200",
  ).bind(uid).all<Row>();
  return results.filter((r) => r.uid === uid).map(taskRow);
}

export async function getA2ATask(uid: string, id: string): Promise<A2ATaskRecord | null> {
  const handle = await db();
  if (!handle) return null;
  const row = await handle.prepare("SELECT * FROM a2a_tasks WHERE id = ?1 LIMIT 1").bind(id).first<Row>();
  if (!row || row.uid !== uid) return null;
  return taskRow(row);
}

export async function findA2ATaskByMessage(uid: string, messageId: string): Promise<A2ATaskRecord | null> {
  const tasks = await listA2ATasks(uid);
  return tasks.find((t) => t.messageId === messageId) || null;
}

/* -------------------------------------------------------------------------- */
/* receipts and replay cache                                                  */
/* -------------------------------------------------------------------------- */

const RECEIPT_INSERT = `INSERT INTO a2a_receipts
  (id, uid, task_id, message_id, from_did, status, detail, result_hash, signature, created_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  ON CONFLICT(id) DO NOTHING`;

export async function insertA2AReceipt(input: A2AReceiptRecord): Promise<boolean> {
  const handle = await db();
  if (!handle) return false;
  await handle.prepare(RECEIPT_INSERT).bind(
    input.id, input.uid, input.taskId, input.messageId, input.fromDid,
    input.status, input.detail, input.resultHash, input.signature, input.createdAt,
  ).run();
  return true;
}

export async function listA2AReceipts(uid: string): Promise<A2AReceiptRecord[]> {
  const handle = await db();
  if (!handle) return [];
  const { results } = await handle.prepare(
    "SELECT * FROM a2a_receipts WHERE uid = ?1 ORDER BY created_at DESC LIMIT 200",
  ).bind(uid).all<Row>();
  return results.filter((r) => r.uid === uid).map(receiptRow);
}

const MESSAGE_INSERT = `INSERT INTO a2a_messages
  (id, uid, message_id, direction, type, from_did, to_did, task_id, payload_hash, created_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  ON CONFLICT(id) DO NOTHING`;

export async function hasA2AMessage(messageId: string): Promise<boolean> {
  const handle = await db();
  if (!handle) return false;
  const row = await handle.prepare("SELECT id FROM a2a_messages WHERE message_id = ?1 LIMIT 1").bind(messageId).first<Row>();
  return !!row;
}

export async function insertA2AMessage(input: A2AMessageRecord): Promise<boolean> {
  if (await hasA2AMessage(input.messageId)) return false;
  const handle = await db();
  if (!handle) return false;
  await handle.prepare(MESSAGE_INSERT).bind(
    input.id, input.uid, input.messageId, input.direction, input.type,
    input.fromDid, input.toDid, input.taskId, input.payloadHash, input.createdAt,
  ).run();
  return true;
}

export async function listA2AMessages(uid: string): Promise<A2AMessageRecord[]> {
  const handle = await db();
  if (!handle) return [];
  const { results } = await handle.prepare(
    "SELECT * FROM a2a_messages WHERE uid = ?1 ORDER BY created_at DESC LIMIT 200",
  ).bind(uid).all<Row>();
  return results.filter((r) => r.uid === uid).map(messageRow);
}

export async function a2aStorageReady(): Promise<boolean> {
  return !!(await db());
}
