/**
 * Recipient-bound encryption for federated memory and signed skill packages.
 *
 * Item 10 already derives deterministic P-256 signing keys from the deployment
 * secret. This module derives a *separate* key for key agreement (different
 * HKDF salt) and uses ECDH + HKDF + AES-GCM to seal declarative JSON for one
 * pinned peer. Private JWKs are used in memory only and are never persisted;
 * D1 stores public JWKs, key ids, signatures and sealed ciphertext only.
 */

import {
  A2APublicJwk, bytesToBase64Url, canonicalJson, deriveP256Key, validatePublicJwk,
} from "./a2a";

export const FED_ECDH_SALT = "medusa-federated-ecdh-v1";
export const FED_SEAL_INFO = "medusa-federated-seal-v1";
export const SEALED_ALG = "ECDH-P256-HKDF-SHA256-AES256-GCM" as const;

export interface FedParty { uid: string; agentId: string }

export interface SealedBundle {
  v: 1;
  alg: typeof SEALED_ALG;
  senderKeyId: string;
  senderPublicKey: A2APublicJwk;
  recipientKeyId: string;
  context: string;
  iv: string;
  ciphertext: string;
}

function base64UrlToBytes(value: string): ArrayBuffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url value");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out.buffer as ArrayBuffer;
}

function cleanPrivateJwk(jwk: { kty: "EC"; crv: "P-256"; x: string; y: string; d: string }) {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d };
}

function cleanPublicJwk(jwk: A2APublicJwk) {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

function partyInfo(party: FedParty): string {
  return `${party.uid.slice(0, 96)}\u0000${party.agentId.slice(0, 96)}`;
}

/** Public half of the deterministic key-agreement key for a local agent. */
export async function localEncryptionIdentity(party: FedParty): Promise<{
  publicJwk: A2APublicJwk; keyId: string;
}> {
  const derived = await deriveP256Key(FED_ECDH_SALT, partyInfo(party));
  return { publicJwk: derived.publicJwk, keyId: derived.keyId };
}

async function deriveSharedKey(
  privateJwk: { kty: "EC"; crv: "P-256"; x: string; y: string; d: string },
  peerPublicJwk: A2APublicJwk,
  context: string,
): Promise<CryptoKey> {
  const privateKey = await crypto.subtle.importKey(
    "jwk", cleanPrivateJwk(privateJwk), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"],
  );
  const publicKey = await crypto.subtle.importKey(
    "jwk", cleanPublicJwk(peerPublicJwk), { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(FED_SEAL_INFO),
      info: new TextEncoder().encode(context.slice(0, 200)),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Seal a declarative JSON object so only the named recipient can open it. */
export async function sealForRecipient(
  payload: Record<string, unknown>,
  recipient: { publicJwk: A2APublicJwk; keyId: string },
  sender: FedParty,
  context: string,
): Promise<SealedBundle> {
  const recipientPublicJwk = validatePublicJwk(recipient.publicJwk);
  if (!recipientPublicJwk) throw new Error("Recipient encryption key is not a valid P-256 public JWK");
  const derived = await deriveP256Key(FED_ECDH_SALT, partyInfo(sender));
  const key = await deriveSharedKey(derived.privateJwk, recipientPublicJwk, context);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(canonicalJson(payload)),
  );
  return {
    v: 1,
    alg: SEALED_ALG,
    senderKeyId: derived.keyId,
    senderPublicKey: derived.publicJwk,
    recipientKeyId: recipient.keyId.slice(0, 80),
    context: context.slice(0, 200),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(encrypted),
  };
}

/** Open a bundle sealed for this local agent. Never trusts embedded authority. */
export async function openSealedBundle(
  bundle: unknown,
  recipient: FedParty,
  context: string,
): Promise<Record<string, unknown>> {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) throw new Error("Sealed bundle must be an object");
  const b = bundle as Partial<SealedBundle>;
  if (b.v !== 1 || b.alg !== SEALED_ALG) throw new Error("Unsupported sealed bundle format");
  if (b.context !== context.slice(0, 200)) throw new Error("Sealed bundle context does not match the grant");
  const senderPublicJwk = validatePublicJwk(b.senderPublicKey);
  if (!senderPublicJwk) throw new Error("Sealed bundle has an invalid sender key");
  if (typeof b.iv !== "string" || typeof b.ciphertext !== "string") throw new Error("Sealed bundle is missing ciphertext");
  if (!b.senderKeyId || !b.recipientKeyId) throw new Error("Sealed bundle is missing key ids");

  const derived = await deriveP256Key(FED_ECDH_SALT, partyInfo(recipient));
  if (b.recipientKeyId !== derived.keyId) throw new Error("Sealed bundle was addressed to a different recipient key");
  const key = await deriveSharedKey(derived.privateJwk, senderPublicJwk, context);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(b.iv) }, key, base64UrlToBytes(b.ciphertext),
    );
  } catch {
    throw new Error("Sealed bundle could not be decrypted");
  }
  const parsed = JSON.parse(new TextDecoder().decode(plain)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Sealed bundle payload must be an object");
  return parsed as Record<string, unknown>;
}
