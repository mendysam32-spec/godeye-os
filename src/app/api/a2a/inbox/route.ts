import { NextRequest, NextResponse } from "next/server";
import {
  canonicalJson, createEnvelope, didParts, localIdentity,
  missingCapabilities, normalizeCapabilities, verifyEnvelope,
  type A2AEnvelope,
} from "@/lib/a2a";
import { peerKeyMatches } from "@/lib/a2a-delivery";
import {
  findA2AAgentByDid, findA2APeerByDid, findA2ATaskByMessage, getA2ATask,
  hasA2AMessage, insertA2AReceipt, insertA2AMessage, listA2AReceipts,
  upsertA2APeer, upsertA2ATask, type A2AAgentRecord, type A2ATaskRecord,
} from "@/lib/a2a-store";

/**
 * Unauthenticated federation inbox. Callers authenticate with a signed A2A
 * envelope whose recipient is a registered local agent and whose sender is a
 * pinned peer. No request body is interpreted as code or endpoint authority.
 */

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, max = 1000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

async function makeReceipt(
  agent: A2AAgentRecord,
  senderDid: string,
  senderAgentId: string,
  payload: Record<string, unknown>,
): Promise<A2AEnvelope> {
  const messageId = text(payload.messageId, 200);
  const receipt = await createEnvelope({
    uid: agent.uid,
    agentId: agent.agentId,
    type: "task.receipt",
    to: { did: senderDid, agentId: senderAgentId || didParts(senderDid)?.agentId },
    payload,
    displayName: agent.displayName,
    role: agent.role,
    capabilities: agent.capabilities,
  });
  await insertA2AReceipt({
    id: `arc_in_${messageId}`,
    uid: agent.uid,
    taskId: text(payload.taskId, 200),
    messageId,
    fromDid: agent.did,
    status: text(payload.status, 80),
    detail: text(payload.detail, 1000),
    resultHash: text(payload.resultHash, 100),
    signature: receipt.signature.value,
    createdAt: new Date().toISOString(),
  });
  return receipt;
}

export async function POST(req: NextRequest) {
  const verified = await verifyEnvelope(await req.json().catch(() => null));
  if (!verified.ok || !verified.envelope) return fail(verified.error || "Invalid envelope", 401);
  const envelope = verified.envelope;

  const recipient = didParts(envelope.to.did);
  if (!recipient || (envelope.to.agentId && envelope.to.agentId !== recipient.agentId)) {
    return fail("Invalid recipient DID");
  }
  const agent = await findA2AAgentByDid(envelope.to.did);
  if (!agent || agent.uid !== recipient.uid || agent.agentId !== recipient.agentId) {
    return fail("Recipient agent is not registered or is disabled", 404);
  }
  if (envelope.from.did === envelope.to.did) return fail("An agent cannot delegate to itself");

  // A deployment secret change invalidates previously published identities.
  const identity = await localIdentity(agent.uid, agent.agentId, {
    displayName: agent.displayName, role: agent.role, capabilities: agent.capabilities,
  });
  if (identity.keyId !== agent.keyId || canonicalJson(identity.publicKey) !== canonicalJson(agent.publicKey)) {
    return fail("Local agent key no longer matches its published manifest", 503);
  }

  const peer = await findA2APeerByDid(agent.uid, envelope.from.did);
  if (!peer) return fail("Sender is not a registered peer", 401);
  if (!peerKeyMatches(peer, envelope)) return fail("Sender key does not match the pinned peer key", 401);

  const now = new Date().toISOString();
  const senderDid = envelope.from.did;
  const senderAgentId = envelope.from.agentId || didParts(senderDid)?.agentId || "";
  await upsertA2APeer({ ...peer, lastSeenAt: now, updatedAt: now });

  const recordInbound = (taskId: string) => insertA2AMessage({
    id: `amsg_in_${envelope.id}`,
    uid: agent.uid,
    messageId: envelope.id,
    direction: "inbound",
    type: envelope.type,
    fromDid: senderDid,
    toDid: agent.did,
    taskId,
    payloadHash: envelope.payloadHash,
    createdAt: now,
  });

  if (await hasA2AMessage(envelope.id)) {
    const prior = (await listA2AReceipts(agent.uid)).find(
      (r) => r.messageId === envelope.id && r.fromDid === agent.did,
    );
    const receipt = await makeReceipt(agent, senderDid, senderAgentId, {
      taskId: prior?.taskId || "",
      messageId: envelope.id,
      status: "duplicate",
      detail: prior ? `Already processed as ${prior.status}` : "Duplicate delivery ignored",
      payloadHash: envelope.payloadHash,
    });
    return NextResponse.json({ ok: true, duplicate: true, receipt });
  }

  const reject = async (detail: string, taskId = "") => {
    const receipt = await makeReceipt(agent, senderDid, senderAgentId, {
      taskId,
      messageId: envelope.id,
      status: "rejected",
      detail,
      payloadHash: envelope.payloadHash,
    });
    await recordInbound(taskId);
    return NextResponse.json({ ok: true, taskId, status: "rejected", detail, receipt });
  };

  const payload = envelope.payload;

  if (envelope.type === "task.delegate") {
    const peerTaskId = text(payload.taskId, 200);
    if (!/^tsk_[A-Za-z0-9_-]{4,120}$/.test(peerTaskId)) {
      return reject("A valid taskId is required", "");
    }
    const objective = text(payload.objective, 12_000).trim();
    if (!objective) return reject("A declarative objective is required", peerTaskId);

    const required = normalizeCapabilities(payload.requiredCapabilities);
    const missing = missingCapabilities(required, agent.capabilities);
    if (missing.length) return reject(`Recipient does not advertise: ${missing.join(", ")}`, peerTaskId);

    const input = { ...obj(payload.input), peerTaskId };
    const budgetRaw = Number(payload.budgetMicroUsd);
    const budgetMicroUsd = Number.isFinite(budgetRaw)
      ? Math.min(1_000_000_000, Math.max(0, Math.floor(budgetRaw)))
      : 0;
    const localTaskId = `tsk_in_${envelope.id}`;
    const receipt = await makeReceipt(agent, senderDid, senderAgentId, {
      taskId: localTaskId,
      messageId: envelope.id,
      status: "accepted",
      detail: "Delegation accepted for local execution",
      payloadHash: envelope.payloadHash,
    });
    const task: A2ATaskRecord = {
      id: localTaskId,
      uid: agent.uid,
      direction: "inbound",
      localAgentId: agent.agentId,
      peerDid: senderDid,
      peerAgentId: senderAgentId,
      messageId: envelope.id,
      parentMessageId: peerTaskId,
      kind: "task.delegate",
      objective,
      input,
      requiredCapabilities: required,
      budgetMicroUsd,
      status: "accepted",
      receiptStatus: "accepted",
      receiptMessageId: receipt.id,
      result: null,
      error: null,
      runId: null,
      createdAt: now,
      updatedAt: now,
    };
    await upsertA2ATask(task);
    await recordInbound(localTaskId);
    return NextResponse.json({ ok: true, taskId: localTaskId, status: "accepted", receipt });
  }

  if (envelope.type === "hello" || envelope.type === "capability.query") {
    const requested = normalizeCapabilities(payload.capabilities);
    const matched = requested.filter((cap) => agent.capabilities.includes(cap));
    const missing = missingCapabilities(requested, agent.capabilities);
    const reply = await createEnvelope({
      uid: agent.uid,
      agentId: agent.agentId,
      type: "hello",
      to: { did: senderDid, agentId: senderAgentId },
      payload: {
        status: "ok",
        did: agent.did,
        capabilities: agent.capabilities,
        requested,
        matched,
        missing,
      },
      displayName: agent.displayName,
      role: agent.role,
      capabilities: agent.capabilities,
    });
    const receipt = await makeReceipt(agent, senderDid, senderAgentId, {
      messageId: envelope.id,
      status: "accepted",
      detail: requested.length
        ? `${matched.length}/${requested.length} requested capabilities matched`
        : "Hello acknowledged",
      payloadHash: envelope.payloadHash,
    });
    await recordInbound("");
    await insertA2AMessage({
      id: `amsg_out_${reply.id}`,
      uid: agent.uid,
      messageId: reply.id,
      direction: "outbound",
      type: "hello",
      fromDid: agent.did,
      toDid: senderDid,
      taskId: "",
      payloadHash: reply.payloadHash,
      createdAt: now,
    });
    return NextResponse.json({ ok: true, reply, receipt });
  }

  if (envelope.type === "task.status" || envelope.type === "task.result" || envelope.type === "task.receipt") {
    const reference = text(payload.messageId, 200) || text(payload.taskId, 200);
    const task = reference
      ? (await getA2ATask(agent.uid, reference)) || (await findA2ATaskByMessage(agent.uid, reference))
      : null;
    if (!task) return reject("No matching A2A task was found", text(payload.taskId, 200));

    const allowed: A2ATaskRecord["status"][] = ["pending", "accepted", "rejected", "running", "completed", "failed"];
    const rawStatus = text(payload.status, 32) as A2ATaskRecord["status"];
    const status: A2ATaskRecord["status"] = envelope.type === "task.result"
      ? (rawStatus === "failed" ? "failed" : "completed")
      : allowed.includes(rawStatus) ? rawStatus : "running";
    const updated: A2ATaskRecord = {
      ...task,
      status,
      result: envelope.type === "task.result" ? obj(payload.result) : task.result,
      error: text(payload.error || payload.detail, 1000) || null,
      runId: text(payload.runId, 200) || task.runId,
      receiptStatus: status,
      receiptMessageId: envelope.id,
      updatedAt: now,
    };
    await upsertA2ATask(updated);
    const receipt = await makeReceipt(agent, senderDid, senderAgentId, {
      taskId: task.id,
      messageId: envelope.id,
      status: "accepted",
      detail: `Task status ${status} recorded`,
      payloadHash: envelope.payloadHash,
    });
    await recordInbound(task.id);
    return NextResponse.json({ ok: true, taskId: task.id, status, receipt });
  }

  // `error` and any future declarative message type are recorded, never executed.
  const detail = text(payload.detail || payload.message, 1000) || "Peer error recorded";
  const receipt = await makeReceipt(agent, senderDid, senderAgentId, {
    messageId: envelope.id,
    status: "recorded",
    detail,
    payloadHash: envelope.payloadHash,
  });
  await recordInbound("");
  return NextResponse.json({ ok: true, status: "recorded", detail, receipt });
}
