"use client";

// Simple client-side encryption for vault keys at rest (localStorage)
// Uses AES-GCM with PBKDF2 derived key from a local device passphrase.
// Not a replacement for server-side Secrets Store, but hides plaintext
// from casual localStorage inspection and clipboard leaks.

const SALT = "godeye-vault-salt-v1";
const PASSPHRASE = "godeye-local-encryption-key-v1"; // device-local, not user secret
const ENC_PREFIX = "enc:";

async function deriveKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(PASSPHRASE), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(SALT), iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptKey(plaintext: string): Promise<string> {
  if (!plaintext) return "";
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    // fallback: simple base64 obfuscation
    return ENC_PREFIX + btoa(plaintext);
  }
  try {
    const key = await deriveKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder().encode(plaintext);
    const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
    const combined = new Uint8Array(iv.length + new Uint8Array(buf).length);
    combined.set(iv, 0);
    combined.set(new Uint8Array(buf), iv.length);
    return ENC_PREFIX + btoa(String.fromCharCode(...combined));
  } catch {
    return ENC_PREFIX + btoa(plaintext);
  }
}

export async function decryptKey(ciphertext: string): Promise<string> {
  if (!ciphertext) return "";
  if (!ciphertext.startsWith(ENC_PREFIX)) return ciphertext; // legacy plaintext
  const b64 = ciphertext.slice(ENC_PREFIX.length);
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    try { return atob(b64); } catch { return ""; }
  }
  try {
    const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const key = await deriveKey();
    const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(dec);
  } catch {
    // fallback try plain base64
    try { return atob(b64); } catch { return ""; }
  }
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.startsWith(ENC_PREFIX)) return "••••••••••••••••";
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

// helper for API: build decrypted vault payload for server
export async function getDecryptedVaultForApi(vault: Record<string, any>): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(vault)) {
    if (!v) continue;
    if (typeof v === "string") {
      // legacy
      out[k] = { provider: k, key: v, connected: true };
    } else if (v.key) {
      const dec = await decryptKey(v.key);
      out[k] = { ...v, key: dec };
    }
  }
  return out;
}
