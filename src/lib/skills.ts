"use client";

// Skill packages for MEDUSA OS.
//
// A skill is a folder with a `SKILL.md` manifest (YAML frontmatter + markdown
// instructions) plus optional scripts/assets — the same convention used by
// Claude and OpenCode. This module accepts a ZIP upload, validates the manifest,
// keeps the files in IndexedDB (localStorage is far too small for the bundled
// skill packs) and mirrors them onto disk when the desktop bridge is present.
import { extractZip, packZip, base64ToUint8, uint8ToBase64 } from "./zip";
import { desktopBridge } from "./desktop";
import type { InstalledSkill, SkillSource } from "./skill-prompt";

export type { InstalledSkill, SkillSource } from "./skill-prompt";

export interface SkillFile {
  /** POSIX path relative to the skill root. */
  path: string;
  /** UTF-8 body for text files. */
  text?: string;
  /** Base64 body for binary files. */
  base64?: string;
  bytes: number;
}

export interface SkillPackage {
  skill: InstalledSkill;
  files: SkillFile[];
  ignored: string[];
}

export interface BuiltinSkill {
  id: string;
  name: string;
  description: string;
  url: string;
  version: string;
}

/** Skills that ship with MEDUSA. Installed on demand from /public/skills. */
export const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    id: "stickman",
    name: "Stickman",
    description:
      "Turn a topic into a finished stickman film rendered entirely from code: flat 2D characters, a dusk palette, film-style camera work and real sound. Also writes voiceover scripts, YouTube titles and thumbnail prompts.",
    url: "/skills/stickman.zip",
    version: "1.0.0",
  },
  {
    id: "report-studio",
    name: "Report Studio",
    description:
      "Turn a brief, dataset or research question into a polished, branded PDF and Word report with cover page, table of contents, charts, tables and page numbers. Use for reports, proposals, analyses, whitepapers and client deliverables.",
    url: "/skills/report-studio.zip",
    version: "1.0.0",
  },
];

const DB_NAME = "medusa-skills";
const DB_VERSION = 1;
const STORE = "packages";
const MAX_PACKAGE_BYTES = 40 * 1024 * 1024;
const MAX_PACKAGE_FILES = 4_000;
const MAX_LISTED_FILES = 500;

/* -------------------------------------------------------------------------- */
/* storage: IndexedDB with an in-memory fallback                              */
/* -------------------------------------------------------------------------- */

interface PackageRecord {
  id: string;
  files: SkillFile[];
  savedAt: string;
}

const memoryPackages = new Map<string, SkillFile[]>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function saveSkillFiles(id: string, files: SkillFile[]): Promise<void> {
  memoryPackages.set(id, files);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id, files, savedAt: new Date().toISOString() } satisfies PackageRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Could not save skill files"));
      tx.onabort = () => reject(tx.error || new Error("Skill save aborted"));
    } catch (e) {
      reject(e);
    }
  }).catch(() => {
    /* IndexedDB failed — the memory copy still serves this session */
  });
}

export async function loadSkillFiles(id: string): Promise<SkillFile[] | null> {
  const cached = memoryPackages.get(id);
  if (cached) return cached;
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        const rec = req.result as PackageRecord | undefined;
        if (!rec?.files) return resolve(null);
        memoryPackages.set(id, rec.files);
        resolve(rec.files);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function deleteSkillFiles(id: string): Promise<void> {
  memoryPackages.delete(id);
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getSkillFile(id: string, path: string): Promise<SkillFile | null> {
  const files = await loadSkillFiles(id);
  return files?.find((f) => f.path === path) ?? null;
}

/* -------------------------------------------------------------------------- */
/* parsing                                                                    */
/* -------------------------------------------------------------------------- */

export function slugify(value: string): string {
  return (
    (value || "skill")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "skill"
  );
}

function splitFrontmatter(markdown: string): { data: Record<string, string>; body: string } {
  const text = markdown.replace(/^\uFEFF/, "");
  if (!/^---\s*\r?\n/.test(text)) return { data: {}, body: text };

  const endMatch = /\r?\n---\s*(?:\r?\n|$)/.exec(text.slice(3));
  if (!endMatch) return { data: {}, body: text };

  const dataBlock = text.slice(3, 3 + endMatch.index);
  const body = text.slice(3 + endMatch.index + endMatch[0].length);
  const data: Record<string, string> = {};
  let lastKey = "";

  for (const rawLine of dataBlock.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const kv = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) {
      lastKey = kv[1];
      let value = kv[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      data[lastKey] = value;
    } else if (lastKey && /^\s+/.test(rawLine)) {
      // folded / continued scalar
      data[lastKey] = `${data[lastKey]} ${line.trim()}`.trim();
    }
  }

  return { data, body };
}

function firstParagraph(body: string): string {
  const line = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith("|") && !l.startsWith("```"));
  return line?.replace(/[*_`]/g, "").slice(0, 240) ?? "";
}

export function parseSkillMarkdown(markdown: string, fallbackName = "skill"): Pick<InstalledSkill, "name" | "description" | "version" | "instructions"> {
  const { data, body } = splitFrontmatter(markdown);
  const name = (data.name || fallbackName).trim() || fallbackName;
  const description = (data.description || firstParagraph(body) || "").trim();
  const version = data.version?.trim() || undefined;
  return { name, description, version, instructions: body.trim() || markdown.trim() };
}

function decodeEntry(path: string, data: Uint8Array): SkillFile {
  const bytes = data.byteLength;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    // Control characters are a strong signal for a binary file that happened to
    // decode as valid UTF-8 (ogg, png, zip, …).
    if (!/[\u0000-\u0008\u000e-\u001f]/.test(text)) return { path, text, bytes };
  } catch {
    /* not UTF-8 — store it as binary */
  }
  return { path, base64: uint8ToBase64(data), bytes };
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i + 1);
}

function toBytes(content: Uint8Array | string): Uint8Array {
  return typeof content === "string" ? new TextEncoder().encode(content) : content;
}

function findManifest(files: { path: string }[]): string | null {
  const candidates = files.filter((f) => /(^|\/)skill\.md$/i.test(f.path));
  if (!candidates.length) return null;
  // The shallowest SKILL.md is the package root (avoids a nested example).
  return candidates.sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.length - b.path.length)[0].path;
}

function stripRoot(path: string, root: string): string {
  return root && path.startsWith(root) ? path.slice(root.length) : path;
}

/* -------------------------------------------------------------------------- */
/* install                                                                    */
/* -------------------------------------------------------------------------- */

async function finalize(
  skill: InstalledSkill,
  files: SkillFile[],
  ignored: string[],
  existing: InstalledSkill[]
): Promise<SkillPackage> {
  const previous = existing.find((s) => s.id === skill.id);
  const now = new Date().toISOString();
  skill.installedAt = previous?.installedAt || now;
  skill.updatedAt = now;
  skill.enabled = previous?.enabled ?? true;

  await saveSkillFiles(skill.id, files);

  // Desktop: mirror the package onto disk so the model can actually read and run
  // the scripts. Browser: files stay in IndexedDB and can be exported/saved later.
  try {
    const diskPath = await saveSkillToDisk(skill, files);
    if (diskPath) skill.diskPath = diskPath;
  } catch {
    /* disk mirror is best effort — the in-app copy still works */
  }

  return { skill, files, ignored };
}

export function skillFromZip(
  input: ArrayBuffer | Uint8Array,
  source: SkillSource,
  fallbackName = "skill"
): SkillPackage {
  const { files: extracted, ignored } = extractZip(input);
  if (!extracted.length) throw new Error("That ZIP is empty or could not be read.");
  const raw = extracted.map((f) => ({ path: f.path, content: toBytes(f.content) }));

  const manifestPath = findManifest(raw);
  if (!manifestPath) throw new Error("No SKILL.md found. A skill ZIP must contain a SKILL.md at its root (or inside one top-level folder).");

  const root = dirname(manifestPath);
  const scoped = raw.filter((f) => !root || f.path.startsWith(root));
  if (!scoped.length) throw new Error("The skill folder is empty.");

  const totalBytes = scoped.reduce((n, f) => n + f.content.byteLength, 0);
  if (scoped.length > MAX_PACKAGE_FILES) throw new Error(`That skill has ${scoped.length} files (max ${MAX_PACKAGE_FILES}).`);
  if (totalBytes > MAX_PACKAGE_BYTES) throw new Error(`That skill is ${formatBytes(totalBytes)} (max ${formatBytes(MAX_PACKAGE_BYTES)}).`);

  const manifest = scoped.find((f) => f.path === manifestPath)!;
  let markdown: string;
  try {
    markdown = new TextDecoder("utf-8", { fatal: true }).decode(manifest.content);
  } catch {
    throw new Error("SKILL.md is not valid UTF-8 text.");
  }

  const parsed = parseSkillMarkdown(markdown, fallbackName);
  const files = scoped.map((f) => decodeEntry(stripRoot(f.path, root), f.content));
  const entry = stripRoot(manifestPath, root);
  const id = slugify(parsed.name || fallbackName);

  const skill: InstalledSkill = {
    id,
    name: parsed.name,
    description: parsed.description,
    version: parsed.version,
    source,
    enabled: true,
    instructions: parsed.instructions,
    entry,
    files: files.map((f) => f.path).slice(0, MAX_LISTED_FILES),
    fileCount: files.length,
    bytes: totalBytes,
    installedAt: "",
    updatedAt: "",
  };

  return { skill, files, ignored };
}

export function skillFromMarkdown(markdown: string, filename: string): SkillPackage {
  const parsed = parseSkillMarkdown(markdown, filename.replace(/\.md$/i, ""));
  const bytes = new TextEncoder().encode(markdown).byteLength;
  const files: SkillFile[] = [{ path: "SKILL.md", text: markdown, bytes }];
  const skill: InstalledSkill = {
    id: slugify(parsed.name),
    name: parsed.name,
    description: parsed.description,
    version: parsed.version,
    source: "upload",
    enabled: true,
    instructions: parsed.instructions,
    entry: "SKILL.md",
    files: ["SKILL.md"],
    fileCount: 1,
    bytes,
    installedAt: "",
    updatedAt: "",
  };
  // `finalize` is async (IndexedDB + disk), so this returns a package whose
  // caller awaits `commitSkillPackage`.
  return { skill, files, ignored: [] };
}

/** Persist a parsed package (IndexedDB + desktop disk mirror). */
export async function commitSkillPackage(pkg: SkillPackage, existing: InstalledSkill[] = []): Promise<SkillPackage> {
  return finalize(pkg.skill, pkg.files, pkg.ignored, existing);
}

export async function installSkillZip(
  input: ArrayBuffer | Uint8Array,
  existing: InstalledSkill[] = [],
  source: SkillSource = "upload"
): Promise<SkillPackage> {
  return commitSkillPackage(skillFromZip(input, source), existing);
}

export async function installSkillMarkdown(markdown: string, filename: string, existing: InstalledSkill[] = []): Promise<SkillPackage> {
  return commitSkillPackage(skillFromMarkdown(markdown, filename), existing);
}

export async function installBuiltinSkill(id: string, existing: InstalledSkill[] = []): Promise<SkillPackage> {
  const builtin = BUILTIN_SKILLS.find((b) => b.id === id);
  if (!builtin) throw new Error(`Unknown built-in skill: ${id}`);
  const res = await fetch(builtin.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not download ${builtin.name} (HTTP ${res.status}).`);
  const buf = await res.arrayBuffer();
  const pkg = skillFromZip(buf, "builtin", builtin.name);
  // Keep the catalogue id stable even if the manifest name changes.
  pkg.skill.id = builtin.id;
  pkg.skill.version = pkg.skill.version || builtin.version;
  return commitSkillPackage(pkg, existing);
}

/* -------------------------------------------------------------------------- */
/* disk mirror (desktop app)                                                  */
/* -------------------------------------------------------------------------- */

/** Write every file of a skill under Documents/MEDUSA/skills/<id>. */
export async function saveSkillToDisk(skill: InstalledSkill, files: SkillFile[]): Promise<string | undefined> {
  const bridge = desktopBridge();
  if (!bridge?.isDesktop) return undefined;

  const base = await bridge.baseFolder().catch(() => null);
  if (!base?.path) return undefined;

  const root = `${base.path}\\skills\\${slugify(skill.id)}`;
  const created = await bridge.createFolder?.(root);
  if (created && !created.ok) throw new Error(created.error || "Could not create the skill folder.");

  const chunkSize = 8;
  for (let i = 0; i < files.length; i += chunkSize) {
    await Promise.all(
      files.slice(i, i + chunkSize).map(async (file) => {
        const abs = `${root}\\${file.path.replace(/\//g, "\\")}`;
        const result = file.base64
          ? await bridge.writeBinary?.({ path: abs, base64: file.base64 })
          : await bridge.writeFile({ path: abs, content: file.text ?? "" });
        if (result && !result.ok) throw new Error(result.error || `Could not write ${file.path}`);
      })
    );
  }

  return root;
}

export async function saveSkillFilesToDisk(skill: InstalledSkill): Promise<string | undefined> {
  const files = await loadSkillFiles(skill.id);
  if (!files?.length) throw new Error("This skill has no stored files.");
  return saveSkillToDisk(skill, files);
}

export async function removeSkillPackage(id: string): Promise<void> {
  await deleteSkillFiles(id);
}

/* -------------------------------------------------------------------------- */
/* export                                                                     */
/* -------------------------------------------------------------------------- */

export function exportSkillZip(files: SkillFile[]): Uint8Array {
  return packZip(
    files.map((f) => ({
      path: f.path,
      content: f.base64 ? base64ToUint8(f.base64) : f.text ?? "",
    }))
  );
}

export function downloadSkillZip(skill: InstalledSkill, files: SkillFile[]): void {
  const zip = exportSkillZip(files);
  const blob = new Blob([zip.slice().buffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(skill.name)}-skill.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}
