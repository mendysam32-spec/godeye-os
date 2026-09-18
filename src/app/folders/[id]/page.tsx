"use client";
import { useRef, useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { useGodEye, type ChatMode } from "@/lib/store";
import { PROVIDERS, modelsFor, type ProviderId } from "@/lib/providers";
import { getDecryptedVaultForApi } from "@/lib/vault-crypto";
import { Send, Square, Plus, Paperclip, X, Copy, Check, Terminal, Code2, Image as ImageIcon, Search, ListTree, MessageSquare, Lightbulb, Trash2, Folder as FolderIcon, ArrowLeft, ChevronDown, FolderKanban } from "lucide-react";

const MODES: { id: ChatMode; label: string; icon: any }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "coding", label: "Coding", icon: Code2 },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "plan", label: "Plan", icon: ListTree },
  { id: "search", label: "Search", icon: Search },
  { id: "research", label: "Research", icon: Lightbulb },
  { id: "terminal", label: "Terminal", icon: Terminal },
];

export default function FolderPage() {
  const params = useParams<{ id: string }>();
  const folderId = params?.id as string;
  const { folders, projects, chats, createChat, setActiveChat, addMessage, updateLastMessage, deleteChat, vault, settings } = useGodEye();

  const folder = folders.find(f => f.id === folderId) || null;
  const folderChats = useMemo(() => chats.filter(c => c.folderId === folderId), [chats, folderId]);
  const [activeChatId, setLocalChat] = useState<string | null>(null);
  const activeChat = folderChats.find(c => c.id === activeChatId) || folderChats[0] || null;

  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("chat");
  const [provider, setProvider] = useState<any>(settings.defaultProvider);
  const [model, setModel] = useState(PROVIDERS.find(p => p.id === settings.defaultProvider)?.models[0].id || "");
  const [files, setFiles] = useState<{ name: string; type: string; size: number; content: string; preview?: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  const subFolders = useMemo(() => folders.filter(f => f.parentId === folderId), [folders, folderId]);
  const folderProjects = useMemo(() => projects.filter(p => p.folderId === folderId), [projects, folderId]);

  const folderChain = useMemo(() => {
    if (!folder) return [] as any[];
    const chain: any[] = [];
    let cur: any = folder;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift(cur);
      cur = folders.find(f => f.id === cur.parentId);
    }
    return chain;
  }, [folder, folders]);

  const providerObj = PROVIDERS.find(p => p.id === provider);
  const modelList = modelsFor(providerObj, vault[provider as ProviderId]?.models);

  useEffect(() => {
    if (activeChat) {
      setMode(activeChat.mode);
      setProvider(activeChat.provider);
      setModel(activeChat.model);
    }
  }, [activeChatId, folderChats.length]);

  useEffect(() => {
    if (folder && folderChats.length === 0) {
      const id = createChat({ mode, provider, model, folderId });
      setLocalChat(id);
    }
  }, [folder?.id, folderChats.length]);

  useEffect(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight); }, [activeChat?.messages, running]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setShowModelMenu(false);
    }
    if (showModelMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showModelMenu]);

  if (!folder) {
    return (
      <div className="min-h-screen flex bg-background">
        <Sidebar />
        <main className="flex-1 grid place-items-center p-6">
          <div className="text-center">
            <div className="text-2xl font-semibold">Folder not found</div>
            <div className="text-sm text-muted-foreground mt-1">It may have been deleted.</div>
            <Link href="/dashboard" className="mt-4 inline-flex items-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm"><ArrowLeft className="h-4 w-4" /> Back to dashboard</Link>
          </div>
        </main>
      </div>
    );
  }

  function newChat() {
    const id = createChat({ mode, provider, model, folderId });
    setLocalChat(id);
    setFiles([]);
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files;
    if (!fl) return;
    const arr: any[] = [];
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

  async function send() {
    if (!input.trim() && files.length === 0) return;
    if (!activeChat) return;
    const chatId = activeChat.id;
    const userContent = input.trim();
    const attachments = files.length ? files.map(f => ({ name: f.name, type: f.type, size: f.size, preview: f.preview })) : undefined;

    addMessage(chatId, { id: Date.now().toString(), role: "user", content: userContent + (files.length ? `\n\n[Attached ${files.length} file(s): ${files.map(f => f.name).join(", ")}]` : ""), timestamp: new Date().toISOString(), attachments, mode, provider, model });
    setInput("");
    const sendFiles = [...files];
    setFiles([]);
    setRunning(true);

    const asstId = (Date.now() + 1).toString();
    addMessage(chatId, { id: asstId, role: "assistant", content: "", timestamp: new Date().toISOString(), mode, provider, model });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const referenceFiles = sendFiles.map(f => ({ name: f.name, content: f.content.slice(0, 15000), type: f.type }));
      const decryptedVault = await getDecryptedVaultForApi(vault as any);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...activeChat.messages, { role: "user", content: userContent }].map(m => ({ role: m.role, content: m.content })),
          provider, model, mode, referenceFiles, vault: decryptedVault, settings, stream: true
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error || "Chat failed");
      }

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
            if (data.delta) { full += data.delta; updateLastMessage(chatId, full); }
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
    } catch (e: any) {
      if (e.name === "AbortError") {
        updateLastMessage(chatId, (activeChat.messages[activeChat.messages.length - 1]?.content || "") + "\n\n_— stopped_");
      } else {
        updateLastMessage(chatId, `**Error:** ${e.message}\n\nCheck Providers Vault → connect ${provider} key.`);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stop() { abortRef.current?.abort(); }

  return (
    <div className="h-[100dvh] h-screen flex bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* folder header */}
        <div className="border-b bg-background/80 backdrop-blur shrink-0">
          <div className="px-4 md:px-6 pt-3 pb-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Dashboard</Link>
              {folderChain.slice(0, -1).map((f, i) => (
                <span key={f.id} className="inline-flex items-center gap-1.5">
                  <span>/</span>
                  <Link href={`/folders/${f.id}`} className="inline-flex items-center gap-1 hover:text-foreground"><FolderIcon className="h-3 w-3" style={{ color: f.color }} /> {f.name}</Link>
                </span>
              ))}
              <span>/</span>
              <span className="text-foreground font-medium flex items-center gap-1"><FolderIcon className="h-3 w-3" style={{ color: folder.color }} /> {folder.name}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="h-9 w-9 rounded-xl grid place-items-center shrink-0" style={{ background: folder.color }}><FolderIcon className="h-4 w-4 text-white" /></div>
              <div className="min-w-0">
                <div className="font-semibold text-sm md:text-base truncate">{folder.name}</div>
                <div className="text-xs text-muted-foreground truncate">{subFolders.length} subfolder{subFolders.length === 1 ? "" : "s"} • {folderProjects.length} project{folderProjects.length === 1 ? "" : "s"} • chats saved here</div>
              </div>
              <Link href="/dashboard" className="ml-auto inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs hover:bg-muted shrink-0"><FolderKanban className="h-3 w-3" /> Manage in dashboard</Link>
            </div>
          </div>
          {/* contents: subfolders + projects */}
          {(subFolders.length > 0 || folderProjects.length > 0) && (
            <div className="px-4 md:px-6 pb-3 flex flex-wrap gap-2">
              {subFolders.map(f => (
                <Link key={f.id} href={`/folders/${f.id}`} className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-3 py-1.5 text-xs hover:bg-muted">
                  <FolderIcon className="h-3.5 w-3.5" style={{ color: f.color }} /> {f.name}
                </Link>
              ))}
              {folderProjects.map(p => (
                <Link key={p.id} href={`/projects/${p.id}`} className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-3 py-1.5 text-xs hover:bg-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: p.color }} /> {p.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 flex min-h-0">
          {/* folder chat rail */}
          <aside className="hidden md:flex w-[240px] shrink-0 flex-col border-r bg-card/30">
            <div className="p-3 border-b flex items-center justify-between">
              <div className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Folder chats</div>
              <button onClick={newChat} className="inline-flex items-center gap-1 rounded-full bg-foreground text-background px-2.5 py-1 text-xs"><Plus className="h-3 w-3" /> New</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {folderChats.length === 0 && <div className="text-xs text-muted-foreground p-3">No chats yet — start one.</div>}
              {folderChats.map(c => (
                <div key={c.id} onClick={() => setLocalChat(c.id)} className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer ${activeChat?.id === c.id ? "bg-foreground text-background" : "hover:bg-muted"}`}>
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{c.title}</div>
                    <div className={`text-[11px] truncate ${activeChat?.id === c.id ? "opacity-70" : "text-muted-foreground"}`}>{c.mode} • {c.model.split("/").pop()}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deleteChat(c.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-black/10 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </aside>

          {/* chat main */}
          <section className="flex-1 min-w-0 flex flex-col">
            {/* mode pills + model picker */}
            <div className="h-14 border-b flex items-center gap-2 px-3 md:px-4 bg-background/80 backdrop-blur shrink-0">
              <div className="flex items-center gap-1 overflow-auto">
                {MODES.map(m => (
                  <button key={m.id} onClick={() => setMode(m.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap ${mode === m.id ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}>
                    <m.icon className="h-3 w-3" />{m.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2 shrink-0 relative" ref={modelMenuRef}>
                <span className="hidden sm:inline text-xs text-muted-foreground max-w-[180px] truncate">{providerObj?.name} / {model.split("/").pop()}</span>
                <button onClick={() => setShowModelMenu(!showModelMenu)} className="p-2 rounded-xl border bg-card hover:bg-muted shrink-0" title="Switch model"><ChevronDown className="h-4 w-4" /></button>
                {showModelMenu && (
                  <div className="absolute bottom-full right-0 mb-2 w-64 rounded-2xl border bg-card shadow-xl p-2 z-50">
                    <div className="text-[11px] text-muted-foreground px-2 py-1 font-medium">{providerObj?.name} models</div>
                    {modelList.map(m => (
                      <button key={m.id} onClick={() => { setModel(m.id); setShowModelMenu(false); }} className={`w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-muted ${model === m.id ? "bg-foreground text-background" : ""}`}>
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: providerObj?.color }} />
                        <span className="truncate">{m.name}</span>
                        <span className="ml-auto text-[10px] opacity-50">{m.context}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* messages */}
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4 overscroll-contain">
              {!activeChat || activeChat.messages.length === 0 ? (
                <div className="max-w-2xl mx-auto text-center py-16">
                  <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"><FolderIcon className="h-3 w-3" style={{ color: folder.color }} /> {folder.name} workspace</div>
                  <h2 className="mt-4 text-2xl font-semibold">Chat inside {folder.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">Every message is saved to this folder — keep all related work in one place.</p>
                </div>
              ) : activeChat.messages.map(m => (
                <div key={m.id} className={`max-w-3xl mx-auto flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`rounded-2xl px-4 py-3 text-sm max-w-[85%] ${m.role === "user" ? "bg-foreground text-background" : "bg-card border"}`}>
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {m.attachments.map(a => (
                          <span key={a.name} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs text-foreground border">
                            {a.type.startsWith("image/") && a.preview ? <img src={a.preview} alt={a.name} className="h-6 w-6 rounded object-cover" /> : <Paperclip className="h-3 w-3" />}
                            {a.name} <span className="opacity-60">{(a.size / 1024).toFixed(0)}KB</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap break-words">{m.content || (running && m.role === "assistant" ? "▊" : "")}</div>
                    {m.role === "assistant" && m.content && (
                      <button onClick={() => { navigator.clipboard.writeText(m.content); setCopied(m.id); setTimeout(() => setCopied(null), 1500); }} className="mt-2 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100">
                        {copied === m.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} copy
                      </button>
                    )}
                    <div className="mt-1 text-[11px] opacity-50">{new Date(m.timestamp).toLocaleTimeString()} {m.provider && `• ${m.provider}/${m.model?.split("/").pop()}`}</div>
                  </div>
                </div>
              ))}
              {running && <div className="max-w-3xl mx-auto text-xs text-muted-foreground flex gap-2"><span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse mt-1" /> GodEye is thinking — {provider}/{model} • {mode}</div>}
            </div>

            {/* composer */}
            <div className="border-t bg-card/50 p-3 md:p-4 shrink-0">
              {files.length > 0 && (
                <div className="max-w-3xl mx-auto mb-2 flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <span key={f.name + i} className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs">
                      {f.preview ? <img src={f.preview} alt={f.name} className="h-6 w-6 rounded object-cover" /> : <Paperclip className="h-3 w-3" />}
                      {f.name} <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="p-0.5 hover:bg-muted rounded-full"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="max-w-3xl mx-auto">
                <div className="rounded-2xl border bg-background p-2 shadow-sm">
                  <div className="flex items-end gap-2">
                    <button onClick={() => fileRef.current?.click()} className="p-2 rounded-xl hover:bg-muted shrink-0" title="Upload images/files"><Paperclip className="h-4 w-4" /></button>
                    <input ref={fileRef} type="file" multiple accept="image/*,.txt,.md,.json,.csv,.pdf" className="hidden" onChange={handleFiles} />
                    <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!running) send(); } }} placeholder={`Message ${folder.name} • ${mode} mode • Shift+Enter for newline`} rows={1} className="flex-1 min-w-0 bg-transparent outline-none text-sm resize-none py-2 max-h-32" />
                    <div className="flex items-center gap-1.5 shrink-0">
                      {running ? (
                        <button onClick={stop} className="inline-flex items-center gap-1.5 rounded-full bg-red-600 text-white px-3 sm:px-4 py-2 text-sm shrink-0"><Square className="h-3.5 w-3.5 fill-white" /><span className="hidden sm:inline">Stop</span></button>
                      ) : (
                        <button onClick={send} disabled={!input.trim() && files.length === 0} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 sm:px-4 py-2 text-sm disabled:opacity-40 shrink-0"><Send className="h-3.5 w-3.5" /><span className="hidden sm:inline">Send</span></button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="hidden sm:inline">Saved to this folder • Enter to send • Shift+Enter newline</span>
                  <span className="sm:hidden">Saved to this folder</span>
                  <button onClick={newChat} className="inline-flex items-center gap-1 hover:text-foreground"><Plus className="h-3 w-3" /> New chat</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}