import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  A2A_PROTOCOL, A2A_VERSION, createEnvelope, didFor, didParts, fingerprintJwk,
  hashJson, localIdentity, missingCapabilities, normalizeCapabilities, parsePublicJwk,
  safeA2AJson, signingConfigured, validatePublicJwk,
} from "@/lib/a2a";
import { deliverA2A } from "@/lib/a2a-delivery";
import {
  a2aStorageReady, deleteA2AAgent, deleteA2APeer, findA2APeerByDid, getA2AAgent,
  insertA2AReceipt, insertA2AMessage, listA2AAgents, listA2AMessages, listA2APeers,
  listA2AReceipts, listA2ATasks, upsertA2AAgent, upsertA2APeer, upsertA2ATask,
  type A2AAgentRecord, type A2APeerRecord, type A2ATaskRecord,
} from "@/lib/a2a-store";
import { endpointAllowsLocal, validateProviderEndpoint } from "@/lib/provider-endpoints";
import { isProviderId } from "@/lib/providers";

function clip(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function bodyObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const [agents, peers, tasks, receipts, messages, ready] = await Promise.all([
    listA2AAgents(user.id), listA2APeers(user.id), listA2ATasks(user.id),
    listA2AReceipts(user.id), listA2AMessages(user.id), a2aStorageReady(),
  ]);
  return NextResponse.json({
    ok: true,
    protocol: {
      name: A2A_PROTOCOL,
      version: A2A_VERSION,
      signingConfigured: signingConfigured(),
      localEndpointsAllowed: endpointAllowsLocal(),
      storageReady: ready,
      endpoints: {
        manifest: "/api/a2a/manifest?did=<did:medusa:...>",
        inbox: "/api/a2a/inbox",
        spec: "/api/a2a/spec",
      },
    },
    agents, peers, tasks, receipts, messages,
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = bodyObject(await req.json().catch(() => null));
  const action = clip(body.action, 40);

  if (action === "register-agent") {
    const agentId = clip(body.agentId, 96);
    if (!/^[A-Za-z0-9_-]{1,96}$/.test(agentId)) return fail("agentId may only contain letters, numbers, _ and -");
    const capabilities = normalizeCapabilities(body.capabilities);
    const identity = await localIdentity(user.id, agentId, {
      displayName: clip(body.displayName, 80),
      role: clip(body.role, 80),
      capabilities,
    });
    const existing = await getA2AAgent(user.id, `aga_${user.id}:${agentId}`);
    const now = new Date().toISOString();
    const record: A2AAgentRecord = {
      id: `aga_${user.id}:${agentId}`,
      uid: user.id,
      agentId,
      did: didFor(user.id, agentId),
      displayName: identity.displayName,
      role: identity.role,
      provider: isProviderId(body.provider) ? body.provider : "",
      model: clip(body.model, 200),
      capabilities,
      publicKey: identity.publicKey,
      keyId: identity.keyId,
      status: body.status === "disabled" ? "disabled" : "active",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await upsertA2AAgent(record);
    return NextResponse.json({ ok: true, agent: record });
  }

  if (action === "delete-agent") {
    const ok = await deleteA2AAgent(user.id, clip(body.id, 300));
    return ok ? NextResponse.json({ ok: true }) : fail("Agent not found", 404);
  }

  if (action === "register-peer") {
    const did = clip(body.did, 300);
    const parts = didParts(did);
    if (!parts) return fail("Peer DID must be did:medusa:<uid>:<agentId>");
    const endpoint = clip(body.endpoint, 2000);
    const validated = validateProviderEndpoint(endpoint, { allowLocal: endpointAllowsLocal() });
    if (!validated.ok) return fail(`Invalid peer endpoint: ${validated.error}`);
    const publicKey = validatePublicJwk(body.publicKey) || (typeof body.publicKey === "string" ? parsePublicJwk(body.publicKey) : null);
    if (!publicKey) return fail("publicKey must be a P-256 public JWK without private fields");
    const keyId = await fingerprintJwk(publicKey);
    const existing = await listA2APeers(user.id);
    const id = `ape_${user.id}:${encodeURIComponent(did)}`;
    const now = new Date().toISOString();
    const record: A2APeerRecord = {
      id,
      uid: user.id,
      did,
      displayName: clip(body.displayName, 80) || parts.agentId,
      endpoint: validated.url,
      publicKey,
      keyId,
      capabilities: normalizeCapabilities(body.capabilities),
      trustMode: body.trustMode === "open" ? "open" : "pin",
      status: body.status === "disabled" ? "disabled" : "active",
      lastSeenAt: existing.find((p) => p.id === id)?.lastSeenAt || null,
      createdAt: existing.find((p) => p.id === id)?.createdAt || now,
      updatedAt: now,
    };
    await upsertA2APeer(record);
    return NextResponse.json({ ok: true, peer: record });
  }

  if (action === "delete-peer") {
    const ok = await deleteA2APeer(user.id, clip(body.id, 400));
    return ok ? NextResponse.json({ ok: true }) : fail("Peer not found", 404);
  }

  if (action === "import-peer") {
    const did = clip(body.did, 300);
    if (!didParts(did)) return fail("Peer DID must be did:medusa:<uid>:<agentId>");
    const endpoint = clip(body.endpoint, 2000);
    const validated = validateProviderEndpoint(endpoint, { allowLocal: endpointAllowsLocal() });
    if (!validated.ok) return fail(`Invalid peer endpoint: ${validated.error}`);

    let manifest: Record<string, unknown>;
    try {
      const res = await fetch(
        `${validated.url}/api/a2a/manifest?did=${encodeURIComponent(did)}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000), cache: "no-store" },
      );
      if (!res.ok) return fail(`Peer manifest returned HTTP ${res.status}`, 502);
      manifest = bodyObject(await res.json().catch(() => null));
    } catch (e) {
      return fail(`Could not fetch peer manifest: ${(e as Error)?.message || "unknown error"}`, 502);
    }
    const protocol = bodyObject(manifest.protocol);
    if (manifest.ok !== true || protocol.name !== A2A_PROTOCOL || protocol.version !== A2A_VERSION) {
      return fail("Peer manifest is not a supported MEDUSA A2A manifest", 502);
    }
    const peerAgent = bodyObject(manifest.agent);
    if (peerAgent.did !== did) return fail("Peer manifest DID does not match the requested DID", 502);
    const publicKey = validatePublicJwk(peerAgent.publicKey);
    if (!publicKey) return fail("Peer manifest has an invalid public key", 502);
    if (peerAgent.keyId !== await fingerprintJwk(publicKey)) {
      return fail("Peer manifest key id does not match its public key", 502);
    }

    const id = `ape_${user.id}:${encodeURIComponent(did)}`;
    const current = (await listA2APeers(user.id)).find((p) => p.id === id);
    const now = new Date().toISOString();
    const peer: A2APeerRecord = {
      id,
      uid: user.id,
      did,
      displayName: clip(peerAgent.displayName, 80) || didParts(did)!.agentId,
      endpoint: validated.url,
      publicKey,
      keyId: peerAgent.keyId as string,
      capabilities: normalizeCapabilities(peerAgent.capabilities),
      trustMode: "pin",
      status: "active",
      lastSeenAt: current?.lastSeenAt || null,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    await upsertA2APeer(peer);
    return NextResponse.json({ ok: true, peer, manifest });
  }

  if (action === "probe-peer") {
    const agent = await getA2AAgent(user.id, clip(body.agentId, 300));
    if (!agent || agent.status !== "active") return fail("Local agent not found or disabled", 404);
    if (!signingConfigured()) return fail("A2A_SIGNING_SECRET is not configured in this deployment", 503);
    const peer = await findA2APeerByDid(user.id, clip(body.peerDid, 300));
    if (!peer) return fail("Peer not found or disabled", 404);

    let envelope;
    try {
      envelope = await createEnvelope({
        uid: user.id,
        agentId: agent.agentId,
        type: "capability.query",
        to: { did: peer.did, agentId: didParts(peer.did)?.agentId },
        capabilities: agent.capabilities,
        displayName: agent.displayName,
        role: agent.role,
        payload: { capabilities: normalizeCapabilities(body.capabilities) },
      });
    } catch (e) {
      return fail((e as Error).message);
    }
    const delivered = await deliverA2A(peer, envelope, agent.did);
    if (!delivered.ok) return fail(delivered.error || "Peer probe failed", 502);

    const now = new Date().toISOString();
    const offered = delivered.reply
      ? normalizeCapabilities((delivered.reply.payload as Record<string, unknown>).capabilities)
      : peer.capabilities;
    const updated: A2APeerRecord = {
      ...peer,
      capabilities: offered.length ? offered : peer.capabilities,
      lastSeenAt: now,
      updatedAt: now,
    };
    await upsertA2APeer(updated);
    await insertA2AMessage({
      id: `amsg_out_${envelope.id}`,
      uid: user.id,
      messageId: envelope.id,
      direction: "outbound",
      type: "capability.query",
      fromDid: agent.did,
      toDid: peer.did,
      taskId: "",
      payloadHash: envelope.payloadHash,
      createdAt: now,
    });
    if (delivered.receipt) {
      await insertA2AReceipt({
        id: `arc_probe_${envelope.id}`,
        uid: user.id,
        taskId: "",
        messageId: envelope.id,
        fromDid: peer.did,
        status: delivered.status || "accepted",
        detail: delivered.detail || "",
        resultHash: await hashJson(delivered.receipt.payload),
        signature: delivered.receipt.signature.value,
        createdAt: now,
      });
    }
    if (delivered.reply) {
      await insertA2AMessage({
        id: `amsg_in_${delivered.reply.id}`,
        uid: user.id,
        messageId: delivered.reply.id,
        direction: "inbound",
        type: "hello",
        fromDid: peer.did,
        toDid: agent.did,
        taskId: "",
        payloadHash: delivered.reply.payloadHash,
        createdAt: now,
      });
    }
    return NextResponse.json({ ok: true, peer: updated, reply: delivered.reply || null, receipt: delivered.receipt || null });
  }

  if (action === "send-delegation") {
    const agent = await getA2AAgent(user.id, clip(body.agentId, 300));
    if (!agent || agent.status !== "active") return fail("Local agent not found or disabled", 404);
    if (!signingConfigured()) return fail("A2A_SIGNING_SECRET is not configured in this deployment", 503);
    const peer = await findA2APeerByDid(user.id, clip(body.peerDid, 300));
    if (!peer) return fail("Peer not found or disabled", 404);

    const objective = clip(body.objective, 8_000);
    if (!objective) return fail("objective is required");
    const required = normalizeCapabilities(body.requiredCapabilities);
    const missing = missingCapabilities(required, peer.capabilities);
    if (missing.length) return fail(`Peer does not advertise: ${missing.join(", ")}`);

    const budgetRaw = Number(body.budgetUsd);
    const budgetUsd = Number.isFinite(budgetRaw) ? Math.min(1_000, Math.max(0, budgetRaw)) : 0;
    const budgetMicroUsd = Math.round(budgetUsd * 1_000_000);
    let input: Record<string, unknown>;
    try {
      input = safeA2AJson(body.input ?? {});
    } catch (e) {
      return fail((e as Error).message);
    }

    const taskId = `tsk_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    let envelope;
    try {
      envelope = await createEnvelope({
        uid: user.id,
        agentId: agent.agentId,
        type: "task.delegate",
        to: { did: peer.did, agentId: didParts(peer.did)?.agentId },
        ttlMs: Number.isFinite(Number(body.ttlMs)) ? Number(body.ttlMs) : undefined,
        displayName: agent.displayName,
        role: agent.role,
        capabilities: agent.capabilities,
        payload: { taskId, objective, input, requiredCapabilities: required, budgetMicroUsd },
      });
    } catch (e) {
      return fail((e as Error).message);
    }

    const task: A2ATaskRecord = {
      id: taskId,
      uid: user.id,
      direction: "outbound",
      localAgentId: agent.agentId,
      peerDid: peer.did,
      peerAgentId: didParts(peer.did)?.agentId || "",
      messageId: envelope.id,
      parentMessageId: "",
      kind: "task.delegate",
      objective,
      input,
      requiredCapabilities: required,
      budgetMicroUsd,
      status: "pending",
      receiptStatus: "",
      receiptMessageId: "",
      result: null,
      error: null,
      runId: null,
      createdAt: now,
      updatedAt: now,
    };

    const delivered = await deliverA2A(peer, envelope, agent.did);
    task.status = delivered.ok
      ? (delivered.status === "rejected" ? "rejected" : "accepted")
      : "failed";
    task.receiptStatus = delivered.status || "";
    task.receiptMessageId = delivered.receipt?.id || "";
    task.error = delivered.error || (delivered.status === "rejected" ? delivered.detail || "Peer rejected delegation" : null);
    task.updatedAt = new Date().toISOString();
    await upsertA2ATask(task);
    await insertA2AMessage({
      id: `amsg_out_${envelope.id}`,
      uid: user.id,
      messageId: envelope.id,
      direction: "outbound",
      type: "task.delegate",
      fromDid: agent.did,
      toDid: peer.did,
      taskId,
      payloadHash: envelope.payloadHash,
      createdAt: now,
    });
    if (delivered.receipt) {
      await insertA2AReceipt({
        id: `arc_${envelope.id}`,
        uid: user.id,
        taskId,
        messageId: envelope.id,
        fromDid: peer.did,
        status: delivered.status || "accepted",
        detail: delivered.detail || "",
        resultHash: await hashJson(delivered.receipt.payload),
        signature: delivered.receipt.signature.value,
        createdAt: now,
      });
    }
    return NextResponse.json({
      ok: delivered.ok,
      task,
      error: delivered.error || null,
      receipt: delivered.receipt || null,
    }, { status: delivered.ok ? 200 : 502 });
  }

  return fail("Unknown action");
}
