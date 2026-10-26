"use client";

// Simple client-side encryption for vault keys at rest (localStorage)
// Uses AES-GCM with PBKDF2 derived key from a local device passphrase.
// Not a replacement for server-side Secrets Store, but hides plaintext
// from casual localStorage inspection and clipboard leaks.

import { isValidApiKey } from "./providers";

type KeyMaterial = { salt: string; passphrase: string };

// Current derivation (post-rebrand).
const CURRENT: KeyMaterial = {
  salt: "medusa-vault-salt-v1",
  passphrase: "medusa-local-encryption-key-v1",
};

// The app was renamed from GodEye to MEDUSA OS. Saved keys written before that
// commit used the old salt/passphrase, so we must keep trying it or every
// existing vault entry becomes unreadable.
const LEGACY: KeyMaterial = {
  salt: "godeye-vault-salt-v1",
  passphrase: "godeye-local-encryption-key-v1",
};

const ENC_PREFIX = "enc:";

async function deriveKey(material: KeyMaterial = CURRENT): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(material.passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(material.salt), iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function cleanKey(value: string): string {
  const trimmed = value.trim();
  return isValidApiKey(trimmed) ? trimmed : "";
}

export async function encryptKey(plaintext: string): Promise<string> {
  const key = cleanKey(plaintext);
  if (!key) return "";
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    // fallback: simple base64 obfuscation
    return ENC_PREFIX + btoa(key);
  }
  try {
    const derived = await deriveKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder().encode(key);
    const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, derived, enc);
    const combined = new Uint8Array(iv.length + new Uint8Array(buf).length);
    combined.set(iv, 0);
    combined.set(new Uint8Array(buf), iv.length);
    return ENC_PREFIX + btoa(String.fromCharCode(...combined));
  } catch {
    return ENC_PREFIX + btoa(key);
  }
}

async function decryptWith(b64: string, material: KeyMaterial): Promise<string | null> {
  if (typeof window === "undefined" || !window.crypto?.subtle) return null;
  try {
    const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (combined.length < 29) return null;
    const derived = await deriveKey(material);
    const dec = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: combined.slice(0, 12) },
      derived,
      combined.slice(12)
    );
    return new TextDecoder().decode(dec);
  } catch {
    return null;
  }
}

function plainBase64Key(b64: string): string {
  try {
    return cleanKey(atob(b64));
  } catch {
    return "";
  }
}

export interface StoredKey {
  key: string;
  /** written with the pre-rebrand passphrase, or stored as plain base64 */
  legacy: boolean;
}

/**
 * Decrypt a stored vault value, trying the legacy GodEye derivation before
 * giving up. Returns an empty key when the value is unreadable or does not look
 * like an API key — callers must not send it upstream in that case.
 */
export async function readStoredKey(ciphertext: string): Promise<StoredKey> {
  if (!ciphertext) return { key: "", legacy: false };
  if (!ciphertext.startsWith(ENC_PREFIX)) {
    return { key: cleanKey(ciphertext), legacy: true };
  }

  const b64 = ciphertext.slice(ENC_PREFIX.length);
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    const key = plainBase64Key(b64);
    return { key, legacy: !!key };
  }

  const current = await decryptWith(b64, CURRENT);
  if (current !== null) return { key: cleanKey(current), legacy: false };

  const legacy = await decryptWith(b64, LEGACY);
  if (legacy !== null) return { key: cleanKey(legacy), legacy: true };

  const fallback = plainBase64Key(b64);
  return { key: fallback, legacy: !!fallback };
}

export async function decryptKey(ciphertext: string): Promise<string> {
  return (await readStoredKey(ciphertext)).key;
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.startsWith(ENC_PREFIX)) return "••••••••••••••••";
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

// helper for API: build decrypted vault payload for server
export async function getDecryptedVaultForApi(vault: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vault)) {
    if (!v) continue;
    if (typeof v === "string") {
      // legacy
      const key = cleanKey(v);
      if (key) out[k] = { provider: k, key, connected: true };
    } else if (typeof v === "object" && v !== null && "key" in v) {
      const entry = v as { key?: unknown };
      if (typeof entry.key !== "string" || !entry.key) continue;
      const dec = await decryptKey(entry.key);
      if (dec) out[k] = { ...(v as Record<string, unknown>), key: dec };
    }
  }
  return out;
}
