/**
 * Signed, verifiable, portable skill packages for roadmap Phase 3 item 11.
 *
 * A package is one A2A `skill.publish` envelope whose payload is a declarative
 * manifest. The envelope signature proves publisher identity; verification
 * re-checks the signature, schema, size and no-code gates before a package is
 * ever imported. Imported skills become gated `candidate` genome entries —
 * never active skills and never executable install steps.
 */

import {
  A2A_PROTOCOL, A2A_VERSION, canonicalJson, createEnvelope, didFor,
  safeA2AJson, validatePublicJwk, verifyEnvelope,
  type A2AEnvelope, type A2APublicJwk,
} from "./a2a";
import { MAX_SKILL_BODY_CHARS, MAX_SKILL_TESTS, newId, type SkillTestCase } from "./foundation";
import { createSkillGenome } from "./skill-genome";
import { type FedVerification } from "./federation-store";

export const FED_SKILL_FORMAT = "medusa-skill-package";
export const FED_SKILL_MANIFEST_VERSION = 1;
export const FED_SKILL_KINDS = ["prompt", "tool"] as const;

const EXECUTABLE_RE = /\b(?:postinstall|preinstall|npm\s+install|child_process|process\.env|eval\s*\(|new\s+Function\s*\(|require\s*\()\b/i;

export interface FedSkillManifest {
  format: typeof FED_SKILL_FORMAT;
  version: 1;
  packageId: string;
  slug: string;
  name: string;
  description: string;
  versionText: string;
  kind: "prompt" | "tool";
  body: string;
  tests: SkillTestCase[];
  dna: {
    tags: string[];
    trustScore: number;
    preconditions: string[];
    postconditions: string[];
    sideEffects: string[];
  };
  publishedAt: string;
}

export interface PublishSkillInput {
  uid: string;
  agentId: string;
  packageId?: string;
  slug?: string;
  name: string;
  description?: string;
  versionText?: string;
  kind: string;
  body: string;
  tests?: unknown;
  dna?: Record<string, unknown>;
  displayName?: string;
  role?: string;
  capabilities?: string[];
}

export interface VerifiedSkillPackage {
  ok: boolean;
  error?: string;
  manifest?: FedSkillManifest;
  manifestHash?: string;
  publisherDid?: string;
  verification?: FedVerification;
}

function clip(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeTests(raw: unknown): SkillTestCase[] {
  if (!Array.isArray(raw)) return [];
  const out: SkillTestCase[] = [];
  for (const item of raw.slice(0, MAX_SKILL_TESTS)) {
    const safe = safeA2AJson(item, 1) as Record<string, unknown>;
    const name = clip(safe.name, 120);
    const input = typeof safe.input === "string" ? safe.input.slice(0, 4000) : "";
    if (!name || !input) continue;
    const strings = (key: string) => Array.isArray(safe[key])
      ? (safe[key] as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 20).map((v) => v.slice(0, 400))
      : [];
    const test: SkillTestCase = {
      name, input,
      expectContains: strings("expectContains"),
      expectNotContains: strings("expectNotContains"),
    };
    const maxChars = Number(safe.maxChars);
    if (Number.isFinite(maxChars) && maxChars > 0) test.maxChars = Math.floor(maxChars);
    out.push(test);
  }
  return out;
}

/** Reject executable install steps and validate the declarative skill body. */
export function validateSkillBody(body: unknown, kind: string): string {
  if (typeof body !== "string") throw new Error("Skill body must be text");
  const text = body.slice(0, MAX_SKILL_BODY_CHARS);
  if (text.trim().length < 8) throw new Error("Skill body is too short");
  if (EXECUTABLE_RE.test(text)) throw new Error("Skill body contains executable content");
  if (kind === "tool") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Tool skill body must be a declarative JSON object");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Tool skill body must be a declarative JSON object");
    }
    const spec = parsed as Record<string, unknown>;
    if (!clip(spec.name, 120) || typeof spec.description !== "string" || spec.description.length < 20) {
      throw new Error("Tool skill needs a name and a description of at least 20 characters");
    }
    if (!spec.parameters || typeof spec.parameters !== "object" || Array.isArray(spec.parameters)) {
      throw new Error("Tool skill needs a declarative parameters object");
    }
  }
  return text;
}

function normalizeDna(raw: unknown): FedSkillManifest["dna"] {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const strings = (key: string) => Array.isArray(value[key])
    ? (value[key] as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 20).map((v) => clip(v, 120))
    : [];
  const trust = Number(value.trustScore);
  return {
    tags: strings("tags"),
    preconditions: strings("preconditions"),
    postconditions: strings("postconditions"),
    sideEffects: strings("sideEffects"),
    trustScore: Number.isFinite(trust) ? Math.min(1, Math.max(0, trust)) : 0.5,
  };
}

/** Build and sign a portable skill package. The body is inert prompt/spec text. */
export async function createSignedSkillPackage(input: PublishSkillInput): Promise<{
  envelope: A2AEnvelope; manifest: FedSkillManifest; manifestHash: string;
}> {
  const kind = (FED_SKILL_KINDS as readonly string[]).includes(input.kind) ? input.kind : "prompt";
  const name = clip(input.name, 120);
  if (!name) throw new Error("A package name is required");
  const meta = safeA2AJson({
    format: FED_SKILL_FORMAT,
    version: FED_SKILL_MANIFEST_VERSION,
    packageId: clip(input.packageId, 200) || newId("pkg"),
    slug: clip(input.slug, 80),
    name,
    description: clip(input.description, 400),
    versionText: clip(input.versionText, 40) || "1.0.0",
    kind,
    dna: normalizeDna(input.dna),
    publishedAt: new Date().toISOString(),
  });
  const manifest: FedSkillManifest = {
    ...(meta as unknown as Omit<FedSkillManifest, "body" | "tests">),
    body: validateSkillBody(input.body, kind),
    tests: normalizeTests(input.tests),
  };
  // `body` may legitimately contain code-like prose, so it is validated by
  // validateSkillBody instead of the generic string scanner. Everything else,
  // including every test case, has passed safeA2AJson above.
  const envelope = await createEnvelope({
    uid: input.uid,
    agentId: input.agentId,
    type: "skill.publish",
    to: { did: didFor(input.uid, "marketplace"), agentId: "marketplace" },
    payload: manifest as unknown as Record<string, unknown>,
    displayName: input.displayName,
    role: input.role,
    capabilities: input.capabilities,
    // The manifest body is inert text gated by validateSkillBody; legitimate
    // prompt prose may look code-like to the generic A2A string scanner.
    allowCode: true,
  });
  return { envelope, manifest, manifestHash: envelope.payloadHash };
}

/** Verify a portable package. Optional pin restricts trust to a known publisher. */
export async function verifySignedSkillPackage(
  raw: unknown,
  pin?: { keyId: string; publicKey: A2APublicJwk } | null,
): Promise<VerifiedSkillPackage> {
  const verified = await verifyEnvelope(raw);
  if (!verified.ok || !verified.envelope) return { ok: false, error: verified.error || "Invalid envelope" };
  const envelope = verified.envelope;
  if (envelope.protocol !== A2A_PROTOCOL || envelope.version !== A2A_VERSION) {
    return { ok: false, error: "Unsupported protocol version" };
  }
  if (envelope.type !== "skill.publish") return { ok: false, error: "Envelope is not a skill package" };
  if (pin) {
    if (envelope.from.keyId !== pin.keyId) return { ok: false, error: "Publisher key does not match the pinned key" };
    const pinned = validatePublicJwk(pin.publicKey);
    if (!pinned || canonicalJson(pinned) !== canonicalJson(envelope.from.publicKey)) {
      return { ok: false, error: "Publisher public key does not match the pinned key" };
    }
  }
  const payload = envelope.payload as Record<string, unknown>;
  if (payload.format !== FED_SKILL_FORMAT || payload.version !== FED_SKILL_MANIFEST_VERSION) {
    return { ok: false, error: "Unsupported skill package format" };
  }
  let manifest: FedSkillManifest;
  try {
    const kind = (FED_SKILL_KINDS as readonly string[]).includes(String(payload.kind)) ? String(payload.kind) : "prompt";
    manifest = {
      format: FED_SKILL_FORMAT,
      version: FED_SKILL_MANIFEST_VERSION,
      packageId: clip(payload.packageId, 200),
      slug: clip(payload.slug, 80),
      name: clip(payload.name, 120),
      description: clip(payload.description, 400),
      versionText: clip(payload.versionText, 40) || "1.0.0",
      kind: kind as "prompt" | "tool",
      body: validateSkillBody(payload.body, kind),
      tests: normalizeTests(payload.tests),
      dna: normalizeDna(payload.dna),
      publishedAt: clip(payload.publishedAt, 40),
    };
    if (!manifest.packageId || !manifest.name) return { ok: false, error: "Skill package is missing an id or name" };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Invalid skill package" };
  }
  return {
    ok: true,
    manifest,
    manifestHash: envelope.payloadHash,
    publisherDid: envelope.from.did,
    verification: pin ? "pinned" : "signature-only",
  };
}

/** Import a verified package as a gated genome candidate with provenance. */
export async function importSignedSkillPackage(input: {
  uid: string;
  manifest: FedSkillManifest;
  manifestHash: string;
  publisherDid: string;
  verification: FedVerification;
}): Promise<{ genomeId: string; familyId: string; version: number }> {
  const { manifest } = input;
  const genome = await createSkillGenome({
    uid: input.uid,
    name: manifest.name,
    slug: manifest.slug,
    description: manifest.description,
    kind: manifest.kind,
    body: manifest.body,
    tests: manifest.tests,
    operator: "import",
    status: "candidate",
    dna: {
      tags: [...manifest.dna.tags, "marketplace"],
      trustScore: manifest.dna.trustScore,
      preconditions: manifest.dna.preconditions,
      postconditions: manifest.dna.postconditions,
      sideEffects: manifest.dna.sideEffects,
      provenance: [{
        kind: "marketplace-import",
        at: new Date().toISOString(),
        agentId: input.publisherDid,
        note: `${input.verification} · ${input.manifestHash.slice(0, 16)} · ${manifest.versionText}`,
      }],
    },
  });
  return { genomeId: genome.id, familyId: genome.familyId, version: genome.version };
}
