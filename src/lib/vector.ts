/**
 * Local, deterministic feature vectors for semantic memory ranking.
 *
 * This is intentionally NOT a neural embedding model: it needs no API key, no
 * download and no network, so it works on an air-gapped device. Words and word
 * bigrams are hashed into a fixed-width, signed bag-of-features vector, squashed
 * with log1p and L2-normalised. Cosine similarity then gives a bounded,
 * reproducible "semantic-ish" score that complements the lexical ranker.
 *
 * The vector format is versioned (`VECTOR_MODEL`) so it can be swapped for a
 * real embedding provider later without silently mixing incompatible vectors.
 */

export const VECTOR_DIMS = 64;
export const VECTOR_MODEL = "local-hash-v1";

/** FNV-1a, unsigned. Deterministic across Workers, Node and browsers. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function features(text: string): string[] {
  const words = String(text ?? "").toLowerCase().match(/[a-z0-9_-]{2,}/g) ?? [];
  const out: string[] = [...words];
  // Bigrams capture short phrases ("use typescript", "decided migrate").
  for (let i = 0; i < words.length - 1; i++) out.push(`${words[i]}_${words[i + 1]}`);
  return out;
}

/** Embed text into a signed, L2-normalised `VECTOR_DIMS`-length vector. */
export function embedText(text: string, dims = VECTOR_DIMS): number[] {
  const vec = new Array<number>(dims).fill(0);
  for (const feature of features(text)) {
    const h = hash(feature);
    // Signed hashing keeps unrelated collisions from only ever adding signal.
    vec[h % dims] += (h >>> 9) & 1 ? 1 : -1;
  }
  for (let i = 0; i < dims; i++) {
    vec[i] = Math.sign(vec[i]) * Math.log1p(Math.abs(vec[i]));
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => Math.round((v / norm) * 10_000) / 10_000);
}

/** Parse a stored JSON vector, rejecting anything from an older format. */
export function parseVector(raw: unknown): number[] | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) &&
      parsed.length === VECTOR_DIMS &&
      parsed.every((n) => typeof n === "number" && Number.isFinite(n))
      ? parsed as number[]
      : null;
  } catch {
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return Math.max(-1, Math.min(1, dot / (Math.sqrt(na) * Math.sqrt(nb))));
}
