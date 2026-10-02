"use client";
import { useState, useRef, useEffect } from "react";
import { useGodEye, DEFAULT_PLUGINS, type ChatMode, type ChatMessage, type ChatMedia, type PluginId } from "@/lib/store";
import { PROVIDERS, modelsFor, modelCapabilities, type ProviderId } from "@/lib/providers";
import { Sidebar } from "@/components/sidebar";
import { Send, Square, Plus, Paperclip, X, Copy, Check, Terminal, Code2, Image as ImageIcon, Search, ListTree, MessageSquare, Lightbulb, Trash2, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Download, Zap, Play, FileText, Clapperboard, EyeOff, Menu, FolderOpen, Package, Cloud, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { getDecryptedVaultForApi } from "@/lib/vault-crypto";
import { Markdown } from "@/components/markdown";
import { toast } from "@/components/toast";
import { isDesktop, runGodEyeTool, saveTextToDisk, downloadToolFile, type ToolFile } from "@/lib/desktop";
import { isToolProvider } from "@/lib/tools";
import { makeDocx, makePdf, makeZip, bufToBase64, MIME_DOCX } from "@/lib/file-builder";
import { readChatStream, type ToolCallWire } from "@/lib/chat-stream";
import { shouldSendOnEnter, enterHint, footerHint } from "@/lib/composer-keys";
import { SyncBadge, SyncDot } from "@/components/sync-badge";
import { noteChatDeleted } from "@/lib/chat-sync-client";
import { extractZip, packZip, uint8ToBase64, base64ToUint8 } from "@/lib/zip";
import { ensureDriveToken, ensureGodEyeFolders, uploadZipToDrive } from "@/lib/google-drive";
import { useDriveAuth } from "@/lib/use-drive-auth";
import {
  ACCEPTED_FILE_TYPES, MAX_TEXT_PART_CHARS, budgetParts, pendingFileMarker, pendingFileToParts,
  supportsNativePdf, readPendingFiles, type ContentPart, type PendingFile,
} from "@/lib/content";

const MODES: { id: ChatMode; label: string; icon: LucideIcon; desc: string }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, desc: "General" },
  { id: "coding", label: "Coding", icon: Code2, desc: "Build code" },
  { id: "image", label: "Image", icon: ImageIcon, desc: "Generate images" },
  { id: "video", label: "Video", icon: Clapperboard, desc: "Generate video" },
  { id: "plan", label: "Plan", icon: ListTree, desc: "Break into steps" },
  { id: "search", label: "Search", icon: Search, desc: "Research" },
  { id: "research", label: "Research", icon: Lightbulb, desc: "Deep dive" },
  { id: "terminal", label: "Terminal", icon: Terminal, desc: "Commands" },
];

const PLUGIN_DEFS: { id: PluginId; label: string; desc: string; icon: LucideIcon; iconClass: string }[] = [
  { id: "image", label: "Image generation", desc: "Renders real images with image-capable models (DALL-E, FLUX, Imagen).", icon: ImageIcon, iconClass: "text-amber-500" },
  { id: "video", label: "Video generation", desc: "Renders real videos with video-capable models (Sora, Veo).", icon: Clapperboard, iconClass: "text-violet-500" },
  { id: "search", label: "Search & research", desc: "Grounds answers in research in Search/Research modes.", icon: Search, iconClass: "text-blue-500" },
  { id: "tools", label: "Agent file tools", desc: "Let the model create files, docs, PDFs, ZIPs and run commands.", icon: Zap, iconClass: "text-amber-500" },
  { id: "terminal", label: "Terminal", desc: "Run code blocks and commands from assistant replies.", icon: Terminal, iconClass: "text-green-500" },
];

// ---------- markdown / code helpers ----------
function extractCodeBlocks(content: string): { lang: string; code: string }[] {
  const out: { lang: string; code: string }[] = [];
  const re = /```(\w*)[^\n]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.push({ lang: m[1] || "txt", code: m[2] });
  if (!out.length) out.push({ lang: "txt", code: content });
  return out;
}

const EXT: Record<string, string> = { py: "py", js: "js", jsx: "jsx", ts: "ts", tsx: "tsx", json: "json", md: "md", txt: "txt", sh: "sh", bash: "sh", powershell: "ps1", ps: "ps1", html: "html", css: "css", sql: "sql", yaml: "yml", xml: "xml", java: "java", go: "go", rs: "rs", c: "c", cpp: "cpp", rb: "rb", php: "php" };

// ---------- project workspace helpers ----------
// A project is a flat map of POSIX relative path -> file content held in memory.
// Uploaded as ZIP or a whole folder, edited by the model, exported back out.
export interface ProjectFile {
  path: string;
  text: string;
  /** true when the entry holds non-text bytes (kept as base64, sent as a marker) */
  binary?: boolean;
  base64?: string;
}

const PROJECT_TEXT_EXT = new Set([
  "txt", "md", "markdown", "json", "jsonl", "xml", "html", "htm", "css", "scss", "sass", "less",
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h",
  "cpp", "hpp", "cc", "cs", "php", "sh", "bash", "zsh", "fish", "ps1", "sql", "yml", "yaml", "toml",
  "ini", "cfg", "conf", "env", "gitignore", "dockerfile", "makefile", "gradle", "properties", "csv",
  "tsv", "svg", "vue", "svelte", "astro", "lua", "pl", "r", "dart", "ex", "exs", "erl", "hs", "clj",
]);

function projectExt(path: string): string {
  const base = path.split("/").pop() || "";
  if (base.startsWith(".") && !base.includes(".")) return base.toLowerCase();
  const i = base.lastIndexOf(".");
  return i < 0 ? "" : base.slice(i + 1).toLowerCase();
}

function isProjectText(path: string): boolean {
  const ext = projectExt(path);
  if (!ext) return PROJECT_TEXT_EXT.has(path.split("/").pop()!.toLowerCase());
  return PROJECT_TEXT_EXT.has(ext);
}

const utf8 = new TextDecoder("utf-8", { fatal: false });
const utf8e = new TextEncoder();

function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}

/** Render a file tree as a fenced, path-headed text block the model can edit. */
function projectTreeText(files: ProjectFile[], budgetChars: number): string {
  const lines: string[] = [];
  let used = 0;
  for (const f of files) {
    if (f.binary) {
      lines.push(`--- ${f.path} (binary, ${(f.base64!.length * 0.75 / 1024).toFixed(0)}KB) --- [leave unchanged]`);
      continue;
    }
    const header = `--- FILE: ${f.path} ---`;
    const entry = `${header}\n${f.text}\n--- END FILE: ${f.path} ---`;
    if (used + entry.length > budgetChars) {
      lines.push(`--- FILE: ${f.path} --- [omitted - too large for context] --- END FILE: ${f.path} ---`);
      continue;
    }
    lines.push(entry);
    used += entry.length;
  }
  return lines.join("\n\n");
}

/** Apply edits the model returned as ```path blocks to the in-memory tree. */
function applyProjectEdits(files: ProjectFile[], reply: string): { files: ProjectFile[]; changed: string[]; created: string[] } {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const changed: string[] = [];
  const created: string[] = [];
  const re = /```([\w./\\@ -]+?)\r?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(reply)) !== null) {
    const raw = m[1].trim();
    const body = m[2].replace(/\n$/, "");
    if (!raw || raw.length > 200 || body.trim() === "") continue;
    const path = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!projectExt(path) && !/[./]/.test(path.split("/").pop() || "")) continue;
    const existing = byPath.get(path);
    if (existing) {
      if (existing.text !== body) {
        byPath.set(path, { ...existing, text: body, binary: false, base64: undefined });
        changed.push(path);
      }
    } else {
      byPath.set(path, { path, text: body });
      created.push(path);
    }
  }
  return { files: Array.from(byPath.values()), changed, created };
}

// Folder + archive intake. Deps, build output and VCS metadata are skipped so
// the model sees source, not 40MB of vendor code.
const MAX_PROJECT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_BINARY_FILE_BYTES = 1.5 * 1024 * 1024;
const PROJECT_SKIP_DIRS = [
  "node_modules", ".git", ".next", ".open-next", ".wrangler", ".turbo", ".cache", ".vercel",
  ".svelte-kit", "dist", "build", "out", "coverage", "__pycache__", ".venv", "venv", ".idea", ".vscode-test",
];
const PROJECT_SKIP_FILES = [".DS_Store", "Thumbs.db", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "tsconfig.tsbuildinfo"];

function isProjectIgnored(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((p) => PROJECT_SKIP_DIRS.includes(p))) return true;
  const base = parts[parts.length - 1];
  if (PROJECT_SKIP_FILES.includes(base)) return true;
  if (base.endsWith(".log") || base.endsWith(".map")) return true;
  return false;
}

/** "my-project/src/app/page.tsx" -> "my-project/" when every file sits under one dir. */
function commonWrapper(paths: string[]): string {
  if (!paths.length) return "";
  const first = paths[0].split("/")[0];
  if (!first || !paths.every((p) => p.startsWith(`${first}/`))) return "";
  return `${first}/`;
}

/** Shared root folder of a webkitdirectory FileList ("src/app/x.tsx" -> "src/app"). */
function folderRoot(list: File[]): string {
  const first = list[0]?.webkitRelativePath || list[0]?.name || "";
  const segs = first.split("/");
  return segs.length > 1 ? segs.slice(0, -1).join("/") : "";
}

function folderRelative(f: File, root: string): string {
  const raw = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  const norm = raw.replace(/\\/g, "/");
  const rel = root && norm.startsWith(`${root}/`) ? norm.slice(root.length + 1) : norm;
  return rel.replace(/^\.\//, "");
}



function suggestSaveFile(content: string, mode: ChatMode, chatTitle: string): { name: string; content: string } {
  const blocks = extractCodeBlocks(content);
  const lang = blocks[0]?.lang?.toLowerCase() || (mode === "coding" ? "py" : mode === "terminal" ? "sh" : "md");
  const ext = EXT[lang] || "md";
  const base = (chatTitle || "godeye").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `godeye-${mode}`;
  const code = blocks.length === 1 ? blocks[0].code.trim() : content;
  return { name: `${base}.${ext}`, content: code };
}

function buildChatExport(title: string, messages: { role: string; content: string; timestamp: string; provider?: string; model?: string; mode?: string }[]): string {
  const head = `# ${title}\n\nExported from GodEye OS — ${new Date().toISOString()}\n\n---\n\n`;
  return head + messages.map((m) => {
    const who = m.role === "user" ? "You" : "GodEye";
    const meta = `${m.provider || ""}${m.provider && m.model ? "/" : ""}${m.model || ""} ${m.mode ? `\u00b7 ${m.mode}` : ""}`.trim();
    return `### ${who}${meta ? ` — ${meta}` : ""}\n${m.timestamp ? `*${new Date(m.timestamp).toLocaleString()}*\n\n` : ""}${m.content}\n\n---\n\n`;
  }).join("");
}

async function downloadMedia(md: ChatMedia) {
  const name = md.filename || (md.kind === "image" ? "godeye-image.png" : "godeye-video.mp4");
  const a = document.createElement("a");
  if (md.src.startsWith("data:")) {
    a.href = md.src;
    a.download = name;
  } else {
    try {
      const r = await fetch(md.src);
      const b = await r.blob();
      a.href = URL.createObjectURL(b);
      a.download = name;
    } catch {
      a.href = md.src;
      a.target = "_blank";
    }
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Turn generated media (data: URLs) into downloadable ToolFiles registered under
// the assistant message's "Created files" panel — lets image/video-capable models
// produce files you can save to disk (desktop) or download (browser).
async function mediaToToolFile(md: ChatMedia): Promise<ToolFile | null> {
  if (!md.src.startsWith("data:")) return null; // remote signed URLs keep the inline download button
  const comma = md.src.indexOf(",");
  if (comma < 0) return null;
  const mime = /^data:([^;]+)/.exec(md.src)?.[1] || md.mime || (md.kind === "image" ? "image/png" : "video/mp4");
  const base64 = md.src.slice(comma + 1);
  const name = md.filename || (md.kind === "image" ? "godeye-image.png" : "godeye-video.mp4");
  const r = await runGodEyeTool("godeye_saveFile", { name, base64, type: mime });
  if (r.files?.length) return r.files[0];
  return { name, base64, type: mime };
}

export default function ChatPage() {
  const { chats, activeChatId, createChat, setActiveChat, addMessage, updateLastMessage, deleteChat, vault, settings, setSettings, setLastSelection, incognito, setIncognito, markChatIncognito, purgeIncognito } = useGodEye();
  const activeChat = chats.find(c => c.id === activeChatId) || null;

  const plugins = settings.plugins || { ...DEFAULT_PLUGINS };

  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(activeChat?.mode || "chat");
  const [provider, setProvider] = useState(activeChat?.provider || settings.defaultProvider);
  const [model, setModel] = useState(() => {
    if (activeChat?.model) return activeChat.model;
    const pid = settings.defaultProvider;
    const remembered = useGodEye.getState().lastModelByProvider?.[pid];
    const list = modelsFor(PROVIDERS.find(p => p.id === pid), vault[pid]?.models);
    if (remembered && list.some(m => m.id === remembered)) return remembered;
    return list[0]?.id || "anthropic/claude-sonnet-4";
  });
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [reading, setReading] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [toolsOn, setToolsOn] = useState<boolean>(settings.plugins?.tools !== false);
  const [runOut, setRunOut] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  // accumulates streamed deltas so each event can render incrementally without
  // re-deriving the full text from the store on every token
  const streamTextRef = useRef("");
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  // Project workspace: files extracted from an uploaded ZIP/folder, edited by the
  // model, then re-packed and exported (download / Drive / local folder).
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [projectName, setProjectName] = useState<string>("");
  const [projectBusy, setProjectBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [createdFiles, setCreatedFiles] = useState<Record<string, ToolFile[]>>({});
  const [focused, setFocused] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(() => (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? false : true));
  const [menuOpen, setMenuOpen] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [menuTab, setMenuTab] = useState<"model" | "connector" | "plugins">("model");
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const lastModelByProvider = useGodEye((s) => s.lastModelByProvider);

  // Last-selected model memory — new chats and provider switches default to the
  // model you used last, falling back to the provider's first model.
  function pickModel(pid: ProviderId): string {
    const remembered = lastModelByProvider?.[pid];
    const list = modelsFor(PROVIDERS.find(p => p.id === pid), vault[pid]?.models);
    if (remembered && list.some(m => m.id === remembered)) return remembered;
    return list[0]?.id || "";
  }

  function firstCapable(pid: ProviderId, kind: "image" | "video"): string | null {
    const list = modelsFor(PROVIDERS.find(p => p.id === pid), vault[pid]?.models);
    return list.find(m => m[kind])?.id || null;
  }

  function togglePlugin(id: PluginId) {
    const next = { ...plugins, [id]: !plugins[id] };
    setSettings({ plugins: next });
    if (id === "tools") setToolsOn(next.tools);
    if ((id === "image" || id === "video") && next[id]) {
      const caps = modelCapabilities(provider, model, vault[provider]?.models);
      if (!caps[id]) {
        const capModel = firstCapable(provider, id);
        if (capModel) {
          setModel(capModel);
          setLastSelection(provider, capModel);
        }
      }
    }
  }

  function selectConnector(pid: ProviderId) {
    const m = pickModel(pid) || PROVIDERS.find(p => p.id === pid)?.models[0]?.id || "";
    setProvider(pid);
    setModel(m);
    setLastSelection(pid, m);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setShowModelMenu(false);
    }
    if (showModelMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showModelMenu]);

  useEffect(() => {
    if (activeChatId && activeChat) {
      setMode(activeChat.mode);
      setProvider(activeChat.provider);
      setModel(activeChat.model);
    } else if (!activeChatId) {
      const id = createChat({ mode, provider, model });
      setActiveChat(id);
    } else {
      setActiveChat(null);
    }
  }, [activeChatId]);

  useEffect(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight); }, [activeChat?.messages, running, runOut]);

function selectChat(id: string) {
    const prev = activeChat;
    setActiveChat(id);
    if (prev?.incognito) deleteChat(prev.id); // incognito chat auto-deletes when you leave it
  }

  function newChat() {
    const prev = activeChat;
    const id = createChat({ mode, provider, model, incognito });
    setFiles([]);
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] new chat ${id}${incognito ? " (incognito)" : ""}`]);
    if (prev?.incognito) deleteChat(prev.id);
    toast(incognito ? "New incognito chat — nothing is saved" : "New chat started", "info");
  }

  // Incognito: when this chat page unmounts (you navigate away), wipe every
  // incognito chat from memory. Nothing was ever written to storage.
  useEffect(() => {
    const purge = () => useGodEye.getState().purgeIncognito();
    return () => purge();
  }, []);

  function toggleIncognito() {
    const next = !incognito;
    setIncognito(next);
    if (activeChatId) markChatIncognito(activeChatId, next);
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] 🕵 incognito ${next ? "ON — chats delete on exit, never saved" : "OFF"}`]);
    toast(next ? "Incognito ON — this chat won't be saved and auto-deletes when you leave it" : "Incognito OFF — chats save again", "info");
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files;
    const pickedFromFolder = (e.target as HTMLInputElement).hasAttribute("webkitdirectory");
    if (fileRef.current) fileRef.current.value = "";
    if (folderRef.current) folderRef.current.value = "";
    if (!fl?.length) return;
    setReading(true);
    try {
      // A ZIP or a whole folder opens the project workspace: the files are read
      // into an in-memory tree so the model can edit them and we can re-export.
      const archive = pickedFromFolder ? null : Array.from(fl).find((f) => /\.zip$/i.test(f.name));
      if (archive) {
        await loadProjectFromZip(archive);
        return;
      }
      if (pickedFromFolder) {
        await loadProjectFromFolder(Array.from(fl));
        return;
      }

      // PDFs are only sent whole to providers that extract the text themselves.
      // Everything else is read here so nothing has to round-trip as a blob.
      const nativePdf = supportsNativePdf(provider);
      const picked = await readPendingFiles(fl, { nativePdf });
      setFiles((prev) => [...prev, ...picked]);
      const skipped = picked.filter((f) => f.base64 == null && f.text == null);
      const attached = picked.length - skipped.length;
      if (attached) {
        setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u{1F4CE} ${attached} file(s) ready — ${picked.filter((f) => f.kind === "image").length} image, ${picked.filter((f) => f.kind === "pdf").length} pdf, ${picked.filter((f) => f.kind === "text").length} text`]);
      }
      for (const f of skipped) {
        setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u26a0 skipped ${f.name} — ${f.note}`]);
      }
      if (skipped.length) toast(`${skipped.length} file(s) could not be attached — see terminal`, "error");
    } catch (err) {
      toast(`Could not read files: ${(err as Error).message}`, "error");
    } finally {
      setReading(false);
    }
  }

  // ---- project workspace: load -------------------------------------------------

  async function loadProjectFromZip(zip: File) {
    const ex = extractZip(await zip.arrayBuffer());
    if (!ex.files.length) {
      toast(`${zip.name} is not a readable ZIP (or every file was skipped)`, "error");
      return;
    }
    const entries: ProjectFile[] = [];
    let binary = 0;
    for (const f of ex.files) {
      const bytes = f.content instanceof Uint8Array ? f.content : new TextEncoder().encode(String(f.content));
      if (isProjectText(f.path) && !looksBinary(bytes)) {
        entries.push({ path: f.path, text: utf8.decode(bytes) });
      } else {
        entries.push({ path: f.path, text: "", binary: true, base64: uint8ToBase64(bytes) });
        binary++;
      }
    }
    // A single wrapper folder (my-project/src/...) is noise - strip it so the
    // exported ZIP has the project's real root.
    const strip = commonWrapper(entries.map((e) => e.path));
    setProjectFiles(strip ? entries.map((e) => ({ ...e, path: e.path.slice(strip.length) })) : entries);
    setProjectName(zip.name.replace(/\.zip$/i, ""));
    setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u{1F4E6} ${zip.name} - ${entries.length} files loaded (${binary} binary)${ex.ignored.length ? `, ${ex.ignored.length} skipped (build output/deps)` : ""}`]);
    toast(`${entries.length} files loaded from ${zip.name} - ask for changes, then export`);
  }

  async function loadProjectFromFolder(list: File[]) {
    const root = folderRoot(list);
    const entries: ProjectFile[] = [];
    let skipped = 0;
    for (const f of list) {
      const rel = folderRelative(f, root);
      if (!rel) continue;
      if (isProjectIgnored(rel)) { skipped++; continue; }
      if (f.size > MAX_PROJECT_FILE_BYTES) { skipped++; continue; }
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (isProjectText(rel) && !looksBinary(bytes)) {
        entries.push({ path: rel, text: utf8.decode(bytes) });
      } else if (bytes.length <= MAX_BINARY_FILE_BYTES) {
        entries.push({ path: rel, text: "", binary: true, base64: uint8ToBase64(bytes) });
      } else {
        skipped++;
      }
    }
    if (!entries.length) {
      toast("Nothing readable in that folder", "error");
      return;
    }
    setProjectFiles(entries);
    setProjectName(root.split("/").pop() || "project");
    setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u{1F4C1} folder ${root} - ${entries.length} files loaded${skipped ? `, ${skipped} skipped (deps/build/too big)` : ""}`]);
    toast(`${entries.length} files loaded from ${root} - ask for changes, then export`);
  }

  // ---- project workspace: export ----------------------------------------------

  function packedProject() {
    return packZip(projectFiles.map((f) => ({
      path: f.path,
      content: f.binary ? base64ToUint8(f.base64!) : utf8e.encode(f.text),
    })));
  }

  async function exportProjectDownload(suffix = "improved") {
    if (!projectFiles.length) return;
    const base = (projectName || "project").replace(/[^\w.-]+/g, "-");
    const bytes = packedProject();
    downloadToolFile({ name: `${base}-${suffix}.zip`, type: "application/zip", base64: uint8ToBase64(bytes) });
    setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u{1F4E6} exported ${base}-${suffix}.zip (${(bytes.length / 1024).toFixed(0)}KB, ${projectFiles.length} files)`]);
    toast(`${base}-${suffix}.zip downloaded`);
  }

  async function exportProjectToFolder() {
    if (!projectFiles.length || !desktop) return;
    setProjectBusy(true);
    try {
      const r = await runGodEyeTool("godeye_writeProject", {
        name: (projectName || "project").replace(/[^\w.-]+/g, "-"),
        files: projectFiles.map((f) => ({ path: f.path, base64: f.binary ? f.base64 : uint8ToBase64(utf8e.encode(f.text)) })),
      });
      setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u{1F4BB} ${r.ok ? "wrote to disk" : "write failed"} - ${(r.detail || r.summary || "").slice(0, 300)}`]);
      toast(r.ok ? r.detail || "Written to disk" : r.summary || "Write failed", r.ok ? "success" : "error");
    } finally {
      setProjectBusy(false);
    }
  }

  const drive = useDriveAuth();

  async function exportProjectToDrive() {
    if (!projectFiles.length) return;
    setProjectBusy(true);
    try {
      const token = await ensureDriveToken();
      if (!token) {
        // no token yet - start the OAuth flow, callback returns to Connectors
        toast("Connect Google Drive first", "info");
        drive.connect("/connectors");
        return;
      }
      if (token.expiresAt < Date.now()) {
        drive.refresh();
        toast("Google Drive session expired - reconnect", "error");
        return;
      }
      const { projectsId } = await ensureGodEyeFolders(token.accessToken);
      const base = (projectName || "project").replace(/[^\w.-]+/g, "-");
      const up = await uploadZipToDrive(token.accessToken, `${base}-improved.zip`, packedProject(), projectsId ?? undefined);
      if (!up) {
        toast("Drive upload failed - reconnect or check your quota", "error");
        return;
      }
      setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u2601\uFE0F saved to Google Drive/GodEye/Projects/${base}-improved.zip`]);
      toast(`Saved to Google Drive${drive.email ? ` (${drive.email})` : ""}`, "success");
      if (up.webViewLink) window.open(up.webViewLink, "_blank", "noopener");
    } finally {
      setProjectBusy(false);
    }
  }

  function applyProjectReply(reply: string) {
    if (!projectFiles.length) return;
    const { files: next, changed, created } = applyProjectEdits(projectFiles, reply);
    if (!changed.length && !created.length) return;
    setProjectFiles(next);
    setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u270F\uFE0F applied ${changed.length} edit(s)${created.length ? `, ${created.length} new file(s)` : ""} - export to save`]);
  }

  /** Wrap the request + the whole tree in one instruction the model can follow. */
  function buildProjectPrompt(request: string): { text: string } {
    const budget = Math.min(MAX_TEXT_PART_CHARS, 700_000);
    const tree = projectTreeText(projectFiles, budget);
    const editMode = /\b(change|fix|refactor|improve|update|add|remove|rename|rewrite|migrate|upgrade|write|implement|bump|clean|optimi[sz]e|translate)\w*/i.test(request);
    const rules = [
      "You are editing a real project. Below is the complete file tree as fenced blocks delimited by `--- FILE: <path> ---`.",
      "",
      editMode
        ? "To change or add files, reply with fenced code blocks whose info string is the exact path:"
        : "This turn is a question about the project, so answer normally.",
      "",
      editMode ? "```src/app/page.tsx" : "",
      editMode ? "<full new contents of that file>" : "",
      editMode ? "```" : "",
      "",
      "Rules for edits:",
      "- Output the COMPLETE new contents of each file you change (not a diff, not a fragment).",
      "- Use the same paths as given; create new files by using a new path.",
      "- Do not echo unchanged files. Do not wrap paths in quotes or add language names.",
      "- Keep the response short: no prose before or after the code blocks.",
    ].join("\n");
    return { text: `${request}\n\n${rules}\n\n${tree}` };
  }

  interface WireMsg {
    role: "user" | "assistant" | "system" | "tool";
    content: string | ContentPart[];
    tool_calls?: { id: string; type?: string; function: { name: string; arguments: string } }[];
    tool_call_id?: string;
  }

  function normalizeMsg(m: ChatMessage): WireMsg {
    const src = m as ChatMessage & { tool_calls?: WireMsg["tool_calls"]; tool_call_id?: string };
    // replay stored attachments so a follow-up question still sees the document
    const out: WireMsg = { role: m.role, content: m.parts?.length ? m.parts : m.content ?? "" };
    if (src.tool_calls) out.tool_calls = src.tool_calls;
    if (src.tool_call_id) out.tool_call_id = src.tool_call_id;
    return out;
  }

  /** Build the outgoing turn: text plus whatever the selected model can read. */
  function buildUserTurn(text: string, pending: PendingFile[], caps: { vision: boolean }): ContentPart[] {
    const parts: ContentPart[] = [];
    if (text) parts.push({ type: "text", text });
    for (const f of pending) {
      if (f.kind === "image" && !caps.vision) {
        // Silently dropping a screenshot is worse than saying so.
        parts.push({ type: "text", text: `[image not sent: ${f.name} — ${provider}/${model} has no vision support. Switch to a vision model to read it.]` });
        continue;
      }
      parts.push(...pendingFileToParts(f, MAX_TEXT_PART_CHARS));
      const marker = pendingFileMarker(f);
      if (marker) parts.push(marker);
    }
    return budgetParts(parts);
  }

  async function runAgentLoop(chatId: string, asstId: string, userTurn: ContentPart[], controller: AbortController) {
    const decryptedVault = await getDecryptedVaultForApi(vault);
    const useTools = plugins.tools && toolsOn && isToolProvider(provider);
    const reasoningEffort = settings.reasoningEffort || "medium";
    const history: WireMsg[] = [...(activeChat?.messages || [])].map(normalizeMsg);
    history.push({ role: "user", content: userTurn });

    const MAX_TOOL_ITER = reasoningEffort === "extra-high" ? 8 : 6;
    let iterations = 0;

    while (iterations <= MAX_TOOL_ITER) {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          provider, model,
          mode: mode === "search" && !plugins.search ? "chat" : mode === "terminal" && !plugins.terminal ? "chat" : mode,
          vault: decryptedVault, settings, stream: true, toolsEnabled: useTools,
          reasoningEffort,
        }),
        signal: controller.signal,
      });

      let calls: ToolCallWire[] | undefined;
      let failed: string | undefined;
      streamTextRef.current = "";
      const result = await readChatStream(res, {
        onDelta: (t) => {
          streamTextRef.current += t;
          updateLastMessage(chatId, streamTextRef.current);
        },
        onStage: (_s, label) => setStage(label),
        onNotice: (msg) => setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u2139 ${msg}`]),
        onToolCalls: (tc) => {
          calls = tc;
        },
        onDone: (info) => {
          setStage("");
          setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u2713 ${info.latencyMs ? (info.latencyMs / 1000).toFixed(1) + "s" : ""} ${info.usage?.total_tokens ? info.usage.total_tokens + " tokens" : ""}`]);
        },
        onError: (msg) => {
          failed = msg;
        },
        onAborted: () => setStage(""),
      });
      setStage("");

      if (controller.signal.aborted) return;
      if (failed) throw new Error(failed);

      if (!calls?.length) {
        if (result.text) updateLastMessage(chatId, result.text);
        return;
      }

      iterations++;
      if (iterations > MAX_TOOL_ITER) {
        updateLastMessage(chatId, `**Stopped:** tool iteration limit reached (${MAX_TOOL_ITER}).`);
        return;
      }
      setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u21c4 tool round ${iterations} \u2192 ${calls!.map((t) => t.name).join(", ")}`]);
      updateLastMessage(chatId, `_Using tools: ${calls.map((t) => t.name).join(", ")}\u2026_`);
      history.push({
        role: "assistant", content: "",
        tool_calls: calls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) } })),
      });
      for (const tc of calls) {
        const toolResult = await runGodEyeTool(tc.name, tc.arguments || {});
        history.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) });
        const produced = toolResult.files || [];
        if (produced.length) {
          setCreatedFiles((prev) => ({ ...prev, [asstId]: [...(prev[asstId] || []), ...produced] }));
        }
        setLogs((l) => [...l, `  ${tc.name} \u2192 ${toolResult.summary}`]);
        updateLastMessage(chatId, `_Using tools: ${calls.map((t) => t.name).join(", ")}\u2026\n  ${toolResult.summary}_`);
      }
    }
  }

  async function generateMedia(chatId: string, prompt: string, isImage: boolean, controller: AbortController, genMode: ChatMode, asstId: string) {
    const decryptedVault = await getDecryptedVaultForApi(vault);
    async function registerMediaFiles(media: ChatMedia[]) {
      const files: ToolFile[] = [];
      for (const md of media) {
        const tf = await mediaToToolFile(md);
        if (tf) files.push(tf);
      }
      if (files.length) {
        setCreatedFiles(prev => ({ ...prev, [asstId]: [...(prev[asstId] || []), ...files] }));
        setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] 💾 ${files.length} media file(s) ready${files[0]?.savedPath ? ` → ${files[0].savedPath}` : " — downloads available"}`]);
      }
    }
    if (isImage) {
      updateLastMessage(chatId, `_Generating image with ${model}…_`);
      const res = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, prompt, vault: decryptedVault }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error || "Image generation failed");
      }
      const j = await res.json();
      const media: ChatMedia[] = (j.images || []).map((img: { src: string; url?: string; mime?: string; filename?: string }) => ({
        kind: "image",
        src: img.src,
        url: img.url,
        mime: img.mime,
        filename: img.filename,
      }));
      if (!media.length) throw new Error("No image returned");
      updateLastMessage(chatId, "**Image generated**", { media, provider, model, mode: genMode });
      setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] \u{1F5BC} ${media.length} image(s) via ${model}`]);
      await registerMediaFiles(media);
      return;
    }

    // video: submit a job, then poll status until the provider finishes.
    updateLastMessage(chatId, `_Starting video generation with ${model}…_`);
    const sub = await fetch("/api/generate/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, prompt, vault: decryptedVault }),
      signal: controller.signal,
    });
    if (!sub.ok) {
      const j = await sub.json().catch(() => ({ error: sub.statusText }));
      throw new Error(j.error || "Video generation failed");
    }
    const { job } = await sub.json();
    let attempts = 0;
    // total budget: ~5 minutes of polling (8s cadence) — covers most Sora/Veo jobs
    const MAX_POLLS = 38;
    while (true) {
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (attempts >= MAX_POLLS) throw new Error("Video generation timed out — check the providers job dashboard");
      attempts++;
      updateLastMessage(chatId, `_Generating video… (job ${attempts})_`);
      const st = await fetch("/api/generate/video/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, job, vault: decryptedVault }),
        signal: controller.signal,
      });
      const sj = await st.json().catch(() => ({ status: "error", error: "Status poll failed" }));
      if (sj.status === "done") {
        const media: ChatMedia[] = (sj.videos || []).map((v: { src: string; url?: string; mime?: string; filename?: string }) => ({
          kind: "video",
          src: v.src,
          url: v.url,
          mime: v.mime,
          filename: v.filename,
        }));
        if (!media.length) throw new Error("No video returned");
        updateLastMessage(chatId, "**Video generated**", { media, provider, model, mode: genMode });
        setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] \u{1F3AC} ${media.length} video(s) via ${model}`]);
        await registerMediaFiles(media);
        return;
      }
      if (sj.status === "error" || sj.error) throw new Error(sj.error || "Video generation failed");
      await new Promise(r => setTimeout(r, 8000));
    }
  }

  async function send() {
    if (!input.trim() && files.length === 0 && !projectFiles.length) return;
    if (!activeChat) return;
    const chatId = activeChat.id;
    const userContent = input.trim();
    const attachments = files.length
      ? files.map((f) => ({ name: f.name, type: f.mime, size: f.size, preview: f.preview, kind: f.kind, note: f.note }))
      : undefined;

    const caps = modelCapabilities(provider, model, vault[provider]?.models);
    const project = projectFiles.length ? buildProjectPrompt(userContent) : null;
    const userTurn = buildUserTurn(project ? project.text : userContent, files, caps);
    const dropped = files.filter((f) => (f.base64 == null && f.text == null) || (f.kind === "image" && !caps.vision));
    const listed = files.map((f) => f.name).join(", ");

    addMessage(chatId, {
      id: Date.now().toString(),
      role: "user",
      content: userContent + (files.length ? `\n\n[${files.length} file(s): ${listed}]` : "") + (project ? `\n\n[project: ${projectFiles.length} files from ${projectName || "upload"}]` : ""),
      timestamp: new Date().toISOString(),
      attachments,
      parts: userTurn,
      mode,
      provider,
      model,
    });
    setInput("");
    setFiles([]);
    setRunning(true);
    setStage(`Sending — ${provider}/${model}`);
    setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u2192 ${provider}/${model} [${mode}] ${userContent.slice(0, 80)}${project ? ` \u{1F4E6} project:${projectFiles.length}files` : ""}${toolsOn ? " \u26a1tools" : ""}`]);
    for (const f of dropped) {
      setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u26a0 ${f.name} not sent — ${f.note || "model has no vision support"}`]);
    }

    // optimistic assistant placeholder
    const asstId = (Date.now() + 1).toString();
    addMessage(chatId, { id: asstId, role: "assistant", content: "", timestamp: new Date().toISOString(), mode, provider, model });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const directImage = mode === "image" && plugins.image && caps.image;
      const directVideo = mode === "video" && plugins.video && caps.video;
      if (directImage || directVideo) {
        await generateMedia(chatId, userContent, directImage, controller, mode, asstId);
      } else {
        await runAgentLoop(chatId, asstId, userTurn, controller);
      }
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") {
        setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u25a0 stopped by user`]);
        updateLastMessage(chatId, streamTextRef.current ? streamTextRef.current + "\n\n_— stopped_" : "_— stopped_");
      } else {
        updateLastMessage(chatId, `**Error:** ${err.message}\n\nCheck Providers Vault \u2192 connect ${provider} key.`);
        setLogs((l) => [...l, `[${new Date().toLocaleTimeString()}] \u2717 ${err.message}`]);
      }
    } finally {
      setRunning(false);
      setStage("");
      abortRef.current = null;
      // Fenced ```path blocks in the reply become real edits in the workspace.
      try {
        const last = useGodEye.getState().chats.find((c) => c.id === chatId)?.messages.at(-1);
        if (last?.role === "assistant" && last.content) applyProjectReply(last.content);
      } catch {}
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function saveMessage(m: ChatMessage) {
    const f = suggestSaveFile(m.content, m.mode || mode, activeChat?.title || "chat");
    const r = await saveTextToDisk(f.content, f.name, `Save from ${m.mode || mode} chat`);
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] ⪽ ${f.name} → ${r.ok ? (r.path || r.summary.slice(0, 80)) : r.summary}`]);
    if (r.ok) { setSavedMsg(m.id); setTimeout(() => setSavedMsg(null), 1600); toast(`Saved ${f.name}`); }
    else toast(r.summary || "Save failed", "error");
  }

  async function runMessage(m: ChatMessage) {
    if (!plugins.terminal) return;
    const blocks = extractCodeBlocks(m.content);
    const results: string[] = [];
    for (const b of blocks) {
      if (!b.code.trim()) continue;
      setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] \u25b6 $ ${b.code.split("\n")[0]}${b.code.split("\n").length > 1 ? " \u2026" : ""}`]);
      const r = await runGodEyeTool("godeye_runCommand", { command: b.code });
      results.push(`$ ${b.code}\n${r.detail || r.summary}`);
      setLogs(l => [...l, `  ${(r.summary.split("\n")[0] || "").slice(0, 100)}`]);
    }
    if (results.length) setRunOut(prev => ({ ...prev, [m.id]: results.join("\n\n") }));
  }

  async function saveAsFormat(m: ChatMessage, fmt: "docx" | "pdf" | "zip") {
    const suggested = suggestSaveFile(m.content, m.mode || mode, activeChat?.title || "chat");
    const base = suggested.name.replace(/\.[^.]+$/, "") || "godeye-doc";
    const content = suggested.content || m.content || "";
    if (fmt === "docx") {
      const buf = makeDocx({ title: activeChat?.title || base, content });
      downloadToolFile({ name: `${base}.docx`, type: MIME_DOCX, base64: bufToBase64(buf) });
    } else if (fmt === "pdf") {
      const buf = makePdf({ title: activeChat?.title || base, content });
      downloadToolFile({ name: `${base}.pdf`, type: "application/pdf", base64: bufToBase64(buf) });
    } else {
      const blocks = extractCodeBlocks(m.content);
      const files = blocks.length ? blocks.map((b, i) => ({ name: `${base}-${i + 1}.${EXT[b.lang] || b.lang}`, content: b.code })) : [{ name: `${base}.md`, content }];
      const buf = makeZip(files.map(f => ({ path: f.name, data: new TextEncoder().encode(f.content) })));
      downloadToolFile({ name: `${base}.zip`, type: "application/zip", base64: bufToBase64(buf) });
    }
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] \u2b93 ${base}.${fmt} from chat`]);
    setSavedMsg(m.id);
    setTimeout(() => setSavedMsg(null), 1600);
  }

  const providerObj = PROVIDERS.find(p => p.id === provider);
  const modelList = modelsFor(providerObj, vault[provider]?.models);
  const desktop = isDesktop();
  const toolCapable = desktop && isToolProvider(provider);
  const genCaps = modelCapabilities(provider, model, vault[provider]?.models);
  const genModeActive = (mode === "image" && plugins.image && genCaps.image) || (mode === "video" && plugins.video && genCaps.video);

  return (
    <div className="h-[100dvh] h-screen flex bg-background overflow-hidden">
      {!focused && !sidebarHidden && <Sidebar />}
      {/* main nav menu — slide-over so you can always return to other pages */}
      {menuOpen && (
        <div className="fixed inset-0 z-[70] flex bg-black/40 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <div className="h-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <Sidebar variant="drawer" />
          </div>
          <button className="flex-1" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
        </div>
      )}
      {/* chats list — drawer on mobile, column on desktop */}
      {!focused && !sidebarHidden && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setSidebarHidden(true)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-[280px] flex-col overflow-hidden border-r bg-card transition-transform duration-200 sm:w-[280px] lg:static lg:z-auto lg:w-[280px] lg:max-w-none lg:shrink-0 lg:bg-card/30 lg:transition-none ${focused || sidebarHidden ? "-translate-x-full lg:hidden" : ""}`}>
        <div className="p-3 border-b flex items-center justify-between">
          <div className="font-semibold text-sm">Chats</div>
          <div className="flex items-center gap-1.5">
            <button onClick={toggleIncognito} title={incognito ? "Incognito ON — turn off" : "Incognito OFF — this chat is saved"} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs ${incognito ? "bg-foreground text-background" : "hover:bg-muted"}`}><EyeOff className="h-3.5 w-3.5"/><span className="hidden md:inline">{incognito ? "Incognito" : "Private"}</span></button>
            <button onClick={() => {
              if (!activeChat?.messages?.length) return;
              const md = buildChatExport(activeChat.title || "Chat", activeChat.messages);
              saveTextToDisk(md, `${(activeChat.title || "chat").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chat"}.md`, "Export chat").then(r => setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] \u2b93 export \u2192 ${r.summary}`]));
            }} disabled={!activeChat?.messages?.length} title="Export this chat (.md)" className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs disabled:opacity-40 hover:bg-muted"><Download className="h-3.5 w-3.5"/><span className="hidden md:inline">Export</span></button>
            <button onClick={newChat} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1.5 text-xs"><Plus className="h-3.5 w-3.5"/> New chat</button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {chats.length === 0 && <div className="text-xs text-muted-foreground p-3">No chats yet. Start one.</div>}
          {chats.map(c => (
            <div key={c.id} onClick={()=>selectChat(c.id)} className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer ${activeChatId===c.id ? "bg-foreground text-background" : "hover:bg-muted"}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate font-medium">{c.title}{c.incognito && <span className="opacity-70"> 🕵️</span>}</div>
                <div className={`text-xs truncate ${activeChatId===c.id ? "opacity-70" : "text-muted-foreground"}`}>{c.mode} • {c.provider}/{c.model.split("/").pop()}{c.incognito ? " • incognito" : ""}</div>
              </div>
              <button onClick={(e)=>{e.stopPropagation(); deleteChat(c.id); if(!c.incognito) noteChatDeleted(c.id);}} className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 hover:bg-black/10 rounded"><Trash2 className="h-3.5 w-3.5"/></button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t space-y-2">
          {!desktop && <div className="rounded-xl border bg-muted px-3 py-2 text-[11px] text-muted-foreground">Browser mode — files GodEye creates (code, docs, PDFs, ZIPs, folders) show up as downloads in the chat. Running commands needs the <b>desktop app</b>.</div>}
          <button onClick={()=>setShowTerminal(!showTerminal)} className="w-full flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs">
            <Terminal className="h-3.5 w-3.5"/> {showTerminal ? "Hide terminal" : "Show terminal"}
          </button>
          {showTerminal && <div className="rounded-xl bg-black text-green-400 font-mono text-[11px] p-2 h-32 overflow-auto whitespace-pre-wrap">{logs.join("\n") || "— terminal idle —"}</div>}
        </div>
      </aside>

      {/* main chat */}
      <main className="flex-1 flex flex-col min-w-0 bg-background min-h-0 overflow-hidden">
        {/* header */}
        <div className="h-14 border-b flex items-center gap-2 px-3 md:px-4 bg-background/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => setMenuOpen(true)} title="Menu — go back to other pages" className="p-2 rounded-xl border bg-card hover:bg-muted">
              <Menu className="h-4 w-4" />
            </button>
            <button onClick={() => setSidebarHidden(!sidebarHidden)} title={focused ? undefined : sidebarHidden ? "Show chats" : "Hide chats"} className={`p-2 rounded-xl border ${sidebarHidden ? "bg-foreground text-background" : "bg-card hover:bg-muted"} inline-flex ${focused ? "hidden" : ""}`}>
              {sidebarHidden ? <PanelLeftOpen className="h-4 w-4"/> : <PanelLeftClose className="h-4 w-4"/>}
            </button>
            <button onClick={() => setFocused(!focused)} title={focused ? "Exit focus" : "Focus chat only"} className={`p-2 rounded-xl border ${focused ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}>
              {focused ? <Minimize2 className="h-4 w-4"/> : <Maximize2 className="h-4 w-4"/>}
            </button>
            <span className="hidden md:inline text-xs text-muted-foreground ml-1">{focused ? "Focus" : sidebarHidden ? "Expanded" : ""}</span>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <SyncDot className="ml-1" /><SyncBadge className="ml-1" /><div className="hidden md:block text-sm font-medium">Chat</div>
            <span className="hidden md:block text-muted-foreground">•</span>
            {/* mode pills */}
            <div className="flex items-center gap-1 overflow-auto">
              {MODES.map(m => (
                <button key={m.id} onClick={()=>setMode(m.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap ${mode===m.id ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}>
                  <m.icon className="h-3 w-3"/>{m.label}
                </button>
              ))}
            </div>
          </div>
          {/* model switch */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hidden md:flex items-center gap-1.5 rounded-full border bg-card px-2 py-1" title="Reasoning depth — how hard GodEye thinks">
              <span className="text-xs">🧠</span>
              <select value={settings.reasoningEffort || "medium"} onChange={e=>setSettings({ reasoningEffort: e.target.value as any })} className="bg-transparent text-xs outline-none">
                <option value="off">Fast</option>
                <option value="low">Low</option>
                <option value="medium">Think</option>
                <option value="high">Deep</option>
                <option value="extra-high">Max 🧠</option>
              </select>
            </div>
            <div className="hidden md:flex items-center gap-1.5 rounded-full border bg-card px-2 py-1">
              <span className="h-2 w-2 rounded-full" style={{background: providerObj?.color}}/>
              <select value={provider} onChange={e=>{ const pid=e.target.value as ProviderId; selectConnector(pid); }} className="bg-transparent text-xs outline-none">
                {PROVIDERS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <span className="text-muted-foreground">/</span>
              <select value={model} onChange={e=>{ const m=e.target.value; setModel(m); setLastSelection(provider, m); }} className="bg-transparent text-xs outline-none max-w-[140px]">
                {modelList.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <Link href="/vault" className="text-xs rounded-full border px-3 py-1.5 hidden md:inline">Vault</Link>
          </div>
        </div>

        {/* messages */}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4 overscroll-contain">
          {!activeChat || activeChat.messages.length===0 ? (
            <div className="max-w-2xl mx-auto text-center py-16">
              <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"><span className="h-2 w-2 rounded-full bg-emerald-500"/> GodEye OS • {mode} mode • {providerObj?.name}</div>
              <h2 className="mt-4 text-2xl font-semibold">What should GodEye do?</h2>
              <p className="text-sm text-muted-foreground mt-1">Pick a mode, attach files as reference, change model anytime. {desktop && toolsOn && toolCapable ? "Tools are live — GodEye can create files, folders, Word docs, PDFs and ZIPs, plus run commands on your PC." : toolsOn && toolCapable ? "Tools are live — GodEye can create files, folders, Word docs, PDFs and ZIPs that show up here to download." : "On the desktop app GodEye can also save files and run commands."}</p>
            </div>
          ) : activeChat.messages.map(m => (
            <div key={m.id} className={`max-w-3xl mx-auto flex gap-3 ${m.role==="user" ? "justify-end" : "justify-start"}`}>
              <div className={`rounded-2xl px-4 py-3 text-sm max-w-[85%] ${m.role==="user" ? "bg-foreground text-background" : "bg-card border"}`}>
                {m.attachments && m.attachments.length>0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {m.attachments.map(a=>(
                      <span key={a.name} title={a.note || a.type} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs border ${a.note ? "bg-destructive/10 border-destructive/40 text-destructive" : "bg-muted text-foreground"}`}>
                        {a.type.startsWith("image/") && a.preview ? <img src={a.preview} alt={a.name} className="h-6 w-6 rounded object-cover"/> : <Paperclip className="h-3 w-3"/>}
                        {a.name} <span className="opacity-60">{(a.size/1024).toFixed(0)}KB</span>
                        {a.note && <span className="opacity-80">· {a.note}</span>}
                      </span>
                    ))}
                  </div>
                )}
                {m.role === "user" ? (
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                ) : (
                  <Markdown content={m.content || (running ? "▊" : "")} />
                )}
                {m.media && m.media.length>0 && (
                  <div className="mt-2 space-y-2">
                    {m.media.map((md, i)=>(
                      <div key={`${md.filename || md.src.slice(0, 48)}-${i}`} className="overflow-hidden rounded-xl border bg-black/5">
                        {md.kind==="image" ? (
                          <img src={md.src} alt={`Generated image ${i+1}`} className="max-h-[28rem] w-full object-contain"/>
                        ) : (
                          <video src={md.src} controls playsInline preload="metadata" className="max-h-[28rem] w-full"/>
                        )}
                        <div className="flex items-center justify-between gap-2 border-t bg-foreground/5 px-3 py-2">
                          <span className="truncate text-[11px] opacity-60">{md.filename || (md.kind==="image" ? "godeye-image.png" : "godeye-video.mp4")}</span>
                          <button onClick={()=>downloadMedia(md)} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium opacity-70 hover:opacity-100">
                            <Download className="h-3 w-3"/> Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {m.role==="assistant" && (
                  <div className="mt-2 space-y-2">
                    {createdFiles[m.id]?.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Created files</div>
                        {createdFiles[m.id].map((f, fi)=>(
                          <div key={f.name+fi} className="flex items-center gap-2 rounded-xl border bg-muted/50 px-3 py-2 text-xs">
                            <FileText className="h-4 w-4 shrink-0 opacity-70"/>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{f.name}</div>
                              <div className="truncate opacity-60">{f.savedPath ? f.savedPath : f.base64 ? f.type : `${(f.content?.length || 0).toLocaleString()} chars`}</div>
                            </div>
                            <button onClick={()=>downloadToolFile(f)} className="inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-1.5 font-medium shrink-0 hover:bg-muted">
                              <Download className="h-3 w-3"/> Download
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {m.content && (
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <button onClick={()=>{ navigator.clipboard.writeText(m.content); setCopied(m.id); setTimeout(()=>setCopied(null),1500); }} className="inline-flex items-center gap-1 opacity-60 hover:opacity-100">
                          {copied===m.id ? <Check className="h-3 w-3"/> : <Copy className="h-3 w-3"/>} copy
                        </button>
                        <button onClick={()=>saveMessage(m)} className="inline-flex items-center gap-1 opacity-60 hover:opacity-100" title={`Save as ${suggestSaveFile(m.content, m.mode || mode, activeChat?.title || "chat").name}`}>
                          {savedMsg===m.id ? <Check className="h-3 w-3 text-emerald-500"/> : <Download className="h-3 w-3"/>} md
                        </button>
                        <button onClick={()=>saveAsFormat(m, "docx")} className="inline-flex items-center gap-1 opacity-60 hover:opacity-100" title="Save this message as a Word document">docx</button>
                        <button onClick={()=>saveAsFormat(m, "pdf")} className="inline-flex items-center gap-1 opacity-60 hover:opacity-100" title="Save this message as a PDF">pdf</button>
                        <button onClick={()=>saveAsFormat(m, "zip")} className="inline-flex items-center gap-1 opacity-60 hover:opacity-100" title="Package the code blocks into a ZIP">zip</button>
                        {extractCodeBlocks(m.content)[0]?.code.trim() && !running && (
                          <button onClick={()=>runMessage(m)} className="inline-flex items-center gap-1 opacity-60 hover:opacity-100" title="Run the code blocks on this PC (desktop app)">
                            <Play className="h-3 w-3"/> run code
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {runOut[m.id] && (
                  <div className="mt-2 rounded-xl bg-black text-green-400 font-mono text-[11px] p-2 max-h-64 overflow-auto whitespace-pre-wrap">{runOut[m.id]}</div>
                )}
                <div className="mt-1 text-[11px] opacity-50">{new Date(m.timestamp).toLocaleTimeString()} {m.provider && `• ${m.provider}/${m.model?.split("/").pop()}`} {m.mode && `• ${m.mode}`}</div>
              </div>
            </div>
          ))}
          {running && <div className="max-w-3xl mx-auto text-xs text-muted-foreground flex gap-2"><span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse mt-1 shrink-0"/> {stage || `GodEye is thinking (${settings.reasoningEffort || "medium"}) — ${provider}/${model} • ${mode}`}</div>}
        </div>

        {/* composer - Codex style */}
        <div className="border-t bg-card/50 p-3 md:p-4 shrink-0 safe-bottom">
          {projectFiles.length>0 && (
            <div className="max-w-3xl mx-auto mb-2 rounded-xl border bg-card p-2.5">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-500 shrink-0"/>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{projectName || "project"} <span className="opacity-60 font-normal">— {projectFiles.length} files loaded</span></div>
                  <div className="text-[11px] opacity-60">Ask for changes; edited files come back as path-tagged code blocks. Then export.</div>
                </div>
                <button onClick={()=>exportProjectDownload("improved")} disabled={projectBusy} className="inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50" title="Download the improved project as a ZIP">
                  <Download className="h-3.5 w-3.5"/> ZIP
                </button>
                <button onClick={()=>exportProjectToDrive()} disabled={projectBusy} className="inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50" title={drive.status === "connected" ? `Save to Google Drive/GodEye/Projects${drive.email ? ` (${drive.email})` : ""}` : "Connect Google Drive and save there"}>
                  <Cloud className="h-3.5 w-3.5"/> {drive.status === "connected" ? "Drive" : "Drive…"}
                </button>
                {desktop && (
                  <button onClick={()=>exportProjectToFolder()} disabled={projectBusy} className="inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50" title="Write the project straight into a folder on this PC">
                    <FolderOpen className="h-3.5 w-3.5"/> Write to disk
                  </button>
                )}
                <button onClick={()=>{ setProjectFiles([]); setProjectName(""); }} className="p-1.5 rounded-lg hover:bg-muted opacity-60" title="Close project"><X className="h-3.5 w-3.5"/></button>
              </div>
            </div>
          )}
          {files.length>0 && (
            <div className="max-w-3xl mx-auto mb-2 flex flex-wrap gap-2">
              {files.map((f, i)=>(
                <span key={f.name+i} title={f.note || `${f.kind} · ${f.mime}`} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${f.note ? "border-destructive/50 bg-destructive/10 text-destructive" : "bg-card"}`}>
                  {f.preview ? <img src={f.preview} alt={f.name} className="h-6 w-6 rounded object-cover"/> : <Paperclip className="h-3 w-3"/>}
                  <span className="max-w-[16rem] truncate">{f.name}</span>
                  <span className="opacity-60">{(f.size/1024).toFixed(0)}KB</span>
                  {f.note && <span className="max-w-[14rem] truncate opacity-80">· {f.note}</span>}
                  <button onClick={()=>setFiles(files.filter((_,j)=>j!==i))} className="p-0.5 hover:bg-muted rounded-full"><X className="h-3 w-3"/></button>
                </span>
              ))}
            </div>
          )}
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border bg-background p-2 shadow-sm">
              <div className="flex items-end gap-2">
                <button onClick={()=>{ const next = !toolsOn; setToolsOn(next); setSettings({ agentTools: next, plugins: { ...plugins, tools: next } }); }} className={`p-2 rounded-xl shrink-0 transition-colors ${toolsOn ? "text-amber-500 hover:bg-muted" : "opacity-40 hover:bg-muted"}`} title={`Agent tools ${toolsOn ? "ON" : "OFF"} — ${toolCapable ? (desktop ? "GodEye can save files, folders, Word docs, PDFs, ZIPs and run commands on your PC" : "GodEye can create files, folders, Word docs, PDFs and ZIPs you can download") : desktop ? "need a tool-capable provider (OpenAI/NVIDIA/OpenRouter)" : "need the desktop app"}`}><Zap className={`h-4 w-4 ${toolsOn && !toolCapable ? "opacity-40" : ""}`}/></button>
                <button onClick={()=>fileRef.current?.click()} disabled={reading} className="p-2 rounded-xl hover:bg-muted shrink-0 disabled:opacity-40" title={`Attach files — images, PDFs, code, or a .zip project${supportsNativePdf(provider) ? " — PDFs are sent whole and read by the model" : " — switch to Anthropic/Google/OpenRouter to read PDFs"}`}><Paperclip className="h-4 w-4"/></button>
                <button onClick={()=>folderRef.current?.click()} disabled={reading} className="p-2 rounded-xl hover:bg-muted shrink-0 disabled:opacity-40" title="Open a whole project folder — deps and build output are skipped"><FolderOpen className="h-4 w-4"/></button>
                <input ref={fileRef} type="file" multiple accept={ACCEPTED_FILE_TYPES} className="hidden" onChange={handleFiles}/>
                <input ref={folderRef} type="file" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} multiple className="hidden" onChange={handleFiles}/>
                <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if (shouldSendOnEnter(e)){ e.preventDefault(); if(!running) send(); }}} placeholder={`Message • ${mode} mode${projectFiles.length ? ` • project: ${projectName} (${projectFiles.length} files)` : ""} • ${enterHint()}`} rows={1} className="flex-1 min-w-0 bg-transparent outline-none text-[16px] sm:text-sm resize-none py-2 max-h-32"/>
                <div className="flex items-center gap-1.5 shrink-0 relative" ref={modelMenuRef}>
                  <button onClick={()=>setShowModelMenu(!showModelMenu)} className="p-2 rounded-xl hover:bg-muted shrink-0" title={`Model, connectors & plugins • ${providerObj?.name}/${model}`}><Plus className="h-4 w-4"/></button>
                  {showModelMenu && (
                    <div className="absolute bottom-full right-0 mb-2 w-80 rounded-2xl border bg-card shadow-xl p-2 z-50">
                      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1 mb-1.5">
                        {(["model", "connector", "plugins"] as const).map(t => (
                          <button key={t} onClick={()=>setMenuTab(t)} className={`rounded-lg px-2 py-1.5 text-xs capitalize font-medium ${menuTab===t ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                            {t === "connector" ? "Connect" : t}
                          </button>
                        ))}
                      </div>

                      {menuTab === "model" && (<>
                        <div className="px-2 py-1.5 pb-0">
                          <div className="text-[11px] text-muted-foreground font-medium mb-1">Connector / provider</div>
                          <select value={provider} onChange={e=>{ selectConnector(e.target.value as ProviderId); }} className="w-full rounded-lg border bg-muted px-2 py-1.5 text-sm outline-none">
                            {PROVIDERS.map(p=>(<option key={p.id} value={p.id}>{p.name}{vault[p.id]?.connected ? " ✓" : " • needs key"}</option>))}
                          </select>
                        </div>
                        <div className="max-h-72 overflow-y-auto mt-1">
                          <div className="text-[11px] text-muted-foreground px-2 py-1 font-medium">{providerObj?.name} models ({modelList.length})</div>
                          {modelList.map(m=>(
                            <button key={m.id} onClick={()=>{ setModel(m.id); setLastSelection(provider, m.id); setShowModelMenu(false); }} className={`w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted ${model===m.id ? "bg-foreground text-background" : ""}`}>
                              <span className="h-2 w-2 rounded-full shrink-0" style={{background: providerObj?.color}}/>
                              <span className="truncate">{m.name}</span>
                              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                                {(m as any).reasoning && <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] uppercase tracking-wide text-emerald-600">🧠</span>}
                                {m.image && <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] uppercase tracking-wide text-amber-600">img</span>}
                                {m.video && <span className="rounded bg-violet-500/15 px-1 py-0.5 text-[9px] uppercase tracking-wide text-violet-600">vid</span>}
                                <span className="text-[10px] opacity-50">{m.context}</span>
                              </span>
                            </button>
                          ))}
                          {modelList.length === 0 && <div className="px-2.5 py-2 text-xs text-muted-foreground">No models — connect a {providerObj?.name} key in the Vault.</div>}
                        </div>
                      </>)}

                      {menuTab === "connector" && (<>
                        <div className="max-h-80 overflow-y-auto space-y-1 mt-1 p-1">
                          <div className="text-[11px] text-muted-foreground px-2 py-1 font-medium">Connectors — which provider key powers this chat</div>
                          {PROVIDERS.map(p=>{
                            const v = vault[p.id];
                            const conn = !!v?.connected;
                            const on = provider === p.id;
                            return (
                              <button key={p.id} onClick={()=>{ selectConnector(p.id); setShowModelMenu(false); }} className={`w-full flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm hover:bg-muted ${on ? "border-foreground bg-muted/50" : "border-transparent"}`}>
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{background: p.color}}/>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-1.5 font-medium">
                                    {p.name}
                                    {on && <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background">active</span>}
                                  </span>
                                  <span className="block truncate text-[11px] opacity-60">
                                    {conn ? (v.endpoint ? `Connected • ${v.endpoint}` : "Connected") : v ? "Key saved — not verified" : "Not connected"}
                                  </span>
                                </span>
                                <span className={`h-2 w-2 shrink-0 rounded-full ${conn ? "bg-emerald-500" : "bg-muted-foreground/40"}`}/>
                              </button>
                            );
                          })}
                        </div>
                        <Link href="/vault" onClick={()=>setShowModelMenu(false)} className="mt-1.5 block rounded-xl border px-3 py-2 text-center text-xs font-medium hover:bg-muted">Open Providers Vault →</Link>
                      </>)}

                      {menuTab === "plugins" && (<>
                        <div className="mt-1 space-y-1">
                          <div className="text-[11px] text-muted-foreground px-2 py-1 font-medium">Plugins — attach to the selected model</div>
                          {PLUGIN_DEFS.map(def=>{
                            const on = !!plugins[def.id];
                            const needsCap = def.id === "image" || def.id === "video";
                            const hasCap = def.id === "image" ? genCaps.image : def.id === "video" ? genCaps.video : true;
                            return (
                              <button key={def.id} onClick={()=>togglePlugin(def.id)} className="w-full flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-left text-sm hover:bg-muted">
                                <def.icon className={`h-4 w-4 shrink-0 ${on ? def.iconClass : "opacity-40"}`}/>
                                <span className="min-w-0 flex-1">
                                  <span className="font-medium">{def.label}</span>
                                  <span className="block text-[11px] opacity-60">{def.desc}{needsCap && on && !hasCap ? ` — ${def.id==="image" ? "image" : "video"}-capable model needed (auto-switches)` : needsCap && !on ? "" : ""}</span>
                                </span>
                                <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-muted"}`}>
                                  <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : ""}`}/>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>)}
                    </div>
                  )}
                  {running ? (
                    <button onClick={stop} className="inline-flex items-center gap-1.5 rounded-full bg-red-600 text-white px-3 sm:px-4 py-2 text-sm shrink-0"><Square className="h-3.5 w-3.5 fill-white"/><span className="hidden sm:inline">Stop</span></button>
                  ) : (
                    <button onClick={send} disabled={!input.trim() && files.length===0} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 sm:px-4 py-2 text-sm disabled:opacity-40 shrink-0"><Send className="h-3.5 w-3.5"/><span className="hidden sm:inline">Send</span></button>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="hidden sm:inline">{genModeActive ? <><Clapperboard className={`inline h-3 w-3 ${mode==="video" ? "text-violet-500" : "text-amber-500"}`}/> Generation live — send a prompt and {model} renders a real {mode==="video" ? "video" : "image"} directly. </> : <>{toolsOn ? <><Zap className="inline h-3 w-3 text-amber-500"/> Tools ON — ask GodEye to save this to a file or run it. </> : <><Zap className="inline h-3 w-3"/> Tools OFF. </>}</>}Enter to send • Shift+Enter newline • Upload files as reference</span>
              <span className="sm:hidden">{footerHint("")}</span>
              <span className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1 md:hidden">🧠
                  <select value={settings.reasoningEffort || "medium"} onChange={e=>setSettings({ reasoningEffort: e.target.value as any })} className="bg-transparent text-[11px] outline-none border rounded-full px-1 py-0.5">
                    <option value="off">Fast</option><option value="low">Low</option><option value="medium">Think</option><option value="high">Deep</option><option value="extra-high">Max</option>
                  </select>
                </label>
                <button onClick={toggleIncognito} title="Incognito — chat is not saved and deletes when you leave" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${incognito ? "bg-foreground text-background" : "hover:bg-muted"}`}><EyeOff className="h-3 w-3"/> <span className="hidden sm:inline">{incognito ? "Incognito" : "Private"}</span></button>
                <button onClick={newChat} className="inline-flex items-center gap-1 hover:text-foreground"><Plus className="h-3 w-3"/> New chat</button>
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
