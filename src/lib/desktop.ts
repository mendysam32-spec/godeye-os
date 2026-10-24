"use client";

// Client-side wrapper around the Electron desktop bridge (window.medusa).
// In a plain browser every function degrades gracefully (download / "N/A"),
// so the same UI powers both the desktop app and the web build.
import type { MEDUSASystemInfo } from "@/types/desktop";
import { makeZip, makeDocx, makePdf, bufToBase64, base64ToBuf, MIME_DOCX } from "./file-builder";
import { isServerTool } from "./tools";

interface MEDUSADesktopBridge {
  isDesktop: boolean;
  platform: string;
  bridgeVersion?: number;
  systemInfo(): Promise<MEDUSASystemInfo>;
  baseFolder(): Promise<{ path: string; exists: boolean }>;
  saveFile(options: { content: string; defaultName?: string; title?: string }): Promise<{ canceled: boolean; filePath?: string; error?: string }>;
  writeFile(payload: { path: string; content: string }): Promise<{ ok: boolean; path?: string; error?: string }>;
  writeBinary?(payload: { path: string; base64: string }): Promise<{ ok: boolean; path?: string; error?: string }>;
  createFolder?(folderPath: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  readText(path: string): Promise<{ ok: boolean; path?: string; content?: string; error?: string }>;
  pickAndRead(filters?: { name: string; extensions: string[] }[]): Promise<{ canceled?: boolean; path?: string; content?: string; error?: string }>;
  runCommand(payload: { command: string; cwd?: string; timeoutMs?: number }): Promise<{ ok: boolean; exitCode: number; stdout: string; stderr: string; timedOut: boolean }>;
  writeProject?(payload: { name: string; files: { path: string; base64: string }[]; mode?: "into" | "new"; dir?: string }): Promise<{ ok: boolean; canceled?: boolean; path?: string; written?: number; skipped?: string[]; failed?: string[]; error?: string; detail?: string }>;
  openPath(target: string): Promise<{ ok: boolean; error?: string }>;
  listDir?(payload: { path?: string; recursive?: boolean; maxEntries?: number }): Promise<{ ok: boolean; path?: string; count?: number; entries?: DirEntry[]; truncated?: boolean; error?: string }>;
  editFile?(payload: { path: string; content?: string; find?: string; replace?: string; all?: boolean; createIfMissing?: boolean }): Promise<{ ok: boolean; path?: string; created?: boolean; unchanged?: boolean; bytes?: number; error?: string; detail?: string }>;
  movePath?(payload: { from: string; to: string; overwrite?: boolean }): Promise<{ ok: boolean; path?: string; error?: string; detail?: string }>;
  copyPath?(payload: { from: string; to: string; recursive?: boolean; overwrite?: boolean }): Promise<{ ok: boolean; path?: string; count?: number; error?: string; detail?: string }>;
  deletePath?(payload: { path: string; recursive?: boolean; dryRun?: boolean }): Promise<{ ok: boolean; path?: string; dryRun?: boolean; error?: string; detail?: string }>;
  sysStats?(): Promise<SystemStats>;
}

export interface DirEntry {
  path: string;
  rel: string;
  type: "file" | "dir" | "link";
  size: number;
  modified: string | null;
}

export interface SystemStats {
  ok: boolean;
  cpu: { busyPercent: number; cores: number; model: string; speedMhz: number; perCore: number[]; loadAvg: number[] | null };
  memory: { totalBytes: number; freeBytes: number; usedBytes: number; usedPercent: number };
  disk: { path: string; totalBytes: number; freeBytes: number } | null;
  network: { receivedBytes: number; sentBytes: number } | null;
  interfaces: { name: string; address: string; family: string | number; internal: boolean; mac: string }[];
  system: {
    platform: string;
    release: string;
    arch: string;
    hostname: string;
    user: string | null;
    uptimeSeconds: number;
    processUptimeSeconds: number;
    node: string;
    electron: string;
    chrome: string;
  };
}


export interface ToolFile {
  name: string;
  type: string;
  content?: string;
  base64?: string;
  savedPath?: string;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  detail?: string;
  path?: string;
  files?: ToolFile[];
}

/** Chat context a server-side tool needs (provider key, active model). */
export interface ToolContext {
  provider?: string;
  model?: string;
  vault?: Record<string, unknown>;
}

const encoder = new TextEncoder();

function bridge(): MEDUSADesktopBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { medusa?: MEDUSADesktopBridge }).medusa ?? null;
}

export const desktopBridge = bridge;
export const isDesktop = (): boolean => !!bridge()?.isDesktop;

export function joinBasePath(folder: string | undefined, name: string): string {
  const f = (folder || "").replace(/^[/\\]+|[\\/]+$/g, "");
  const n = name.replace(/^[/\\]+/g, "").replace(/\//g, "\\");
  return f ? `${f}\\${n}` : n;
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function downloadFallback(content: string, name: string, type = "text/plain;charset=utf-8"): string {
  downloadBlob(new Blob([content], { type }), name);
  return name;
}

export function downloadToolFile(f: ToolFile): string {
  if (f.base64) downloadBlob(new Blob([base64ToBuf(f.base64)], { type: f.type || "application/octet-stream" }), f.name);
  else downloadBlob(new Blob([f.content || ""], { type: f.type || "text/plain;charset=utf-8" }), f.name);
  return f.name;
}

export async function saveTextToDisk(content: string, filename: string, title?: string): Promise<ToolResult> {
  const b = bridge();
  if (b) {
    try {
      const r = await b.saveFile({ content, defaultName: filename, title });
      if (r.canceled) return { ok: false, summary: "Save cancelled" };
      if (r.error) return { ok: false, summary: r.error };
      return { ok: true, summary: `Saved ${r.filePath}`, path: r.filePath };
    } catch (e) {
      return { ok: false, summary: String((e && (e as Error).message) || e) };
    }
  }
  return { ok: true, summary: `Downloaded ${downloadFallback(content, filename)}`, path: `download:${filename}` };
}

// Deliver generated files. Desktop: write each into the Documents/MEDUSA base
// folder (sub-folders allowed) and return real paths. Browser: hand back the
// data so the UI can offer per-file download buttons.
async function deliverFiles(
  src: { name: string; content?: string; base64?: string; type: string }[],
  folder?: string
): Promise<ToolFile[]> {
  const out: ToolFile[] = [];
  const b = bridge();
  for (const s of src) {
    const item: ToolFile = { name: s.name, type: s.type };
    if (s.base64) item.base64 = s.base64;
    else item.content = s.content;
    if (b) {
      const dir = await b.baseFolder().catch(() => ({ path: "", exists: false }));
      const abs = joinBasePath(folder || dir.path, s.name);
      const saved = s.base64
        ? await b.writeBinary?.({ path: abs, base64: s.base64 })
        : await b.writeFile({ path: abs, content: s.content ?? "" });
      if (saved?.ok) item.savedPath = saved.path;
    }
    out.push(item);
  }
  return out;
}

/**
 * Run a server-side tool (web search, URL fetch, API call, database query,
 * image generation). These need the network without CORS, the D1 binding, or a
 * provider key that must not live in the renderer, so they are executed by
 * `POST /api/tools/run` instead. Files it produces are delivered exactly like
 * locally-created ones: written to disk on desktop, downloadable in a browser.
 */
async function runServerTool(
  name: string,
  args: Record<string, unknown>,
  ctx?: ToolContext
): Promise<ToolResult> {
  let payload: { ok?: boolean; summary?: string; detail?: string; path?: string; files?: ToolFile[]; error?: string };
  try {
    const res = await fetch("/api/tools/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, args, provider: ctx?.provider, model: ctx?.model, vault: ctx?.vault }),
    });
    payload = await res.json();
    if (!res.ok && !payload?.summary) throw new Error(payload?.error || `HTTP ${res.status}`);
  } catch (e) {
    return { ok: false, summary: `${name} failed: ${String((e && (e as Error).message) || e)}` };
  }

  const summary = payload.summary || `${name} done`;
  if (payload.ok === false) return { ok: false, summary, detail: payload.detail };

  // Persist anything the server generated (generated images) like a local save.
  let files = payload.files;
  if (files?.length && bridge()) {
    files = await deliverFiles(
      files.map((f) => ({ name: f.name, content: f.content, base64: f.base64, type: f.type })),
      args.folder as string | undefined
    );
  }
  return { ok: true, summary, detail: payload.detail, path: payload.path, files };
}

function humanBytes(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function formatStats(s: SystemStats): string {
  const mins = Math.floor(s.system.uptimeSeconds / 60);
  const uptime = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
  const lines = [
    `CPU ${s.cpu.busyPercent}% busy — ${s.cpu.cores} cores, ${s.cpu.model}`,
    `  per-core: ${s.cpu.perCore.join("% / ")}%`,
    s.cpu.loadAvg ? `  load average: ${s.cpu.loadAvg.join("  ")}` : "",
    `Memory ${s.memory.usedPercent}% used — ${humanBytes(s.memory.usedBytes)} of ${humanBytes(s.memory.totalBytes)} (${humanBytes(s.memory.freeBytes)} free)`,
    s.disk ? `Disk ${s.disk.path} — ${humanBytes(s.disk.freeBytes)} free of ${humanBytes(s.disk.totalBytes)}` : "Disk: not reported on this platform",
    s.network ? `Network — ${humanBytes(s.network.receivedBytes)} received / ${humanBytes(s.network.sentBytes)} sent (since boot)` : "Network counters: Windows only",
    `Up ${uptime} — ${s.system.hostname}${s.system.user ? ` (${s.system.user})` : ""} · ${s.system.platform} ${s.system.release} ${s.system.arch}`,
    `Interfaces: ${s.interfaces.filter((i) => !i.internal).map((i) => `${i.name} ${i.address}`).join(", ") || "none external"}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export async function runMEDUSATool(name: string, args: Record<string, unknown>, ctx?: ToolContext): Promise<ToolResult> {
  const b = bridge();
  if (isServerTool(name)) return runServerTool(name, args, ctx);
  try {
    switch (name) {
      case "medusa_saveFile": {
        const fileName = String(args?.name ?? "output.txt");
        const content = String(args?.content ?? "");
        const base64 = args?.base64 as string | undefined;
        const type = String(args?.type ?? "text/plain");
        const folder = args?.folder as string | undefined;
        const full = folder ? `${folder.trim().replace(/[/\\]+$/, "")}/${fileName.replace(/^[/\\]+/, "")}` : fileName;
        const delivered = await deliverFiles([{ name: full, content: base64 ? undefined : content, base64, type }], folder);
        const f = delivered[0];
        const loc = f?.savedPath ? f.savedPath : "download available";
        return { ok: true, summary: `${base64 ? "Saved binary" : "Saved"} ${fileName} (${loc})`, files: delivered };
      }
      case "medusa_createFolder": {
        const folder = String(args?.folder ?? args?.name ?? "folder").replace(/^[/\\]+/, "").replace(/[\\/]+$/, "");
        if (!folder) return { ok: false, summary: "No folder name given" };
        if (b?.createFolder) {
          const dir = await b.baseFolder().catch(() => ({ path: "", exists: false }));
          const abs = joinBasePath(dir.path, folder);
          const r = await b.createFolder(abs);
          return r?.ok ? { ok: true, summary: `Created folder ${abs}`, path: r.path } : { ok: false, summary: r?.error || "Failed to create folder" };
        }
        const zip = makeZip([{ path: `${folder}/`, data: new Uint8Array(0) }]);
        const safeName = folder.replace(/[\\/:*?"<>|]+/g, "-");
        return {
          ok: true,
          summary: `Created folder "${folder}" — browser can't make bare folders, so a ZIP holding the empty folder was generated`,
          files: [{ name: `${safeName}.zip`, type: "application/zip", base64: bufToBase64(zip) }],
        };
      }
      case "medusa_createZip": {
        const rawFiles = Array.isArray(args?.files) ? (args.files as { path?: string; name?: string; content?: string; base64?: string; type?: string }[]) : [];
        const entries = rawFiles
          .filter((f) => f && (f.path || f.name))
          .map((f) => ({
            path: (f.path || f.name!).replace(/^[/\\]+/, "").replace(/\\/g, "/"),
            data: f.base64 ? base64ToBuf(f.base64) : encoder.encode(f.content ?? ""),
          }));
        const folder = (args?.folder as string | undefined)?.trim().replace(/[/\\]+$/, "").replace(/\\/g, "/");
        if (folder) entries.forEach((e) => (e.path = `${folder}/${e.path}`));
        if (!entries.length) return { ok: false, summary: "No files provided to package" };
        const zipName = String(args?.name ?? args?.filename ?? "archive.zip").replace(/\.zip$/i, "") + ".zip";
        const zip = makeZip(entries);
        const delivered = await deliverFiles([{ name: zipName, base64: bufToBase64(zip), type: "application/zip" }], args?.folder as string | undefined);
        return { ok: true, summary: `Zipped ${entries.length} file(s)${delivered[0]?.savedPath ? ` → ${delivered[0].savedPath}` : " — download available"}`, files: delivered };
      }
      case "medusa_createDocx": {
        const docName = String(args?.name ?? args?.filename ?? "document.docx").replace(/\.docx$/i, "") + ".docx";
        const doc = makeDocx({ title: String(args?.title ?? args?.heading ?? ""), content: String(args?.content ?? "") });
        const delivered = await deliverFiles([{ name: docName, base64: bufToBase64(doc), type: MIME_DOCX }], args?.folder as string | undefined);
        return { ok: true, summary: `Created Word document ${docName}${delivered[0]?.savedPath ? ` → ${delivered[0].savedPath}` : " — download available"}`, files: delivered };
      }
      case "medusa_createPdf": {
        const pdfName = String(args?.name ?? args?.filename ?? "document.pdf").replace(/\.pdf$/i, "") + ".pdf";
        const pdf = makePdf({ title: String(args?.title ?? args?.heading ?? ""), content: String(args?.content ?? "") });
        const delivered = await deliverFiles([{ name: pdfName, base64: bufToBase64(pdf), type: "application/pdf" }], args?.folder as string | undefined);
        return { ok: true, summary: `Created PDF ${pdfName}${delivered[0]?.savedPath ? ` → ${delivered[0].savedPath}` : " — download available"}`, files: delivered };
      }
      case "medusa_readFile": {
        if (!b) return { ok: false, summary: "readFile needs the desktop app (browser can't read your files)" };
        const r = await b.readText(String(args?.path ?? ""));
        return r.ok ? { ok: true, summary: `Read ${r.path}`, detail: r.content } : { ok: false, summary: r.error || "Read failed" };
      }
      case "medusa_runCommand": {
        if (!b) return { ok: false, summary: "runCommand needs the desktop app (browser can't run commands)" };
        const r = await b.runCommand({
          command: String(args?.command ?? ""),
          cwd: args?.cwd as string | undefined,
          timeoutMs: typeof args?.timeoutMs === "number" ? args.timeoutMs : 60000,
        });
        const out = [r.stdout, r.stderr].filter(Boolean).join("\n").trim().slice(0, 6000);
        return {
          ok: r.ok && !r.timedOut,
          summary: r.timedOut ? "Timed out" : out ? `${out.slice(0, 200)}${out.length > 200 ? "…" : ""}` : `exit ${r.exitCode}`,
          detail: out,
        };
      }
      case "medusa_writeProject": {
        if (!b?.writeProject) return { ok: false, summary: "writeProject needs the desktop app (browser can't write to a folder)" };
        const r = await b.writeProject({
          name: String(args?.name ?? "project"),
          files: (Array.isArray(args?.files) ? args.files : []) as { path: string; base64: string }[],
          mode: args?.mode === "new" ? "new" : "into",
          dir: args?.dir as string | undefined,
        });
        if (r.canceled) return { ok: false, summary: "Cancelled" };
        return {
          ok: r.ok,
          summary: r.ok ? `Wrote ${r.written ?? 0} file(s) to ${r.path}` : r.error || "Write failed",
          detail: r.detail,
          path: r.path,
        };
      }

      /* ---- advanced file operations (desktop) ------------------------------ */
      case "medusa_listDir": {
        if (!b?.listDir) return { ok: false, summary: "listDir needs the desktop app (browser can't browse your folders)" };
        const r = await b.listDir({
          path: args?.path as string | undefined,
          recursive: args?.recursive === true,
          maxEntries: typeof args?.maxEntries === "number" ? args.maxEntries : 200,
        });
        if (!r.ok) return { ok: false, summary: r.error || "Could not list folder" };
        const entries = r.entries || [];
        const listing = entries
          .map((e) => `${e.type === "dir" ? "[dir] " : e.type === "link" ? "[link]" : "      "}${e.rel}${e.type === "file" ? `  (${humanBytes(e.size)}, ${e.modified?.slice(0, 16).replace("T", " ") ?? "?"})` : ""}`)
          .join("\n");
        return {
          ok: true,
          summary: `${r.count} entr${r.count === 1 ? "y" : "ies"} in ${r.path}${r.truncated ? " (truncated)" : ""}`,
          detail: listing,
          path: r.path,
        };
      }
      case "medusa_editFile": {
        if (!b?.editFile) return { ok: false, summary: "editFile needs the desktop app (browser can't edit files in place)" };
        const r = await b.editFile({
          path: String(args?.path ?? ""),
          content: args?.content as string | undefined,
          find: args?.find as string | undefined,
          replace: args?.replace as string | undefined,
          all: args?.all === true,
          createIfMissing: args?.createIfMissing === true,
        });
        if (r.unchanged) return { ok: true, summary: `No change to ${r.path}`, detail: r.detail, path: r.path };
        return { ok: r.ok, summary: r.ok ? `${r.created ? "Created" : "Edited"} ${r.path}` : r.error || "Edit failed", detail: r.detail, path: r.path };
      }
      case "medusa_movePath": {
        if (!b?.movePath) return { ok: false, summary: "movePath needs the desktop app (browser can't move files)" };
        const r = await b.movePath({ from: String(args?.from ?? ""), to: String(args?.to ?? ""), overwrite: args?.overwrite === true });
        return { ok: r.ok, summary: r.ok ? `Moved to ${r.path}` : r.error || "Move failed", detail: r.detail, path: r.path };
      }
      case "medusa_copyPath": {
        if (!b?.copyPath) return { ok: false, summary: "copyPath needs the desktop app (browser can't copy files)" };
        const r = await b.copyPath({
          from: String(args?.from ?? ""),
          to: String(args?.to ?? ""),
          recursive: args?.recursive !== false,
          overwrite: args?.overwrite === true,
        });
        return { ok: r.ok, summary: r.ok ? `Copied to ${r.path}` : r.error || "Copy failed", detail: r.detail, path: r.path };
      }
      case "medusa_deletePath": {
        if (!b?.deletePath) return { ok: false, summary: "deletePath needs the desktop app (browser can't delete files)" };
        const r = await b.deletePath({
          path: String(args?.path ?? ""),
          recursive: args?.recursive === true,
          dryRun: args?.dryRun === true,
        });
        return { ok: r.ok, summary: r.ok ? (r.dryRun ? "Dry run" : `Deleted ${r.path}`) : r.error || "Delete failed", detail: r.detail, path: r.path };
      }

      /* ---- system monitoring (desktop) ------------------------------------- */
      case "medusa_systemStats": {
        if (!b?.sysStats) return { ok: false, summary: "systemStats needs the desktop app (browser can't read machine metrics)" };
        const s = await b.sysStats();
        return { ok: true, summary: `CPU ${s.cpu.busyPercent}% • RAM ${s.memory.usedPercent}% • up ${Math.floor(s.system.uptimeSeconds / 60)}m`, detail: formatStats(s) };
      }

      default:
        return { ok: false, summary: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, summary: String((e && (e as Error).message) || e) };
  }
}