/**
 * Server-side endpoint validation for provider overrides.
 *
 * A vault endpoint is user input that ends up in a server-side `fetch()`. It
 * must never be able to reach the worker's own metadata service, an internal
 * private network, or an arbitrary plaintext HTTP host: the decrypted provider
 * credential travels with that request. Explicit local endpoints are only
 * accepted in a local/self-hosted runtime (or dev), never in the cloud build.
 */

export type EndpointValidation =
  | { ok: true; url: string; local: boolean }
  | { ok: false; error: string };

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "::",
  "metadata.google.internal",
  "metadata",
]);

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (LOCAL_HOSTS.has(host) || host.endsWith(".localhost")) return true;

  const v4 = host.split(".").map(Number);
  if (v4.length === 4 && v4.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = v4;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true;
  }

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(host);
  if (mapped) return isPrivateHost(mapped[1]);
  return /^(fc|fd|fe[89ab])/i.test(host) || host === "::";
}

/**
 * Loopback endpoints are useful on a desktop/self-hosted build but meaningless
 * (and unsafe) on a deployed worker. Opt in explicitly with
 * `MEDUSA_ALLOW_LOCAL_ENDPOINTS=1`; dev mode implicitly allows them.
 */
export function endpointAllowsLocal(): boolean {
  try {
    if (process.env.MEDUSA_ALLOW_LOCAL_ENDPOINTS === "1") return true;
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

export function validateProviderEndpoint(
  raw: unknown,
  options: { allowLocal?: boolean } = {},
): EndpointValidation {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, error: "Endpoint URL is empty" };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "Endpoint must be a valid absolute URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Endpoint must use http:// or https://" };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Endpoint URLs must not contain credentials" };
  }

  const local = isPrivateHost(url.hostname);
  if (local) {
    if (!(options.allowLocal ?? endpointAllowsLocal())) {
      return {
        ok: false,
        error: "Loopback/private endpoints are disabled in this deployment. Run MEDUSA locally or configure a trusted bridge.",
      };
    }
  } else if (url.protocol !== "https:") {
    return { ok: false, error: "Remote endpoints must use https://" };
  }

  return { ok: true, url: url.toString().replace(/\/+$/, ""), local };
}

/** Deterministic, non-reversible fingerprint for health history. No secrets. */
export function fingerprintEndpoint(raw?: string): string {
  const value = String(raw ?? "").trim();
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
