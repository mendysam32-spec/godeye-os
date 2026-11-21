import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { didFor, validatePublicJwk } from "@/lib/a2a";
import { deliverA2A } from "@/lib/a2a-delivery";
import { findA2APeerByDid, listA2AAgents, listA2APeers } from "@/lib/a2a-store";
import {
  createMemoryGrant, FED_DEFAULT_TTL_MS, importMemoryGrant, normalizeScope,
  readGrantPayload,
} from "@/lib/federated-memory";
import {
  deleteFedEncryptionKey, deleteFedMemoryGrant, federationStorageReady, findFedEncryptionKeyByDid,
  getFedMemoryGrant, listFedEncryptionKeys, listFedMemoryGrants,
  upsertFedEncryptionKey, upsertFedMemoryGrant,
} from "@/lib/federation-store";

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
  const [grants, keys, agents, peers, ready] = await Promise.all([
    listFedMemoryGrants(user.id), listFedEncryptionKeys(user.id),
    listA2AAgents(user.id), listA2APeers(user.id), federationStorageReady(),
  ]);
  return NextResponse.json({
    ok: true,
    protocol: { name: "medusa-federated-memory", version: 1, storageReady: ready },
    grants, keys,
    agents: agents.map((a) => ({ id: a.id, agentId: a.agentId, did: a.did, capabilities: a.capabilities })),
    peers: peers.map((p) => ({ id: p.id, did: p.did, displayName: p.displayName, trustMode: p.trustMode })),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = bodyObject(await req.json().catch(() => null));
  const action = clip(body.action, 40);
  const now = new Date().toISOString();

  if (action === "pin-key") {
    const did = clip(body.did, 300);
    const keyId = clip(body.keyId, 80);
    const publicKey = validatePublicJwk(body.publicKey);
    if (!/^did:medusa:[^\s]{3,300}$/.test(did)) return fail("A valid peer DID is required");
    if (!keyId || !publicKey) return fail("A valid P-256 public JWK and keyId are required");
    const record = {
      id: `fek_${user.id}:${did}`,
      uid: user.id,
      did,
      agentId: "",
      keyId,
      publicKey,
      trustMode: "pin" as const,
      createdAt: now,
      updatedAt: now,
    };
    await upsertFedEncryptionKey(record);
    return NextResponse.json({ ok: true, key: record });
  }

  if (action === "delete-key") {
    const ok = await deleteFedEncryptionKey(user.id, clip(body.id, 300));
    return ok ? NextResponse.json({ ok: true }) : fail("Key not found", 404);
  }

  if (action === "issue-grant") {
    const agentId = clip(body.agentId, 96);
    const peerDid = clip(body.peerDid, 300);
    const agent = (await listA2AAgents(user.id)).find((a) => a.agentId === agentId && a.status === "active");
    if (!agent || agent.did !== didFor(user.id, agentId)) return fail("A registered local agent is required", 404);
    const peer = await findA2APeerByDid(user.id, peerDid);
    if (!peer) return fail("A pinned, active peer is required", 404);
    const peerKey = await findFedEncryptionKeyByDid(user.id, peerDid);
    if (!peerKey) return fail("Pin the peer's encryption key from its manifest first", 404);

    const ttlMinutes = Number(body.ttlMinutes);
    const ttlMs = Number.isFinite(ttlMinutes) && ttlMinutes > 0
      ? Math.floor(ttlMinutes) * 60_000 : FED_DEFAULT_TTL_MS;
    let created;
    try {
      created = await createMemoryGrant({
        uid: user.id,
        agentId,
        peerDid,
        peerAgentId: "",
        peerEncryptionKey: { publicJwk: peerKey.publicKey, keyId: peerKey.keyId },
        resourceKind: clip(body.resourceKind, 40) || "graph",
        resourceId: clip(body.resourceId, 200),
        capability: clip(body.capability, 80) || "memory.query",
        scope: normalizeScope(body.scope),
        ttlMs,
        displayName: agent.displayName,
        role: agent.role,
        capabilities: agent.capabilities,
      });
    } catch (e) {
      return fail((e as Error).message || "Could not build the memory grant");
    }

    const delivery = await deliverA2A(peer, created.envelope, didFor(user.id, agentId));
    if (!delivery.ok) return fail(delivery.error || "Grant delivery failed", 502);

    const grant = {
      id: `fmg_out_${created.grantId}`,
      uid: user.id,
      direction: "issued" as const,
      grantId: created.grantId,
      resourceKind: clip(body.resourceKind, 40) || "graph",
      resourceId: clip(body.resourceId, 200),
      localAgentId: agentId,
      peerDid,
      peerAgentId: "",
      capability: clip(body.capability, 80) || "memory.query",
      scope: created.scope,
      sealed: created.sealed as unknown as Record<string, unknown>,
      envelope: created.envelope,
      bundleHash: created.bundleHash,
      messageId: created.envelope.id,
      expiresAt: created.expiresAt,
      status: "active" as const,
      importedBranchId: "",
      createdAt: now,
      updatedAt: now,
    };
    await upsertFedMemoryGrant(grant);
    return NextResponse.json({
      ok: true, grant, delivery: { ok: true, status: delivery.status, detail: delivery.detail },
      nodeCount: created.nodeCount, linkCount: created.linkCount,
    });
  }

  if (action === "import-grant") {
    const grant = await getFedMemoryGrant(user.id, clip(body.id, 200));
    if (!grant || grant.direction !== "received") return fail("Received grant not found", 404);
    if (grant.status !== "active") return fail(`Grant is ${grant.status}`);
    if (Date.parse(grant.expiresAt) <= Date.now()) return fail("Grant has expired");
    if (!grant.envelope) return fail("Grant is missing its signed envelope");
    let payload;
    try {
      payload = readGrantPayload(grant.envelope);
    } catch (e) {
      return fail((e as Error).message || "Invalid grant envelope");
    }
    if (grant.bundleHash && payload.bundleHash !== grant.bundleHash) return fail("Grant bundle hash mismatch");
    let result;
    try {
      result = await importMemoryGrant({
        uid: user.id,
        recipientAgentId: grant.localAgentId || grant.peerAgentId,
        grantId: grant.grantId,
        peerDid: grant.peerDid,
        sealed: grant.sealed as never,
        context: `memory-grant:${grant.grantId}`,
        expectedOwnerDid: grant.envelope.from.did,
      });
    } catch (e) {
      return fail((e as Error).message || "Could not import the memory grant");
    }
    await upsertFedMemoryGrant({
      ...grant,
      status: "imported",
      importedBranchId: result.branchId,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "revoke-grant") {
    const grant = await getFedMemoryGrant(user.id, clip(body.id, 200));
    if (!grant || grant.direction !== "issued") return fail("Issued grant not found", 404);
    await upsertFedMemoryGrant({ ...grant, status: "revoked", updatedAt: now });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete-grant") {
    const ok = await deleteFedMemoryGrant(user.id, clip(body.id, 200));
    return ok ? NextResponse.json({ ok: true }) : fail("Grant not found", 404);
  }

  return fail("Unknown action");
}
