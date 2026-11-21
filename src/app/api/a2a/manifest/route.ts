import { NextRequest, NextResponse } from "next/server";
import { A2A_PROTOCOL, A2A_VERSION, signingConfigured } from "@/lib/a2a";
import { findA2AAgentByDid } from "@/lib/a2a-store";

/** Public discovery document for one registered local agent. No auth, no secrets. */
export async function GET(req: NextRequest) {
  const did = (req.nextUrl.searchParams.get("did") || "").trim().slice(0, 300);
  if (!did) return NextResponse.json({ ok: false, error: "did is required" }, { status: 400 });
  const agent = await findA2AAgentByDid(did);
  if (!agent) return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    protocol: { name: A2A_PROTOCOL, version: A2A_VERSION },
    agent: {
      did: agent.did,
      agentId: agent.agentId,
      displayName: agent.displayName,
      role: agent.role,
      capabilities: agent.capabilities,
      keyId: agent.keyId,
      publicKey: agent.publicKey,
      status: agent.status,
      updatedAt: agent.updatedAt,
    },
    signing: {
      alg: "ES256",
      curve: "P-256",
      canonicalization: "sorted-keys-json",
      configured: signingConfigured(),
    },
    endpoints: {
      manifest: "/api/a2a/manifest?did=<agent-did>",
      inbox: "/api/a2a/inbox",
      spec: "/api/a2a/spec",
    },
    transports: ["https-json-post"],
  });
}
