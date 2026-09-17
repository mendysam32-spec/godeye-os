"use client";
import { useState, useRef, useEffect } from "react";
import { useGodEye, type ChatMode } from "@/lib/store";
import { PROVIDERS } from "@/lib/providers";
import { Sidebar } from "@/components/sidebar";
import { Send, Square, Plus, Paperclip, X, Copy, Check, Terminal, Code2, Image as ImageIcon, Search, ListTree, MessageSquare, Lightbulb, Trash2, ChevronDown } from "lucide-react";
import Link from "next/link";

const MODES: { id: ChatMode; label: string; icon: any; desc: string }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, desc: "General" },
  { id: "coding", label: "Coding", icon: Code2, desc: "Build code" },
  { id: "image", label: "Image", icon: ImageIcon, desc: "Generate images" },
  { id: "plan", label: "Plan", icon: ListTree, desc: "Break into steps" },
  { id: "search", label: "Search", icon: Search, desc: "Research" },
  { id: "research", label: "Research", icon: Lightbulb, desc: "Deep dive" },
  { id: "terminal", label: "Terminal", icon: Terminal, desc: "Commands" },
];

export default function ChatPage() {
  const { chats, activeChatId, createChat, setActiveChat, addMessage, updateLastMessage, deleteChat, vault, settings } = useGodEye();
  const activeChat = chats.find(c => c.id === activeChatId) || null;

  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>(activeChat?.mode || "chat");
  const [provider, setProvider] = useState(activeChat?.provider || settings.defaultProvider);
  const [model, setModel] = useState(activeChat?.model || PROVIDERS.find(p=>p.id===settings.defaultProvider)?.models[0].id || "anthropic/claude-3.5-sonnet");
  const [files, setFiles] = useState<{ name: string; type: string; size: number; content: string; preview?: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!activeChatId && chats.length === 0) {
      const id = createChat({ mode, provider, model });
      setActiveChat(id);
    } else if (activeChat) {
      setMode(activeChat.mode);
      setProvider(activeChat.provider);
      setModel(activeChat.model);
    }
  }, [activeChatId]);

  useEffect(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight); }, [activeChat?.messages, running]);

  function newChat() {
    const id = createChat({ mode, provider, model });
    setFiles([]);
    setLogs([`[${new Date().toLocaleTimeString()}] new chat ${id}`]);
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

    addMessage(chatId, { id: Date.now().toString(), role: "user", content: userContent + (files.length ? `\n\n[Attached ${files.length} file(s): ${files.map(f=>f.name).join(", ")}]` : ""), timestamp: new Date().toISOString(), attachments, mode, provider, model });
    setInput("");
    const sendFiles = [...files];
    setFiles([]);
    setRunning(true);
    setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] → ${provider}/${model} [${mode}] ${userContent.slice(0,80)}`]);

    // optimistic assistant placeholder
    const asstId = (Date.now()+1).toString();
    addMessage(chatId, { id: asstId, role: "assistant", content: "", timestamp: new Date().toISOString(), mode, provider, model });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const referenceFiles = sendFiles.map(f => ({ name: f.name, content: f.content.slice(0, 15000), type: f.type }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...activeChat.messages, { role: "user", content: userContent }].map(m => ({ role: m.role, content: m.content })),
          provider, model, mode, referenceFiles, vault, settings, stream: true
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error || "Chat failed");
      }

      // stream SSE
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
              setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] ✓ ${data.latencyMs ? (data.latencyMs/1000).toFixed(1)+"s" : ""} ${data.usage ? data.usage.total_tokens+" tokens" : ""}`]);
            }
          }
        }
        if (!full) {
          // fallback: if stream empty, try json
          const txt = await res.text();
          try { const j = JSON.parse(txt); if (j.content) { full = j.content; updateLastMessage(chatId, full); } } catch {}
        }
      } else {
        const j = await res.json();
        updateLastMessage(chatId, j.content || "");
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] ■ stopped by user`]);
        updateLastMessage(chatId, (activeChat.messages[activeChat.messages.length-1]?.content || "") + "\n\n_— stopped_");
      } else {
        updateLastMessage(chatId, `**Error:** ${e.message}\n\nCheck Providers Vault → connect ${provider} key.`);
        setLogs(l => [...l, `[${new Date().toLocaleTimeString()}] ✗ ${e.message}`]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  const providerObj = PROVIDERS.find(p => p.id === provider);
  const modelList = providerObj?.models || [];

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      {/* chats list */}
      <aside className="hidden lg:flex w-[280px] border-r bg-card/30 flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="font-semibold text-sm">Chats</div>
          <button onClick={newChat} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-3 py-1.5 text-xs"><Plus className="h-3.5 w-3.5"/> New chat</button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {chats.length === 0 && <div className="text-xs text-muted-foreground p-3">No chats yet. Start one.</div>}
          {chats.map(c => (
            <div key={c.id} onClick={()=>setActiveChat(c.id)} className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer ${activeChatId===c.id ? "bg-foreground text-background" : "hover:bg-muted"}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate font-medium">{c.title}</div>
                <div className={`text-xs truncate ${activeChatId===c.id ? "opacity-70" : "text-muted-foreground"}`}>{c.mode} • {c.provider}/{c.model.split("/").pop()}</div>
              </div>
              <button onClick={(e)=>{e.stopPropagation(); deleteChat(c.id);}} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-black/10 rounded"><Trash2 className="h-3.5 w-3.5"/></button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t">
          <button onClick={()=>setShowTerminal(!showTerminal)} className="w-full flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs">
            <Terminal className="h-3.5 w-3.5"/> {showTerminal ? "Hide terminal" : "Show terminal"}
          </button>
          {showTerminal && <div className="mt-2 rounded-xl bg-black text-green-400 font-mono text-[11px] p-2 h-32 overflow-auto whitespace-pre-wrap">{logs.join("\n") || "— terminal idle —"}</div>}
        </div>
      </aside>

      {/* main chat */}
      <main className="flex-1 flex flex-col min-w-0 bg-background">
        {/* header */}
        <div className="h-14 border-b flex items-center gap-2 px-3 md:px-4 bg-background/80 backdrop-blur shrink-0">
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
              <select value={provider} onChange={e=>{ const pid=e.target.value as any; const prov=PROVIDERS.find(p=>p.id===pid); setProvider(pid); if(prov?.models[0]) setModel(prov.models[0].id); }} className="bg-transparent text-xs outline-none">
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
        <div ref={listRef} className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
          {!activeChat || activeChat.messages.length===0 ? (
            <div className="max-w-2xl mx-auto text-center py-16">
              <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"><span className="h-2 w-2 rounded-full bg-emerald-500"/> GodEye OS • {mode} mode • {providerObj?.name}</div>
              <h2 className="mt-4 text-2xl font-semibold">What should GodEye do?</h2>
              <p className="text-sm text-muted-foreground mt-1">Pick a mode, attach files as reference, change model anytime — like Codex.</p>
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-2 text-left">
                {[
                  { label: "Build a component", mode: "coding" },
                  { label: "Plan my launch", mode: "plan" },
                  { label: "Research competitors", mode: "search" },
                  { label: "Generate hero image prompt", mode: "image" },
                ].map(c=>(
                  <button key={c.label} onClick={()=>{ setMode(c.mode as any); setInput(c.label); }} className="rounded-2xl border bg-card p-3 text-sm hover:bg-muted text-left">{c.label}<div className="text-xs text-muted-foreground">{c.mode}</div></button>
                ))}
              </div>
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
                {m.role==="assistant" && m.content && (
                  <button onClick={()=>{ navigator.clipboard.writeText(m.content); setCopied(m.id); setTimeout(()=>setCopied(null),1500); }} className="mt-2 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100">
                    {copied===m.id ? <Check className="h-3 w-3"/> : <Copy className="h-3 w-3"/>} copy
                  </button>
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
            <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm">
              <button onClick={()=>fileRef.current?.click()} className="p-2 rounded-xl hover:bg-muted shrink-0" title="Upload images/files"><Paperclip className="h-4 w-4"/></button>
              <input ref={fileRef} type="file" multiple accept="image/*,.txt,.md,.json,.csv,.pdf" className="hidden" onChange={handleFiles}/>
              <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); if(!running) send(); }}} placeholder={`Message • ${mode} mode • Shift+Enter for newline`} rows={1} className="flex-1 bg-transparent outline-none text-sm resize-none py-2 max-h-32"/>
              <div className="flex items-center gap-1 shrink-0">
                <div className="hidden md:flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-xs">
                  <span style={{color: providerObj?.color}}>●</span> {model.split("/").pop()}
                  <ChevronDown className="h-3 w-3"/>
                </div>
                {running ? (
                  <button onClick={stop} className="inline-flex items-center gap-1.5 rounded-full bg-red-600 text-white px-4 py-2 text-sm"><Square className="h-3.5 w-3.5 fill-white"/> Stop</button>
                ) : (
                  <button onClick={send} disabled={!input.trim() && files.length===0} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-2 text-sm disabled:opacity-40"><Send className="h-3.5 w-3.5"/> Send</button>
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Enter to send • Shift+Enter newline • Upload files as reference • Mode sets behavior</span>
              <button onClick={newChat} className="inline-flex items-center gap-1 hover:text-foreground"><Plus className="h-3 w-3"/> New chat</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
