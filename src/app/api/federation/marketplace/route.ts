import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { findA2APeerByDid, listA2AAgents } from "@/lib/a2a-store";
import {
  createSignedSkillPackage, importSignedSkillPackage, verifySignedSkillPackage,
} from "@/lib/federated-skills";
import {
  deleteFedSkillPackage, federationStorageReady, findFedSkillInstall,
  getFedSkillPackage, listFedSkillInstalls, listFedSkillPackages, upsertFedSkillInstall,
  upsertFedSkillPackage,
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
  const [packages, installs, agents, ready] = await Promise.all([
    listFedSkillPackages(user.id), listFedSkillInstalls(user.id),
    listA2AAgents(user.id), federationStorageReady(),
  ]);
  return NextResponse.json({
    ok: true,
    protocol: { name: "medusa-skill-marketplace", version: 1, storageReady: ready },
    packages, installs,
    agents: agents.map((a) => ({ id: a.id, agentId: a.agentId, did: a.did, status: a.status })),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = bodyObject(await req.json().catch(() => null));
  const action = clip(body.action, 40);
  const now = new Date().toISOString();

  if (action === "publish") {
    const agents = await listA2AAgents(user.id);
    const agentId = clip(body.agentId, 96)
      || agents.find((a) => a.status === "active")?.agentId
      || "";
    const agent = agents.find((a) => a.agentId === agentId && a.status === "active");
    if (!agent) return fail("Register an active local agent before publishing", 404);
    try {
      const { envelope, manifest, manifestHash } = await createSignedSkillPackage({
        uid: user.id,
        agentId,
        packageId: clip(body.packageId, 200),
        slug: clip(body.slug, 80),
        name: clip(body.name, 120),
        description: clip(body.description, 400),
        versionText: clip(body.versionText, 40),
        kind: clip(body.kind, 20) || "prompt",
        body: typeof body.body === "string" ? body.body : "",
        tests: body.tests,
        dna: bodyObject(body.dna),
        displayName: agent.displayName,
        role: agent.role,
        capabilities: agent.capabilities,
      });
      const record = {
        id: `fsp_${manifest.packageId}:${manifestHash.slice(0, 12)}`,
        uid: user.id,
        packageId: manifest.packageId,
        slug: manifest.slug,
        name: manifest.name,
        description: manifest.description,
        version: manifest.versionText,
        kind: manifest.kind,
        publisherDid: envelope.from.did,
        keyId: envelope.from.keyId,
        envelope,
        manifestHash,
        status: "published" as const,
        createdAt: now,
        updatedAt: now,
      };
      await upsertFedSkillPackage(record);
      return NextResponse.json({ ok: true, package: record, portable: JSON.stringify(envelope) });
    } catch (e) {
      return fail((e as Error).message || "Could not publish the skill package");
    }
  }

  if (action === "verify" || action === "import") {
    const peerDid = clip(body.peerDid, 300);
    const peer = peerDid ? await findA2APeerByDid(user.id, peerDid) : null;
    if (peerDid && !peer) return fail("Pinned peer not found", 404);
    const pin = peer ? { keyId: peer.keyId, publicKey: peer.publicKey } : null;
    const checked = await verifySignedSkillPackage(body.envelope, pin);
    if (!checked.ok || !checked.manifest || !checked.manifestHash || !checked.publisherDid) {
      if (action === "verify") return NextResponse.json(checked);
      return fail(checked.error || "Skill package verification failed");
    }
    if (action === "verify") return NextResponse.json(checked);

    const manifest = checked.manifest;
    const existing = await findFedSkillInstall(user.id, manifest.packageId);
    if (existing?.genomeId) {
      return NextResponse.json({ ok: true, genomeId: existing.genomeId, install: existing, duplicate: true });
    }
    try {
      const imported = await importSignedSkillPackage({
        uid: user.id,
        manifest,
        manifestHash: checked.manifestHash,
        publisherDid: checked.publisherDid,
        verification: checked.verification || "signature-only",
      });
      const install = {
        id: `fsi_${user.id}:${manifest.packageId}`,
        uid: user.id,
        packageId: manifest.packageId,
        publisherDid: checked.publisherDid,
        manifestHash: checked.manifestHash,
        verification: checked.verification || "signature-only" as const,
        genomeId: imported.genomeId,
        status: "candidate" as const,
        detail: `Imported v${imported.version} as a gated candidate genome entry`,
        createdAt: now,
        updatedAt: now,
      };
      await upsertFedSkillInstall(install);
      return NextResponse.json({ ok: true, ...imported, install });
    } catch (e) {
      return fail((e as Error).message || "Could not import the skill package");
    }
  }

  if (action === "export") {
    const pkg = await getFedSkillPackage(user.id, clip(body.id, 200));
    if (!pkg?.envelope) return fail("Package not found", 404);
    return NextResponse.json({ ok: true, portable: JSON.stringify(pkg.envelope) });
  }

  if (action === "delete") {
    const ok = await deleteFedSkillPackage(user.id, clip(body.id, 200));
    return ok ? NextResponse.json({ ok: true }) : fail("Package not found", 404);
  }

  return fail("Unknown action");
}
