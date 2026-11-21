/**
 * Federated delivery for the open A2A protocol.
 *
 * Peer endpoints get the same server-side SSRF treatment as provider endpoints.
 * Receipts are verified and pinned to the registered peer key before a task is
 * marked as delivered — a hostile endpoint cannot simply claim success.
 */

import { canonicalJson, verifyEnvelope, type A2AEnvelope } from "./a2a";
import type { A2APeerRecord } from "./a2a-store";
import { endpointAllowsLocal, validateProviderEndpoint } from "./provider-endpoints";

export interface A2ADeliveryResult {
  ok: boolean;
  error?: string;
  receipt?: A2AEnvelope;
  reply?: A2AEnvelope;
  status?: string;
  detail?: string;
}

export function peerKeyMatches(peer: A2APeerRecord, envelope: A2AEnvelope): boolean {
  if (peer.trustMode !== "pin") return true;
  if (peer.keyId !== envelope.from.keyId) return false;
  return canonicalJson(peer.publicKey) === canonicalJson(envelope.from.publicKey);
}

export async function deliverA2A(
  peer: A2APeerRecord,
  envelope: A2AEnvelope,
  senderDid: string,
): Promise<A2ADeliveryResult> {
  if (peer.status !== "active") return { ok: false, error: "Peer is disabled" };
  const endpoint = validateProviderEndpoint(peer.endpoint, { allowLocal: endpointAllowsLocal() });
  if (!endpoint.ok) return { ok: false, error: `Invalid peer endpoint: ${endpoint.error}` };

  let response: Response;
  try {
    response = await fetch(`${endpoint.url.replace(/\/+$/, "")}/api/a2a/inbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Peer delivery failed" };
  }

  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !body?.ok) {
    const error = typeof body?.error === "string" ? body.error : `Peer returned HTTP ${response.status}`;
    return { ok: false, error };
  }
  if (!body.receipt) return { ok: false, error: "Peer did not return a signed receipt" };

  const verified = await verifyEnvelope(body.receipt);
  if (!verified.ok || !verified.envelope) return { ok: false, error: `Invalid receipt: ${verified.error}` };
  const receipt = verified.envelope;
  if (receipt.type !== "task.receipt") return { ok: false, error: "Peer returned the wrong message type" };
  if (receipt.from.did !== peer.did) return { ok: false, error: "Receipt is from a different peer" };
  if (receipt.to.did !== senderDid) return { ok: false, error: "Receipt is addressed to a different sender" };
  if (!peerKeyMatches(peer, receipt)) return { ok: false, error: "Receipt key does not match the pinned peer key" };

  const payload = receipt.payload as Record<string, unknown>;
  if (payload.messageId !== envelope.id) return { ok: false, error: "Receipt does not match the delivered message" };

  let reply: A2AEnvelope | undefined;
  if (body.reply) {
    const verifiedReply = await verifyEnvelope(body.reply);
    if (!verifiedReply.ok || !verifiedReply.envelope) {
      return { ok: false, error: `Invalid peer reply: ${verifiedReply.error}` };
    }
    const candidate = verifiedReply.envelope;
    if (candidate.type !== "hello") return { ok: false, error: "Peer returned an unsupported reply type" };
    if (candidate.from.did !== peer.did || candidate.to.did !== senderDid) {
      return { ok: false, error: "Peer reply has the wrong audience" };
    }
    if (!peerKeyMatches(peer, candidate)) return { ok: false, error: "Peer reply key does not match the pinned key" };
    reply = candidate;
  }

  return {
    ok: true,
    receipt,
    reply,
    status: typeof payload.status === "string" ? payload.status : "accepted",
    detail: typeof payload.detail === "string" ? payload.detail : "",
  };
}
