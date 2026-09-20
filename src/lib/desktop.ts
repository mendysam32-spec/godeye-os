"use client";

// Client-side wrapper around the Electron desktop bridge (window.godeye).
// In a plain browser every function degrades gracefully (download / "N/A"),
// so the same UI powers both the desktop app and the web build.
import type { GodEyeSystemInfo } from "@/types/desktop";
import { makeZip, makeDocx, makePdf, bufToBase64, base64ToBuf, MIME_DOCX } from "./file-builder";

interface GodEyeDesktopBridge {
  isDesktop: boolean;
  platform: string;
  bridgeVersion?: number;
  systemInfo(): Promise<GodEyeSystemInfo>;
  baseFolder(): Promise<{ path: string; exists: boolean }>;
  saveFile(options: { content: string; defaultName?: string; title?: string }): Promise<{ canceled: boolean; filePath?: string; error?: string }>;
  writeFile(payload: { path: string; content: string }): Promise<{ ok: boolean; path?: string; error?: string }>;
  writeBinary?(payload: { path: string; base64: string }): Promise<{ ok: boolean; path?: string; error?: string }>;
  createFolder?(folderPath: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  readText(path: string): Promise<{ ok: boolean; path?: string; content?: string; error?: string }>;
  pickAndRead(filters?: { name: string; extensions: string[] }[]): Promise<{ canceled?: boolean; path?: string; content?: string; error?: string }>;
  runCommand(payload: { command: string; cwd?: string; timeoutMs?: number }): Promise<{ ok: boolean; exitCode: number; stdout: string; stderr: string; timedOut: boolean }>;
  openPath(target: string): Promise<{ ok: boolean; error?: string }>;
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

const encoder = new TextEncoder();

function bridge(): GodEyeDesktopBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { godeye?: GodEyeDesktopBridge }).godeye ?? null;
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

// Deliver generated files. Desktop: write each into the Documents/GodEye base
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

export async function runGodEyeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const b = bridge();
  try {
    switch (name) {
      case "godeye_saveFile": {
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
      case "godeye_createFolder": {
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
      case "godeye_createZip": {
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
      case "godeye_createDocx": {
        const docName = String(args?.name ?? args?.filename ?? "document.docx").replace(/\.docx$/i, "") + ".docx";
        const doc = makeDocx({ title: String(args?.title ?? args?.heading ?? ""), content: String(args?.content ?? "") });
        const delivered = await deliverFiles([{ name: docName, base64: bufToBase64(doc), type: MIME_DOCX }], args?.folder as string | undefined);
        return { ok: true, summary: `Created Word document ${docName}${delivered[0]?.savedPath ? ` → ${delivered[0].savedPath}` : " — download available"}`, files: delivered };
      }
      case "godeye_createPdf": {
        const pdfName = String(args?.name ?? args?.filename ?? "document.pdf").replace(/\.pdf$/i, "") + ".pdf";
        const pdf = makePdf({ title: String(args?.title ?? args?.heading ?? ""), content: String(args?.content ?? "") });
        const delivered = await deliverFiles([{ name: pdfName, base64: bufToBase64(pdf), type: "application/pdf" }], args?.folder as string | undefined);
        return { ok: true, summary: `Created PDF ${pdfName}${delivered[0]?.savedPath ? ` → ${delivered[0].savedPath}` : " — download available"}`, files: delivered };
      }
      case "godeye_readFile": {
        if (!b) return { ok: false, summary: "readFile needs the desktop app (browser can't read your files)" };
        const r = await b.readText(String(args?.path ?? ""));
        return r.ok ? { ok: true, summary: `Read ${r.path}`, detail: r.content } : { ok: false, summary: r.error || "Read failed" };
      }
      case "godeye_runCommand": {
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
      default:
        return { ok: false, summary: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, summary: String((e && (e as Error).message) || e) };
  }
}