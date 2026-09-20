"use client";
import { useState, useRef, useEffect } from "react";
import { useGodEye, type ChatMode, type ChatMessage } from "@/lib/store";
import { PROVIDERS, modelsFor, type ProviderId } from "@/lib/providers";
import { Sidebar } from "@/components/sidebar";
import { Send, Square, Plus, Paperclip, X, Copy, Check, Terminal, Code2, Image as ImageIcon, Search, ListTree, MessageSquare, Lightbulb, Trash2, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Download, Zap, Play, FileText, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { getDecryptedVaultForApi } from "@/lib/vault-crypto";
import { isDesktop, runGodEyeTool, saveTextToDisk, downloadToolFile, type ToolFile } from "@/lib/desktop";
import { isToolProvider } from "@/lib/tools";
import { makeDocx, makePdf, makeZip, bufToBase64, MIME_DOCX } from "@/lib/file-builder";

const MODES: { id: ChatMode; label: string; icon: LucideIcon; desc: string }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, desc: "General" },
  { id: "coding", label: "Coding", icon: Code2, desc: "Build code" },
  { id: "image", label: "Image", icon: ImageIcon, desc: "Generate images" },
  { id: "plan", label: "Plan", icon: ListTree, desc: "Break into steps" },
  { id: "search", label: "Search", icon: Search, desc: "Research" },
  { id: "research", label: "Research", icon: Lightbulb, desc: "Deep dive" },
  { id: "terminal", label: "Terminal", icon: Terminal, desc: "Commands" },
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

export default function ChatPage() {
  const { chats, activeChatId, createChat, setActiveChat, addMessage, updateLastMessage, deleteChat, vault, settings, setSettings } = useGodEye();
  const activeChat = chats.find(c => c.id === activeChatId) || null;

  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(activeChat?.mode || "chat");
  const [provider, setProvider] = useState(activeChat?.provider || settings.defaultProvider);
  const [model, setModel] = useState(activeChat?.model || PROVIDERS.find(p=>p.id===settings.defaultProvider)?.models[0].id || "anthropic/claude-3.5-sonnet");
  const [files, setFiles] = useState<{ name: string; type: string; size: number; content: string; preview?: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [toolsOn, setToolsOn] = useState<boolean>(settings.agentTools !== false);
  const [runOut, setRunOut] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [createdFiles, setCreatedFiles] = useState<Record<string, ToolFile[]>>({});
  const [focused, setFocused] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(() => (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches ? false : true));
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);

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

  function newChat() {
    const id = createChat({ mode, provider, model });
    setFiles([]);
    setLogs([`[${new Date().toLocaleTimeString()}] new chat ${id}`]);
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files;
    if (!fl) return;
    const arr: { name: string; type: string; size: number; content: string; preview?: string }[] = [];
    for (const f of Array.from(fl)) {
      const isImage = f.type.startsWith("image/");
      const content = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        if (isImage) r.readAsDataURL(f);
        else r.readAsText(f);
      });
      arr.push({ name: f.name, type: f.type || "text/plain", size: f.size, content: isImage ? content : content.slice(0, 20000), preview: isImage ? content : undefined });
    }
    setFiles(prev => [...prev, ...arr]);
    if (fileRef.current) fileRef.current.value = "";
  }

  interface WireMsg { role: "user" | "assistant" | "system" | "tool"; content: string; tool_calls?: { id: string; type?: string; function: { name: string; arguments: string } }[]; tool_call_id?: string }

  function normalizeMsg(m: ChatMessage): WireMsg {
    const src = m as ChatMessage & { tool_calls?: WireMsg["tool_calls"]; tool_call_id?: string };
    const out: WireMsg = { role: m.role, content: m.content ?? "" };
    if (src.tool_calls) out.tool_calls = src.tool_calls;
    if (src.tool_call_id) out.tool_call_id = src.tool_call_id;
    return out;
  }

  interface ToolCallWire { id: string; name: string; arguments: Record<string, unknown> }

  async function runAgentLoop(chatId: string, asstId: string, userContent: string, referenceFiles: { name: string; content: string; type: string }[], controller: AbortController) {
    const decryptedVault = await getDecryptedVaultForApi(vault);
    const useTools = toolsOn && isToolProvider(provider);
    const history: WireMsg[] = [...(activeChat?.messages || [])].map(normalizeMsg);
    history.push({ role: "user", content: userContent });

    const MAX_TOOL_ITER = 6;
    let iterations = 0;

    while (iterations <= MAX_TOOL_ITER) {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          provider, model, mode, referenceFiles, vault: decryptedVault, settings, stream: true, toolsEnabled: useTools,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error || "Chat failed");
      }

      const ct = res.headers.get("content-type") || "";

      // JSON response => either plain content or a batch of tool calls to run
      if (ct.includes("application/json")) {
        const j = await res.json();
        if (!j.toolCalls?.length) {
          if (j.content) updateLastMessage(chatId, j.content);
          return;
        }
        iterations++;
        if (iterations > MAX_TOOL_ITER) {
          updateLastMessage(chatId, `**Stopped:** tool iteration limit reached (${MAX_TOOL_ITER}).`);
          return;
        }
        const calls = j.toolCalls as ToolCallWire[];
        setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] \u21c4 tool round ${iterations} \u2192 ${calls.map(t => t.name).join(", ")}`]);
        updateLastMessage(chatId, `_Using tools: ${calls.map(t => t.name).join(", ")}\u2026_`);
        history.push({
          role: "assistant", content: "",
          tool_calls: calls.map(tc => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) } })),
        });
        for (const tc of calls) {
          const result = await runGodEyeTool(tc.name, tc.arguments || {});
          history.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
          const toolFiles = result.files;
          if (toolFiles?.length) {
            setCreatedFiles(prev => ({ ...prev, [asstId]: [...(prev[asstId] || []), ...toolFiles] }));
          }
          setLogs(l => [...l, `  ${tc.name} \u2192 ${result.summary}`]);
          updateLastMessage(chatId, `_Using tools: ${calls.map(t => t.name).join(", ")}\u2026\n  ${result.summary}_`);
        }
        continue;
      }

      // SSE stream (final answer)
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = "";
      if (reader) {
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const data = JSON.parse(line.slice(5).trim());
            if (data.delta) {
              full += data.delta;
              updateLastMessage(chatId, full);
            }
            if (data.done) {
              setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] \u2713 ${data.latencyMs ? (data.latencyMs/1000).toFixed(1)+"s" : ""} ${data.usage ? data.usage.total_tokens+" tokens" : ""}`]);
            }
          }
        }
        if (!full) {
          const txt = await res.text();
          try { const j = JSON.parse(txt); if (j.content) { full = j.content; updateLastMessage(chatId, full); } } catch {}
        }
      } else {
        const j = await res.json();
        updateLastMessage(chatId, j.content || "");
      }
      return;
    }
  }

  async function send() {
    if (!input.trim() && files.length === 0) return;
    if (!activeChat) return;
    const chatId = activeChat.id;
    const userContent = input.trim();
    const attachments = files.length ? files.map(f => ({ name: f.name, type: f.type, size: f.size, preview: f.preview })) : undefined;

    addMessage(chatId, { id: Date.now().toString(), role: "user", content: userContent + (files.length ? `\n\n[Attached ${files.length} file(s): ${files.map(f=>f.name).join(", ")}]` : ""), timestamp: new Date().toISOString(), attachments, mode, provider, model });
    setInput("");
    const sendFiles = [...files];
    setFiles([]);
    setRunning(true);
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] \u2192 ${provider}/${model} [${mode}] ${userContent.slice(0,80)}${toolsOn ? " \u26a1tools" : ""}`]);

    // optimistic assistant placeholder
    const asstId = (Date.now()+1).toString();
    addMessage(chatId, { id: asstId, role: "assistant", content: "", timestamp: new Date().toISOString(), mode, provider, model });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const referenceFiles = sendFiles.map(f => ({ name: f.name, content: f.content.slice(0, 15000), type: f.type }));
      await runAgentLoop(chatId, asstId, userContent, referenceFiles, controller);
    } catch (e) {
      const err = e as Error;
      if (err.name === "AbortError") {
        setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] \u25a0 stopped by user`]);
        updateLastMessage(chatId, (activeChat.messages[activeChat.messages.length-1]?.content || "") + "\n\n_— stopped_");
      } else {
        updateLastMessage(chatId, `**Error:** ${err.message}\n\nCheck Providers Vault \u2192 connect ${provider} key.`);
        setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] \u2717 ${err.message}`]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function saveMessage(m: ChatMessage) {
    const f = suggestSaveFile(m.content, m.mode || mode, activeChat?.title || "chat");
    const r = await saveTextToDisk(f.content, f.name, `Save from ${m.mode || mode} chat`);
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] \u2b93 ${f.name} \u2192 ${r.ok ? (r.path || r.summary.slice(0, 80)) : r.summary}`]);
    if (r.ok) { setSavedMsg(m.id); setTimeout(() => setSavedMsg(null), 1600); }
  }

  async function runMessage(m: ChatMessage) {
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

  return (
    <div className="h-[100dvh] h-screen flex bg-background overflow-hidden">
      {!focused && !sidebarHidden && <Sidebar />}
      {/* chats list — drawer on mobile, column on desktop */}
      {!focused && !sidebarHidden && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setSidebarHidden(true)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-[280px] flex-col overflow-hidden border-r bg-card transition-transform duration-200 sm:w-[280px] lg:static lg:z-auto lg:w-[280px] lg:max-w-none lg:shrink-0 lg:bg-card/30 lg:transition-none ${focused || sidebarHidden ? "-translate-x-full lg:hidden" : ""}`}>
        <div className="p-3 border-b flex items-center justify-between">
          <div className="font-semibold text-sm">Chats</div>
          <div className="flex items-center gap-1.5">
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
            <div key={c.id} onClick={()=>setActiveChat(c.id)} className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer ${activeChatId===c.id ? "bg-foreground text-background" : "hover:bg-muted"}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate font-medium">{c.title}</div>
                <div className={`text-xs truncate ${activeChatId===c.id ? "opacity-70" : "text-muted-foreground"}`}>{c.mode} • {c.provider}/{c.model.split("/").pop()}</div>
              </div>
              <button onClick={(e)=>{e.stopPropagation(); deleteChat(c.id);}} className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 hover:bg-black/10 rounded"><Trash2 className="h-3.5 w-3.5"/></button>
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
            <button onClick={() => setSidebarHidden(!sidebarHidden)} title={focused ? undefined : sidebarHidden ? "Show chats" : "Hide chats"} className={`p-2 rounded-xl border ${sidebarHidden ? "bg-foreground text-background" : "bg-card hover:bg-muted"} inline-flex ${focused ? "hidden" : ""}`}>
              {sidebarHidden ? <PanelLeftOpen className="h-4 w-4"/> : <PanelLeftClose className="h-4 w-4"/>}
            </button>
            <button onClick={() => setFocused(!focused)} title={focused ? "Exit focus" : "Focus chat only"} className={`p-2 rounded-xl border ${focused ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}>
              {focused ? <Minimize2 className="h-4 w-4"/> : <Maximize2 className="h-4 w-4"/>}
            </button>
            <span className="hidden md:inline text-xs text-muted-foreground ml-1">{focused ? "Focus" : sidebarHidden ? "Expanded" : ""}</span>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="hidden md:block text-sm font-medium">Chat</div>
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
            <div className="hidden md:flex items-center gap-1.5 rounded-full border bg-card px-2 py-1">
              <span className="h-2 w-2 rounded-full" style={{background: providerObj?.color}}/>
              <select value={provider} onChange={e=>{ const pid=e.target.value as ProviderId; const prov=PROVIDERS.find(p=>p.id===pid); const list = modelsFor(prov, vault[pid]?.models); setProvider(pid); if(list[0]?.id) setModel(list[0].id); }} className="bg-transparent text-xs outline-none">
                {PROVIDERS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <span className="text-muted-foreground">/</span>
              <select value={model} onChange={e=>setModel(e.target.value)} className="bg-transparent text-xs outline-none max-w-[140px]">
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
                      <span key={a.name} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs text-foreground border">
                        {a.type.startsWith("image/") && a.preview ? <img src={a.preview} alt={a.name} className="h-6 w-6 rounded object-cover"/> : <Paperclip className="h-3 w-3"/>}
                        {a.name} <span className="opacity-60">{(a.size/1024).toFixed(0)}KB</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">{m.content || (running && m.role==="assistant" ? "▊" : "")}</div>
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
          {running && <div className="max-w-3xl mx-auto text-xs text-muted-foreground flex gap-2"><span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse mt-1"/> GodEye is thinking — {provider}/{model} • {mode}</div>}
        </div>

        {/* composer - Codex style */}
        <div className="border-t bg-card/50 p-3 md:p-4 shrink-0">
          {files.length>0 && (
            <div className="max-w-3xl mx-auto mb-2 flex flex-wrap gap-2">
              {files.map((f, i)=>(
                <span key={f.name+i} className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs">
                  {f.preview ? <img src={f.preview} alt={f.name} className="h-6 w-6 rounded object-cover"/> : <Paperclip className="h-3 w-3"/>}
                  {f.name} <button onClick={()=>setFiles(files.filter((_,j)=>j!==i))} className="p-0.5 hover:bg-muted rounded-full"><X className="h-3 w-3"/></button>
                </span>
              ))}
            </div>
          )}
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border bg-background p-2 shadow-sm">
              <div className="flex items-end gap-2">
                <button onClick={()=>{ const next = !toolsOn; setToolsOn(next); setSettings({ agentTools: next }); }} className={`p-2 rounded-xl shrink-0 transition-colors ${toolsOn ? "text-amber-500 hover:bg-muted" : "opacity-40 hover:bg-muted"}`} title={`Agent tools ${toolsOn ? "ON" : "OFF"} — ${toolCapable ? (desktop ? "GodEye can save files, folders, Word docs, PDFs, ZIPs and run commands on your PC" : "GodEye can create files, folders, Word docs, PDFs and ZIPs you can download") : desktop ? "need a tool-capable provider (OpenAI/NVIDIA/OpenRouter)" : "need the desktop app"}`}><Zap className={`h-4 w-4 ${toolsOn && !toolCapable ? "opacity-40" : ""}`}/></button>
                <button onClick={()=>fileRef.current?.click()} className="p-2 rounded-xl hover:bg-muted shrink-0" title="Upload images/files"><Paperclip className="h-4 w-4"/></button>
                <input ref={fileRef} type="file" multiple accept="image/*,.txt,.md,.json,.csv,.pdf" className="hidden" onChange={handleFiles}/>
                <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); if(!running) send(); }}} placeholder={`Message • ${mode} mode • Shift+Enter for newline`} rows={1} className="flex-1 min-w-0 bg-transparent outline-none text-[16px] sm:text-sm resize-none py-2 max-h-32"/>
                <div className="flex items-center gap-1.5 shrink-0 relative" ref={modelMenuRef}>
                  <button onClick={()=>setShowModelMenu(!showModelMenu)} className="p-2 rounded-xl hover:bg-muted shrink-0" title={`Models • ${providerObj?.name}`}><Plus className="h-4 w-4"/></button>
                  {showModelMenu && (
                    <div className="absolute bottom-full right-0 mb-2 w-72 rounded-2xl border bg-card shadow-xl p-2 z-50">
                      <div className="px-2 py-1.5">
                        <div className="text-[11px] text-muted-foreground font-medium mb-1">Provider</div>
                        <select value={provider} onChange={e=>{
                          const pid = e.target.value as ProviderId;
                          const prov = PROVIDERS.find(p=>p.id===pid);
                          const list = modelsFor(prov, vault[pid]?.models);
                          setProvider(pid);
                          setModel(list[0]?.id || "");
                        }} className="w-full rounded-lg border bg-muted px-2 py-1.5 text-sm outline-none">
                          {PROVIDERS.map(p=>(<option key={p.id} value={p.id}>{p.name}{vault[p.id]?.connected ? "" : " • needs key"}</option>))}
                        </select>
                      </div>
                      <div className="max-h-80 overflow-y-auto mt-1">
                        <div className="text-[11px] text-muted-foreground px-2 py-1 font-medium">{providerObj?.name} models ({modelList.length})</div>
                        {modelList.map(m=>(
                          <button key={m.id} onClick={()=>{ setModel(m.id); setShowModelMenu(false); }} className={`w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted ${model===m.id ? "bg-foreground text-background" : ""}`}>
                            <span className="h-2 w-2 rounded-full shrink-0" style={{background: providerObj?.color}}/>
                            <span className="truncate">{m.name}</span>
                            <span className="ml-auto text-[10px] opacity-50">{m.context}</span>
                          </button>
                        ))}
                        {modelList.length === 0 && <div className="px-2.5 py-2 text-xs text-muted-foreground">No models — connect a {providerObj?.name} key in the Vault.</div>}
                      </div>
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
              <span className="hidden sm:inline">{toolsOn ? <><Zap className="inline h-3 w-3 text-amber-500"/> Tools ON — ask GodEye to save this to a file or run it. </> : <><Zap className="inline h-3 w-3"/> Tools OFF. </>}Enter to send • Shift+Enter newline • Upload files as reference</span>
              <span className="sm:hidden">Enter to send • Shift+Enter newline</span>
              <button onClick={newChat} className="inline-flex items-center gap-1 hover:text-foreground"><Plus className="h-3 w-3"/> New chat</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
