// Multimodal message content: a message body is either a plain string or an
// ordered list of typed parts (text / image / document). One shape, translated
// per provider in `llm-router`. Shared by the client (file intake) and the
// server (wire encoding) so both sides agree on the contract.
import type { ProviderId } from "./providers";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mime: string; data: string; detail?: "low" | "high" | "auto" }
  | { type: "document"; mime: string; data: string; name?: string };

export type MessageContent = string | ContentPart[];

// Per-part ceilings. Providers reject oversized payloads with a 400, so we trim
// locally rather than discovering it as a failed request.
export const MAX_TEXT_PART_CHARS = 400_000;
export const MAX_IMAGE_CHARS = 5_000_000; // ~3.7MB binary
export const MAX_DOCUMENT_CHARS = 21_000_000; // ~15.7MB binary (Anthropic 32MB/request cap)
export const MAX_TOTAL_PART_CHARS = 26_000_000;
export const MAX_IMAGES_PER_MESSAGE = 12;
export const MAX_DOCUMENTS_PER_MESSAGE = 6;
// Binary parts are kept on the message for replay, but storage is capped harder
// than the wire so a single 20MB PDF can't blow the localStorage quota.
export const MAX_PERSISTED_PART_CHARS = 5_000_000;

export const TRUNCATION_NOTE = "\n\n_[truncated — file too large for the full context window]_";

export function asParts(content: MessageContent | null | undefined): ContentPart[] {
  if (content == null) return [];
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  return Array.isArray(content) ? content.filter(Boolean) : [];
}

export function isBinaryPart(p: ContentPart): boolean {
  return p.type === "image" || p.type === "document";
}

export function partChars(p: ContentPart): number {
  if (p.type === "text") return p.text.length;
  return p.data.length;
}

/** Flatten to plain text — used for system prompts, tool results and providers
 *  that only accept strings. Binary parts collapse to a marker so the model
 *  still knows something was attached. */
export function flattenText(content: MessageContent | null | undefined): string {
  const parts = asParts(content);
  if (!parts.length) return "";
  return parts
    .map((p) => {
      if (p.type === "text") return p.text;
      if (p.type === "image") return `[image attached: ${p.mime}]`;
      return `[document attached: ${p.name || p.mime}]`;
    })
    .filter(Boolean)
    .join("\n\n");
}

export interface PartBudget {
  maxTextChars?: number;
  maxTotalChars?: number;
  maxImages?: number;
  maxDocuments?: number;
  /** drop binary parts entirely (e.g. a provider that rejected multimodal) */
  textOnly?: boolean;
}

/** Clamp part count + size. Binary parts are dropped (not truncated — a half
 *  base64 blob is undecodable) once a ceiling is hit. */
export function budgetParts(parts: ContentPart[], b: PartBudget = {}): ContentPart[] {
  const maxText = b.maxTextChars ?? MAX_TEXT_PART_CHARS;
  const maxTotal = b.maxTotalChars ?? MAX_TOTAL_PART_CHARS;
  const maxImages = b.maxImages ?? MAX_IMAGES_PER_MESSAGE;
  const maxDocs = b.maxDocuments ?? MAX_DOCUMENTS_PER_MESSAGE;

  const out: ContentPart[] = [];
  let total = 0;
  let images = 0;
  let docs = 0;

  for (const p of parts) {
    if (p.type === "text") {
      if (p.text.length > maxText) {
        const room = Math.max(0, maxTotal - total);
        if (room <= 0) break;
        out.push({ type: "text", text: p.text.slice(0, Math.min(room, maxText)) + TRUNCATION_NOTE });
        total += Math.min(room, maxText);
      } else {
        if (total + p.text.length > maxTotal) break;
        out.push(p);
        total += p.text.length;
      }
      continue;
    }
    if (b.textOnly) continue;
    if (p.type === "image") {
      if (images >= maxImages || p.data.length > MAX_IMAGE_CHARS) continue;
      if (total + p.data.length > maxTotal) break;
      images++;
      total += p.data.length;
      out.push(p);
    } else {
      if (docs >= maxDocs || p.data.length > MAX_DOCUMENT_CHARS) continue;
      if (total + p.data.length > maxTotal) break;
      docs++;
      total += p.data.length;
      out.push(p);
    }
  }
  return out;
}

/** Shrink a message's parts to what is safe to persist in localStorage. */
export function partsForStorage(parts: ContentPart[] | undefined): ContentPart[] | undefined {
  if (!parts?.length) return undefined;
  return budgetParts(parts, { maxTotalChars: MAX_PERSISTED_PART_CHARS, maxImages: 2, maxDocuments: 1 });
}

// ---------------------------------------------------------------- wire format

/** OpenAI / OpenRouter / Together / Mistral / NVIDIA / OmeRoute / AgentRouter. */
export function openAIParts(parts: ContentPart[]): unknown[] {
  const out: unknown[] = [];
  for (const p of parts) {
    if (p.type === "text") {
      if (p.text) out.push({ type: "text", text: p.text });
    } else if (p.type === "image") {
      out.push({ type: "image_url", image_url: { url: `data:${p.mime};base64,${p.data}`, detail: p.detail ?? "auto" } });
    } else {
      // OpenRouter's `file` part. Other OpenAI-compatible gateways ignore it
      // rather than erroring, and a text-only fallback covers the rest.
      out.push({ type: "file", file: { filename: p.name || "document.pdf", file_data: `data:${p.mime};base64,${p.data}` } });
    }
  }
  return out;
}

/** Anthropic messages API. */
export function anthropicParts(parts: ContentPart[]): unknown[] {
  const out: unknown[] = [];
  for (const p of parts) {
    if (p.type === "text") {
      if (p.text) out.push({ type: "text", text: p.text });
    } else if (p.type === "image") {
      out.push({ type: "image", source: { type: "base64", media_type: p.mime, data: p.data } });
    } else {
      out.push({ type: "document", source: { type: "base64", media_type: p.mime, data: p.data } });
    }
  }
  return out;
}

/** Google generateContent `parts`. */
export function googleParts(parts: ContentPart[]): unknown[] {
  return parts.map((p) => {
    if (p.type === "text") return { text: p.text };
    return { inlineData: { mimeType: p.mime, data: p.data } };
  });
}

/** Cohere v2 chat message content. */
export function cohereParts(parts: ContentPart[]): unknown[] {
  const out: unknown[] = [];
  for (const p of parts) {
    if (p.type === "text") {
      if (p.text) out.push({ type: "text", text: p.text });
    } else if (p.type === "image") {
      out.push({ type: "image_url", image_url: { url: `data:${p.mime};base64,${p.data}` } });
    } else {
      out.push({ type: "text", text: `[document attached: ${p.name || p.mime} — ${Math.round(p.data.length * 0.75 / 1024)}KB]` });
    }
  }
  return out;
}

// ------------------------------------------------------------- file intake

export type FileKind = "image" | "text" | "pdf" | "binary";

export interface PendingFile {
  name: string;
  mime: string;
  size: number;
  kind: FileKind;
  /** decoded text, for `kind === "text"` */
  text?: string;
  /** base64 payload, for `image` and natively-transported `pdf` */
  base64?: string;
  /** small data: URL for the composer chip */
  preview?: string;
  /** human-readable reason the file could not be attached yet */
  note?: string;
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_FILE_BYTES = 8 * 1024 * 1024;

export const ACCEPTED_FILE_TYPES =
  "image/*,.heic,.heif,.webp,.avif,.bmp,.tiff,.tif,.pdf,.docx,.doc,.xlsx,.xls,.csv,.tsv,.pptx,.txt,.md,.markdown,.json,.jsonl,.xml,.html,.htm,.css,.js,.jsx,.mjs,.cjs,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.h,.cpp,.hpp,.cs,.php,.sh,.bash,.zsh,.ps1,.sql,.yml,.yaml,.toml,.ini,.env,.log,.diff,.patch,.svelte,.vue,.swift,.kt,.lua,.r,.zip,.tar,.tar.gz,.tgz,.7z";

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "json", "jsonl", "xml", "html", "htm", "css", "js", "jsx", "mjs", "cjs",
  "ts", "tsx", "py", "rb", "go", "rs", "java", "c", "h", "cpp", "hpp", "cs", "php", "sh", "bash",
  "zsh", "ps1", "sql", "yml", "yaml", "toml", "ini", "env", "log", "csv", "tsv", "diff", "patch",
  "svelte", "vue", "swift", "kt", "lua", "r", "gitignore", "map",
]);

const MIME_FALLBACK: Record<string, string> = {
  zip: "application/zip",
  tar: "application/x-tar",
  "tar.gz": "application/gzip",
  tgz: "application/gzip",
  "7z": "application/x-7z-compressed",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  jsonl: "application/x-ndjson",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  svg: "image/svg+xml",
};

/** Browsers can't decode every image container, and providers reject the exotic
 *  ones. Re-map to a format both the preview <img> and the vision API accept. */
const IMAGE_MIME_ALIAS: Record<string, string> = {
  "image/heic": "image/png",
  "image/heif": "image/png",
  "image/jxl": "image/png",
  "image/x-ms-bmp": "image/bmp",
  "image/svg+xml": "image/png",
};

export function normalizeImageMime(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (IMAGE_MIME_ALIAS[m]) return IMAGE_MIME_ALIAS[m];
  if (!m.startsWith("image/")) return mime;
  return m;
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function guessMime(name: string, mime?: string): string {
  if (mime && mime !== "application/octet-stream") return mime;
  const ext = extOf(name);
  return MIME_FALLBACK[ext] || mime || "application/octet-stream";
}

export function classifyFile(name: string, mime: string): FileKind {
  const m = mime.toLowerCase();
  const ext = extOf(name);
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("text/") || m === "application/json" || m === "application/xml" || m === "application/x-ndjson") return "text";
  if (TEXT_EXT.has(ext)) return "text";
  return "binary";
}

/** Providers that accept a raw PDF and do the text extraction (and OCR) for us. */
export function supportsNativePdf(provider: ProviderId): boolean {
  return provider === "anthropic" || provider === "google" || provider === "openrouter";
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[]);
  }
  return btoa(bin);
}

/** Read picked files into attachable parts. Oversized or un-parseable files
 *  come back with a `note` instead of throwing so the composer can explain. */
export async function readPendingFiles(
  list: ArrayLike<File>,
  opts: { nativePdf: boolean } = { nativePdf: false },
): Promise<PendingFile[]> {
  const out: PendingFile[] = [];
  for (const f of Array.from(list)) {
    const mime = guessMime(f.name, f.type);
    const kind = classifyFile(f.name, mime);
    const base: PendingFile = { name: f.name, mime, size: f.size, kind };

    if (f.size > MAX_FILE_BYTES) {
      out.push({ ...base, note: `${(f.size / 1048576).toFixed(1)}MB exceeds the ${MAX_FILE_BYTES / 1048576}MB limit` });
      continue;
    }
    if (extOf(f.name) === 'zip') {
      // ZIP files are stored as binary documents in parts (or kept as pending for project workflows)
      try {
        const buf = await f.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        out.push({ ...base, kind: 'binary', base64: b64 });
      } catch (e) {
        out.push({ ...base, note: `could not read ZIP (${(e as Error).message})` });
      }
      continue;
    }
    if (kind === "image") {
      if (f.size > MAX_IMAGE_BYTES) {
        out.push({ ...base, note: `image is ${(f.size / 1048576).toFixed(1)}MB — max ${MAX_IMAGE_BYTES / 1048576}MB` });
        continue;
      }
      const imgMime = normalizeImageMime(mime);
      try {
        const b64 = arrayBufferToBase64(await f.arrayBuffer());
        out.push({ ...base, mime: imgMime, base64: b64, preview: `data:${imgMime};base64,${b64}` });
      } catch (e) {
        out.push({ ...base, note: `could not read image (${(e as Error).message})` });
      }
      continue;
    }
    if (kind === "pdf") {
      if (opts.nativePdf) {
        if (f.size > MAX_DOCUMENT_CHARS * 0.75) {
          out.push({ ...base, note: `PDF is ${(f.size / 1048576).toFixed(1)}MB — too large to send whole` });
          continue;
        }
        try {
          out.push({ ...base, base64: arrayBufferToBase64(await f.arrayBuffer()) });
        } catch (e) {
          out.push({ ...base, note: `could not read PDF (${(e as Error).message})` });
        }
      } else {
        out.push({ ...base, note: "PDF text extraction not wired up yet — pick Anthropic, Google or OpenRouter to read PDFs directly" });
      }
      continue;
    }
    if (kind === "text") {
      if (f.size > MAX_TEXT_FILE_BYTES) {
        out.push({ ...base, note: `text file is ${(f.size / 1048576).toFixed(1)}MB — max ${MAX_TEXT_FILE_BYTES / 1048576}MB` });
        continue;
      }
      try {
        out.push({ ...base, text: await f.text() });
      } catch (e) {
        out.push({ ...base, note: `could not read file (${(e as Error).message})` });
      }
      continue;
    }
    const ext = extOf(f.name).toUpperCase() || "binary";
    out.push({ ...base, note: `${ext} parsing not wired up yet` });
  }
  return out;
}

const FENCE_LANG: Record<string, string> = {
  js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", py: "python", rb: "ruby", go: "go",
  rs: "rust", java: "java", c: "c", h: "c", cpp: "cpp", cs: "csharp", php: "php", sh: "bash",
  bash: "bash", zsh: "bash", ps1: "powershell", sql: "sql", yml: "yaml", yaml: "yaml",
  json: "json", jsonl: "json", xml: "xml", html: "html", htm: "html", css: "css", md: "markdown",
  csv: "csv", tsv: "csv", toml: "toml", ini: "ini", diff: "diff", patch: "diff", svelte: "svelte",
  vue: "vue", swift: "swift", kt: "kotlin", lua: "lua", r: "r", log: "text", env: "bash",
};

/** Wrap file text in a fenced block with a source header so the model can tell
 *  generated code from pasted code. */
export function textPartFor(p: PendingFile, maxChars: number): ContentPart | null {
  if (p.text == null) return null;
  const lang = FENCE_LANG[extOf(p.name)] ?? "";
  const body = p.text.length > maxChars ? p.text.slice(0, maxChars) + TRUNCATION_NOTE : p.text;
  return {
    type: "text",
    text: `--- ${p.name} (${p.mime}, ${(p.size / 1024).toFixed(1)}KB) ---\n\`\`\`${lang}\n${body}\n\`\`\``,
  };
}

/** Compose the outgoing user turn: typed parts for attachable files, plain
 *  text plus a marker for the ones we cannot send yet. */
export function pendingFileToParts(p: PendingFile, maxTextChars = MAX_TEXT_PART_CHARS): ContentPart[] {
  if (p.base64 != null) {
    return p.kind === "image"
      ? [{ type: "image", mime: p.mime, data: p.base64 }]
      : [{ type: "document", mime: p.mime, data: p.base64, name: p.name }];
  }
  if (p.text != null) {
    const part = textPartFor(p, maxTextChars);
    return part ? [part] : [];
  }
  return [];
}

export function pendingFileMarker(p: PendingFile): ContentPart | null {
  if (p.base64 != null || p.text != null) return null;
  return { type: "text", text: `[not attached: ${p.name} (${p.mime}) — ${p.note || "unsupported format"}]` };
}

export function summarizePendingFiles(files: PendingFile[]): string {
  const ok = files.filter((f) => f.base64 != null || f.text != null);
  const skipped = files.filter((f) => f.base64 == null && f.text == null);
  const bits: string[] = [];
  if (ok.length) bits.push(`${ok.length} attached`);
  if (skipped.length) bits.push(`${skipped.length} skipped`);
  return bits.join(" · ");
}
