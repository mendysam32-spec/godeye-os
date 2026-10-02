import { unzipSync, zipSync, type Zippable } from 'fflate';

export type ZipFileEntry = {
  path: string; // POSIX relative path
  content: Uint8Array | string;
};

export type ExtractedZip = {
  files: ZipFileEntry[];
  ignored: string[];
};

const IGNORED_DIRS = [
  ".git", "node_modules", ".next", ".open-next", ".wrangler", ".turbo", ".cache",
  ".vercel", ".svelte-kit", "dist", "build", "out", "coverage", "__pycache__",
  ".venv", "venv", ".idea",
];
const IGNORED_FILES = [
  ".DS_Store", "Thumbs.db", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  "bun.lockb", "tsconfig.tsbuildinfo",
];

function isIgnored(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((p) => IGNORED_DIRS.includes(p))) return true;
  const base = parts[parts.length - 1] || "";
  if (IGNORED_FILES.includes(base)) return true;
  if (base.endsWith(".log") || base.endsWith(".map")) return true;
  return false;
}

function normalizePath(p: string): string {
  let out = p.replace(/\\/g, '/');
  out = out.replace(/^\.\/+/, '');
  out = out.replace(/^\/+/, '');
  if (out.startsWith('../') || out.includes('/../') || out === '..') {
    return '';
  }
  return out;
}

export function extractZip(buffer: ArrayBuffer | Uint8Array): ExtractedZip {
  const input = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let filesMap: Record<string, Uint8Array>;
  try {
    filesMap = unzipSync(input);
  } catch {
    // not a valid archive - caller reports it
    return { files: [], ignored: [] };
  }
  const files: ZipFileEntry[] = [];
  const ignored: string[] = [];
  for (const [rawPath, data] of Object.entries(filesMap)) {
    const np = normalizePath(rawPath);
    if (!np || np.endsWith("/")) continue;
    if (isIgnored(np)) {
      ignored.push(np);
      continue;
    }
    files.push({ path: np, content: data });
  }
  return { files, ignored };
}

export function packZip(files: ZipFileEntry[]): Uint8Array {
  const zippable: Zippable = {};
  for (const f of files) {
    const np = normalizePath(f.path);
    if (!np || np.endsWith('/')) continue;
    if (isIgnored(np)) continue;
    const content = typeof f.content === 'string' ? new TextEncoder().encode(f.content) : f.content;
    zippable[np] = content;
  }
  return zipSync(zippable);
}

/** Copy into a standalone ArrayBuffer - fflate hands back views over a pooled
 *  buffer that fetch()/Blob constructors reject. */
function exact(u: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u.byteLength);
  new Uint8Array(out).set(u);
  return out;
}

export function zipToArrayBuffer(files: ZipFileEntry[]): ArrayBuffer {
  return exact(packZip(files));
}

export function uint8ToBase64(u: Uint8Array): string {
  const bytes = u instanceof Uint8Array ? u : new Uint8Array(u);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const u = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) u[i] = binary.charCodeAt(i);
  return u;
}
