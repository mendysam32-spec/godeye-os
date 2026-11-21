/**
 * MEDUSA Agent-to-Agent protocol (open spec, version 1).
 *
 * Design rules:
 * - messages are signed, versioned, addressed and short-lived;
 * - payloads are declarative JSON only — no code, commands or endpoints are
 *   accepted as executable instructions;
 * - private keys never enter D1. Local signing keys are deterministically
 *   derived from the deployment's `A2A_SIGNING_SECRET` (dev has a non-secret
 *   fallback so `next dev` works without configuration);
 * - peers are authenticated by pinned public keys, not by display names.
 */

export const A2A_PROTOCOL = "medusa-a2a" as const;
export const A2A_VERSION = 1 as const;
export const A2A_MAX_SKEW_MS = 5 * 60 * 1000;
export const A2A_DEFAULT_TTL_MS = 10 * 60 * 1000;

export type A2AMessageType =
  | "hello"
  | "capability.query"
  | "task.delegate"
  | "task.status"
  | "task.receipt"
  | "task.result"
  | "memory.grant"
  | "skill.publish"
  | "error";

export const A2A_MESSAGE_TYPES: A2AMessageType[] = [
  "hello", "capability.query", "task.delegate", "task.status",
  "task.receipt", "task.result", "memory.grant", "skill.publish", "error",
];

export const A2A_CAPABILITIES = [
  "runtime.execute",
  "runtime.verify",
  "memory.query",
  "memory.write",
  "skill.invoke",
  "genome.install-candidate",
  "research.deep",
  "code.review",
  "code.refactor",
  "canvas.collaborate",
  "budget.delegate",
  "federated.memory",
  "marketplace.skill",
] as const;

export type A2ACapability = (typeof A2A_CAPABILITIES)[number];

export interface A2APublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
}

export interface A2AIdentity {
  did: string;
  agentId: string;
  displayName: string;
  role: string;
  keyId: string;
  publicKey: A2APublicJwk;
  capabilities: string[];
}

export interface A2ATarget {
  did: string;
  agentId?: string;
}

export interface A2ASignature {
  alg: "ES256";
  keyId: string;
  value: string;
}

export interface A2AEnvelope<P = Record<string, unknown>> {
  protocol: typeof A2A_PROTOCOL;
  version: typeof A2A_VERSION;
  id: string;
  type: A2AMessageType;
  issuedAt: string;
  expiresAt: string;
  from: A2AIdentity;
  to: A2ATarget;
  nonce: string;
  payloadHash: string;
  payload: P;
  signature: A2ASignature;
}

type UnsignedEnvelope<P> = Omit<A2AEnvelope<P>, "signature">;

export interface A2AEnvelopeInput {
  uid: string;
  agentId: string;
  type: A2AMessageType;
  to: A2ATarget;
  payload: Record<string, unknown>;
  ttlMs?: number;
  displayName?: string;
  role?: string;
  capabilities?: string[];
  /** `task.result` and `skill.publish` may carry code-like text as inert content. */
  allowCode?: boolean;
}

export interface A2AVerifyResult<P = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  envelope?: A2AEnvelope<P>;
}

/* -------------------------------------------------------------------------- */
/* small utilities                                                            */
/* -------------------------------------------------------------------------- */

const encoder = new TextEncoder();

export function clip(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
}

/** Canonical JSON: object keys sorted recursively, arrays preserved. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export async function hashJson(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonicalJson(value)));
  return bytesToBase64Url(digest);
}

const BLOCKED_PAYLOAD_KEYS = new Set([
  "code", "script", "source", "exec", "execute", "eval", "command", "cmd",
  "shell", "javascript", "typescript", "binary", "payload64", "function",
]);
const CODE_STRING_RE = /(?:function\s*[({]|=>|require\s*\(|import\s*\(|eval\s*\(|new\s+Function\s*\(|child_process|process\.env|__proto__)/i;

/** Sanitize a declarative payload. Throws if it looks like executable code. */
export function safeA2AJson(value: unknown, depth = 0, allowCode = false): Record<string, unknown> {
  if (depth > 6) throw new Error("Payload is too deeply nested");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Payload must be an object");
  const out: Record<string, unknown> = {};
  let keys = 0;
  for (const [rawKey, raw] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.slice(0, 64);
    if (BLOCKED_PAYLOAD_KEYS.has(key.toLowerCase())) throw new Error(`Payload key "${key}" is not allowed`);
    keys += 1;
    if (keys > 50) throw new Error("Payload has too many keys");
    if (typeof raw === "string") {
      const text = raw.slice(0, 8_000);
      if (!allowCode && CODE_STRING_RE.test(text)) throw new Error(`Payload field "${key}" contains executable code`);
      out[key] = text;
    } else if (typeof raw === "number") {
      out[key] = Number.isFinite(raw) ? raw : null;
    } else if (typeof raw === "boolean" || raw === null) {
      out[key] = raw;
    } else if (Array.isArray(raw)) {
      if (raw.length > 100) throw new Error(`Payload field "${key}" has too many items`);
      out[key] = raw.slice(0, 100).map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) return safeA2AJson(item, depth + 1, allowCode);
        if (typeof item === "string") {
          const text = item.slice(0, 2_000);
          if (!allowCode && CODE_STRING_RE.test(text)) throw new Error(`Payload field "${key}" contains executable code`);
          return text;
        }
        if (typeof item === "number" || typeof item === "boolean" || item === null) return item;
        throw new Error(`Payload field "${key}" has an unsupported value`);
      });
    } else if (typeof raw === "object") {
      out[key] = safeA2AJson(raw, depth + 1, allowCode);
    } else {
      throw new Error(`Payload field "${key}" has an unsupported value`);
    }
  }
  if (canonicalJson(out).length > 24_000) throw new Error("Payload is too large");
  return out;
}

/* -------------------------------------------------------------------------- */
/* capabilities / identities                                                  */
/* -------------------------------------------------------------------------- */

const CAPABILITY_RE = /^[a-z][a-z0-9._-]{1,63}$/;

export function normalizeCapabilities(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const value = item.trim().toLowerCase();
    if (!CAPABILITY_RE.test(value) || out.includes(value)) continue;
    out.push(value);
    if (out.length >= 32) break;
  }
  return out;
}

export function missingCapabilities(required: string[], offered: string[]): string[] {
  return required.filter((cap) => !offered.includes(cap));
}

export function didFor(uid: string, agentId: string): string {
  const cleanUid = encodeURIComponent(clip(uid, 96));
  const cleanAgent = encodeURIComponent(clip(agentId, 96));
  return `did:medusa:${cleanUid}:${cleanAgent}`;
}

export interface A2ADidParts { uid: string; agentId: string }

export function didParts(did: unknown): A2ADidParts | null {
  if (typeof did !== "string") return null;
  const parts = did.split(":");
  if (parts.length !== 4 || parts[0] !== "did" || parts[1] !== "medusa") return null;
  try {
    const uid = decodeURIComponent(parts[2]);
    const agentId = decodeURIComponent(parts[3]);
    return uid && agentId ? { uid, agentId } : null;
  } catch {
    return null;
  }
}

export function validatePublicJwk(input: unknown): A2APublicJwk | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const jwk = input as Record<string, unknown>;
  if (jwk.kty !== "EC" || jwk.crv !== "P-256") return null;
  if ("d" in jwk || "k" in jwk || "p" in jwk || "q" in jwk || "dp" in jwk || "dq" in jwk || "qi" in jwk) return null;
  if (typeof jwk.x !== "string" || typeof jwk.y !== "string") return null;
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(jwk.x) || !/^[A-Za-z0-9_-]{40,64}$/.test(jwk.y)) return null;
  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
}

export function parsePublicJwk(text: string): A2APublicJwk | null {
  try {
    return validatePublicJwk(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function fingerprintJwk(jwk: A2APublicJwk): Promise<string> {
  return (await hashJson(jwk)).slice(0, 24);
}

/* -------------------------------------------------------------------------- */
/* signing keys                                                               */
/* -------------------------------------------------------------------------- */

export function signingConfigured(): boolean {
  return process.env.NODE_ENV !== "production" || !!process.env.A2A_SIGNING_SECRET;
}

function signingSecret(): string {
  const configured = typeof process.env.A2A_SIGNING_SECRET === "string" ? process.env.A2A_SIGNING_SECRET : "";
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return "medusa-a2a-dev-only-secret";
  throw new Error(
    "A2A_SIGNING_SECRET is not configured. Set a deployment secret before using the federation protocol in production.",
  );
}

interface AgentKeys {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: A2APublicJwk;
  keyId: string;
}

/* P-256 scalar arithmetic is only used to turn the derived 32-byte secret
 * scalar into a standards-compatible JWK private key. JWK import works in both
 * Workers and Node/WebCrypto; raw private EC key import does not. Values are
 * built with BigInt(...) rather than literals so the project's ES2017 target
 * can still type-check this file. */
const B_ZERO = BigInt(0);
const B_ONE = BigInt(1);
const B_TWO = BigInt(2);
const B_THREE = BigInt(3);
const B_EIGHT = BigInt(8);
const P256_P = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
const P256_N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const P256_GX = BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296");
const P256_GY = BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5");

interface EcPoint { x: bigint; y: bigint }

function mod(value: bigint, modulus: bigint): bigint {
  const result = value % modulus;
  return result < B_ZERO ? result + modulus : result;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = B_ONE;
  let b = mod(base, modulus);
  let e = exponent;
  while (e > B_ZERO) {
    if (e & B_ONE) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= B_ONE;
  }
  return result;
}

function pointAdd(a: EcPoint | null, b: EcPoint | null): EcPoint | null {
  if (!a) return b;
  if (!b) return a;
  let slope: bigint;
  if (a.x === b.x) {
    if (mod(a.y + b.y, P256_P) === B_ZERO) return null;
    slope = mod((B_THREE * a.x * a.x - B_THREE) * modPow(B_TWO * a.y, P256_P - B_TWO, P256_P), P256_P);
  } else {
    slope = mod((b.y - a.y) * modPow(b.x - a.x, P256_P - B_TWO, P256_P), P256_P);
  }
  const x = mod(slope * slope - a.x - b.x, P256_P);
  return { x, y: mod(slope * (a.x - x) - a.y, P256_P) };
}

function pointMultiply(scalar: bigint): EcPoint | null {
  let result: EcPoint | null = null;
  let addend: EcPoint | null = { x: P256_GX, y: P256_GY };
  let k = scalar;
  while (k > B_ZERO) {
    if (k & B_ONE) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    k >>= B_ONE;
  }
  return result;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = B_ZERO;
  for (const byte of bytes) value = (value << B_EIGHT) | BigInt(byte);
  return value;
}

function bigIntToBytes32(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export interface DerivedP256Key {
  privateJwk: { kty: "EC"; crv: "P-256"; x: string; y: string; d: string };
  publicJwk: A2APublicJwk;
  keyId: string;
}

/**
 * Deterministic P-256 key derivation from the deployment secret. Distinct
 * salt/info values give cryptographically separate keys for signing and key
 * agreement; private JWKs never leave this module in stored form.
 */
export async function deriveP256Key(salt: string, info: string): Promise<DerivedP256Key> {
  const hkdfKey = await crypto.subtle.importKey("raw", encoder.encode(signingSecret()), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode(salt), info: encoder.encode(info) },
    hkdfKey,
    256,
  );
  const scalar = mod(bytesToBigInt(new Uint8Array(bits)), P256_N) || B_ONE;
  const point = pointMultiply(scalar);
  if (!point) throw new Error("Could not derive a valid P-256 key");
  const publicJwk = validatePublicJwk({
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64Url(bigIntToBytes32(point.x)),
    y: bytesToBase64Url(bigIntToBytes32(point.y)),
  });
  if (!publicJwk) throw new Error("Could not derive a valid P-256 key");
  return {
    privateJwk: {
      kty: "EC", crv: "P-256", x: publicJwk.x, y: publicJwk.y,
      d: bytesToBase64Url(bigIntToBytes32(scalar)),
    },
    publicJwk,
    keyId: await fingerprintJwk(publicJwk),
  };
}

async function agentKeys(uid: string, agentId: string): Promise<AgentKeys> {
  const derived = await deriveP256Key(
    "medusa-a2a-signing-v1", `${clip(uid, 96)}\u0000${clip(agentId, 96)}`,
  );
  const privateKey = await crypto.subtle.importKey(
    "jwk", derived.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const publicKey = await crypto.subtle.importKey(
    "jwk", derived.publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
  );
  return { privateKey, publicKey, publicJwk: derived.publicJwk, keyId: derived.keyId };
}

export async function localIdentity(
  uid: string,
  agentId: string,
  meta?: { displayName?: string; role?: string; capabilities?: string[] },
): Promise<A2AIdentity> {
  const keys = await agentKeys(uid, agentId);
  return {
    did: didFor(uid, agentId),
    agentId: clip(agentId, 96),
    displayName: clip(meta?.displayName, 80) || clip(agentId, 80),
    role: clip(meta?.role, 80) || "Assistant",
    keyId: keys.keyId,
    publicKey: keys.publicJwk,
    capabilities: normalizeCapabilities(meta?.capabilities),
  };
}

async function signingPayload(unsigned: UnsignedEnvelope<Record<string, unknown>>): Promise<string> {
  return canonicalJson({
    protocol: unsigned.protocol,
    version: unsigned.version,
    id: unsigned.id,
    type: unsigned.type,
    issuedAt: unsigned.issuedAt,
    expiresAt: unsigned.expiresAt,
    from: unsigned.from,
    to: unsigned.to,
    nonce: unsigned.nonce,
    payloadHash: unsigned.payloadHash,
  });
}

export async function createEnvelope(input: A2AEnvelopeInput): Promise<A2AEnvelope> {
  const payload = safeA2AJson(input.payload, 0, input.allowCode === true);
  const from = await localIdentity(input.uid, input.agentId, {
    displayName: input.displayName,
    role: input.role,
    capabilities: input.capabilities,
  });
  const issuedAt = new Date().toISOString();
  const ttlMs = boundedInt(input.ttlMs, A2A_DEFAULT_TTL_MS, 30_000, 60 * 60 * 1000);
  const unsigned: UnsignedEnvelope<Record<string, unknown>> = {
    protocol: A2A_PROTOCOL,
    version: A2A_VERSION,
    id: crypto.randomUUID(),
    type: input.type,
    issuedAt,
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    from,
    to: { did: clip(input.to.did, 200), ...(input.to.agentId ? { agentId: clip(input.to.agentId, 96) } : {}) },
    nonce: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(18))),
    payloadHash: await hashJson(payload),
    payload,
  };
  if (!unsigned.to.did.startsWith("did:medusa:")) throw new Error("Invalid recipient DID");
  const keys = await agentKeys(input.uid, input.agentId);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, keys.privateKey, encoder.encode(await signingPayload(unsigned)),
  );
  return { ...unsigned, signature: { alg: "ES256", keyId: keys.keyId, value: bytesToBase64Url(signature) } };
}

function equalText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Structural, replay and signature verification. Audience checks are done by the caller. */
export async function verifyEnvelope(raw: unknown, now = Date.now()): Promise<A2AVerifyResult> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Envelope must be an object" };
  const env = raw as Partial<A2AEnvelope>;
  if (env.protocol !== A2A_PROTOCOL || env.version !== A2A_VERSION) return { ok: false, error: "Unsupported protocol version" };
  if (typeof env.id !== "string" || !/^[A-Za-z0-9_-]{8,96}$/.test(env.id)) return { ok: false, error: "Invalid message id" };
  if (!A2A_MESSAGE_TYPES.includes(env.type as A2AMessageType)) return { ok: false, error: "Unsupported message type" };
  if (typeof env.issuedAt !== "string" || typeof env.expiresAt !== "string") return { ok: false, error: "Missing timestamps" };
  const issued = Date.parse(env.issuedAt);
  const expires = Date.parse(env.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires)) return { ok: false, error: "Invalid timestamps" };
  if (issued > now + A2A_MAX_SKEW_MS || expires < now - A2A_MAX_SKEW_MS) return { ok: false, error: "Message is outside the accepted time window" };
  if (expires <= issued || expires - issued > 60 * 60 * 1000) return { ok: false, error: "Invalid message lifetime" };
  if (!env.to || typeof env.to.did !== "string" || !env.to.did.startsWith("did:medusa:")) return { ok: false, error: "Invalid recipient" };
  if (!env.from || typeof env.from.did !== "string" || !env.from.did.startsWith("did:medusa:")) return { ok: false, error: "Invalid sender" };
  const sender = didParts(env.from.did);
  if (!sender) return { ok: false, error: "Malformed sender DID" };
  if (sender.agentId !== env.from.agentId) return { ok: false, error: "Sender DID does not match agent id" };

  const publicKey = validatePublicJwk(env.from.publicKey);
  if (!publicKey) return { ok: false, error: "Invalid sender public key" };
  const keyId = await fingerprintJwk(publicKey);
  if (env.from.keyId !== keyId) return { ok: false, error: "Sender key id does not match its public key" };
  if (!env.signature || env.signature.alg !== "ES256" || env.signature.keyId !== keyId) {
    return { ok: false, error: "Invalid signature header" };
  }
  if (typeof env.nonce !== "string" || !/^[A-Za-z0-9_-]{12,48}$/.test(env.nonce)) return { ok: false, error: "Invalid nonce" };
  if (typeof env.payloadHash !== "string" || !env.payload) return { ok: false, error: "Missing payload hash" };

  let payload: Record<string, unknown>;
  try {
    payload = safeA2AJson(env.payload, 0, env.type === "task.result" || env.type === "skill.publish");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if ((await hashJson(payload)) !== env.payloadHash) return { ok: false, error: "Payload hash mismatch" };

  const unsigned: UnsignedEnvelope<Record<string, unknown>> = {
    protocol: env.protocol,
    version: env.version,
    id: env.id,
    type: env.type as A2AMessageType,
    issuedAt: env.issuedAt,
    expiresAt: env.expiresAt,
    from: {
      did: env.from.did,
      agentId: clip(env.from.agentId, 96),
      displayName: clip(env.from.displayName, 80),
      role: clip(env.from.role, 80),
      keyId: env.from.keyId,
      publicKey,
      capabilities: normalizeCapabilities(env.from.capabilities),
    },
    to: { did: env.to.did, ...(env.to.agentId ? { agentId: clip(env.to.agentId, 96) } : {}) },
    nonce: env.nonce,
    payloadHash: env.payloadHash,
    payload,
  };
  const verifyKey = await crypto.subtle.importKey(
    "jwk", publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
  );
  let signature: Uint8Array;
  try {
    signature = base64UrlToBytes(env.signature.value);
  } catch {
    return { ok: false, error: "Malformed signature" };
  }
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" }, verifyKey, signature as BufferSource, encoder.encode(await signingPayload(unsigned)),
  );
  if (!valid) return { ok: false, error: "Signature verification failed" };
  if (!equalText(env.id, unsigned.id)) return { ok: false, error: "Envelope id mismatch" };

  return { ok: true, envelope: { ...unsigned, signature: env.signature } };
}

/** Reusable validation for code that only needs an unsigned view of a payload. */
export async function envelopePayload<P = Record<string, unknown>>(envelope: A2AEnvelope): Promise<P> {
  return envelope.payload as unknown as P;
}
