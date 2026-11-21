import { NextResponse } from "next/server";
import {
  A2A_CAPABILITIES, A2A_DEFAULT_TTL_MS, A2A_MAX_SKEW_MS, A2A_MESSAGE_TYPES,
  A2A_PROTOCOL, A2A_VERSION,
} from "@/lib/a2a";

/** Machine-readable open spec. Public by design; contains no deployment secrets. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    name: A2A_PROTOCOL,
    version: A2A_VERSION,
    status: "open-spec-v1",
    identity: {
      didFormat: "did:medusa:<url-encoded-user-id>:<url-encoded-agent-id>",
      keyFormat: "P-256 public JWK (kty, crv, x, y only)",
      keyId: "SHA-256 of canonical public JWK, base64url, first 24 characters",
      keyDerivation: "Deterministic HKDF-SHA256 from A2A_SIGNING_SECRET; private keys are never stored",
    },
    envelope: {
      requiredFields: [
        "protocol", "version", "id", "type", "issuedAt", "expiresAt",
        "from", "to", "nonce", "payloadHash", "payload", "signature",
      ],
      signature: {
        alg: "ES256",
        signedFields: [
          "protocol", "version", "id", "type", "issuedAt", "expiresAt",
          "from", "to", "nonce", "payloadHash",
        ],
        canonicalization: "Recursive key-sorted JSON; arrays preserved; undefined omitted",
        payloadHash: "SHA-256 of canonical payload JSON, base64url",
      },
      limits: {
        maxSkewMs: A2A_MAX_SKEW_MS,
        defaultTtlMs: A2A_DEFAULT_TTL_MS,
        maxTtlMs: 60 * 60 * 1000,
        maxPayloadBytes: 24_000,
      },
    },
    messageTypes: A2A_MESSAGE_TYPES,
    capabilities: A2A_CAPABILITIES,
    messages: {
      hello: "Capability announcement; reply is a signed hello with requested/matched/missing capabilities.",
      "capability.query": "Request capabilities by name; never grants new authority.",
      "task.delegate": "Declarative objective, input, requiredCapabilities and budgetMicroUsd. Recipient returns a signed task.receipt.",
      "task.status": "Status update referencing messageId or taskId.",
      "task.result": "Terminal result with inert result text/JSON; may contain code-like text only as non-executable content.",
      "task.receipt": "Signed acknowledgement of a messageId with accepted/rejected/duplicate/recorded status.",
      "memory.grant": "Scoped, recipient-encrypted memory snapshot. Recipient verifies signature, grant id, expiry and bundle hash, then imports nodes as a new provenance-tagged branch.",
      "skill.publish": "Signed declarative skill manifest. Verification checks publisher pin, schema, size and no-code gates; import creates a gated candidate genome entry only.",
      error: "Declarative error detail; recorded but never executed.",
    },
    federated: {
      memory: {
        transport: "Signed memory.grant envelope over the normal A2A inbox",
        encryption: "Recipient-bound ECDH P-256 + HKDF-SHA256 + AES-256-GCM; separate key from ES256 signing",
        keyPublication: "P-256 public encryption JWK + keyId in GET /api/a2a/manifest, also pinnable via the local federation console",
        scope: ["projectId", "kinds", "branchId", "limit"],
        limits: { maxNodes: 20, maxLinks: 60, maxContentChars: 400, maxTtlMs: 86_400_000 },
        rules: [
          "Only pinned peers may issue a grant",
          "Grant id, owner DID, expiry and bundle hash are bound by the signed envelope",
          "Import creates new local memory ids and a derived_from-style provenance branch",
          "Revoked or expired grants are rejected before decryption",
        ],
      },
      marketplace: {
        package: "One A2A skill.publish envelope containing a declarative manifest (body, tests, reduced DNA)",
        signing: "ES256 over canonical JSON by the publisher's deterministic P-256 identity",
        portability: "The full signed envelope is the portable package; no runtime, hooks or install scripts",
        import: "Verified packages become status=candidate genome entries until locally tested and selected",
        rules: [
          "Executable install entries, commands, endpoints and credentials are rejected",
          "Publisher pinning is optional but reported as signature-only when absent",
          "Signed hashes prove integrity, not safety; local tests still gate activation",
        ],
      },
    },
    taskPayload: {
      required: ["taskId", "objective"],
      optional: ["input", "requiredCapabilities", "budgetMicroUsd", "messageId", "status", "result", "detail"],
      rules: [
        "JSON objects, arrays, strings, numbers, booleans and null only",
        "No executable code, commands, scripts, endpoints or credentials",
        "Model output cannot create keys, endpoints or signing authority",
      ],
    },
    endpoints: {
      manifest: "GET /api/a2a/manifest?did=<did>",
      inbox: "POST /api/a2a/inbox (signed envelope JSON)",
      spec: "GET /api/a2a/spec",
      tasks: "GET/POST /api/a2a/tasks/:id (authenticated local execution)",
    },
    security: {
      transport: "Remote peers must use HTTPS; loopback/private endpoints require local opt-in",
      peerAuth: "Sender DID must be registered and its public key must match the pinned key",
      replay: "Message id is cached; duplicates return a signed receipt without reprocessing",
      audience: "Envelope to.did must resolve to an active registered local agent",
      data: "No private keys, API keys or executable payloads are stored in D1",
    },
  });
}
