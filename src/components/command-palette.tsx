"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, LayoutDashboard, Bot, KeyRound, Settings, Plus, Folder as FolderIcon, FolderKanban, Search, Users as UsersIcon } from "lucide-react";
import { useGodEye } from "@/lib/store";

interface Item {
  id: string;
  section: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { chats, setActiveChat, createChat, projects, folders, currentUser, settings } = useGodEye();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
        setIdx(0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open ]);

  const items: Item[] = useMemo(() => {
    const list: Item[] = [
      { id: "nav-chat", section: "Go to", label: "Chat", hint: "/chat", run: () => router.push("/chat") },
      { id: "nav-dash", section: "Go to", label: "Workforce dashboard", hint: "/dashboard", run: () => router.push("/dashboard") },
      { id: "nav-agents", section: "Go to", label: "Agents", hint: "/agents", run: () => router.push("/agents") },
      { id: "nav-vault", section: "Go to", label: "Providers vault", hint: "/vault", run: () => router.push("/vault") },
      { id: "nav-settings", section: "Go to", label: "Settings", hint: "/settings", run: () => router.push("/settings") },
      { id: "act-newchat", section: "Actions", label: "New chat", hint: "create", run: () => { createChat({ provider: settings.defaultProvider }); router.push("/chat"); } },
      { id: "act-newproj", section: "Actions", label: "New project…", hint: "dashboard", run: () => router.push("/dashboard") },
    ];
    if (currentUser?.role === "admin") {
      list.push({ id: "nav-admin", section: "Go to", label: "Users (admin)", hint: "/admin", run: () => router.push("/admin") });
    }
    for (const c of chats.slice(0, 20)) {
      list.push({ id: `chat-${c.id}`, section: "Chats", label: c.title || "Untitled chat", hint: `${c.mode} • ${c.model.split("/").pop()}`, run: () => { setActiveChat(c.id); router.push("/chat"); } });
    }
    for (const p of projects.slice(0, 20)) {
      list.push({ id: `proj-${p.id}`, section: "Projects", label: p.name, hint: p.status, run: () => router.push(`/projects/${p.id}`) });
    }
    for (const f of folders.slice(0, 20)) {
      list.push({ id: `fold-${f.id}`, section: "Folders", label: f.name, hint: "folder", run: () => router.push(`/folders/${f.id}`) });
    }
    return list;
  }, [chats, projects, folders, currentUser, settings, router, createChat, setActiveChat]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 40);
    return items.filter((it) => `${it.section} ${it.label} ${it.hint || ""}`.toLowerCase().includes(needle)).slice(0, 40);
  }, [items, q]);

  useEffect(() => setIdx(0), [q]);

  if (!open) return null;

  const icons: Record<string, typeof Search> = {
    "Go to": Search,
    Actions: Plus,
    Chats: MessageSquare,
    Projects: FolderKanban,
    Folders: FolderIcon,
  };

  let lastSection = "";
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm p-4 grid justify-items-center items-start pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg rounded-2xl border bg-card shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((v) => Math.min(v + 1, filtered.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((v) => Math.max(v - 1, 0)); }
              if (e.key === "Enter") { e.preventDefault(); filtered[idx]?.run(); setOpen(false); }
            }}
            placeholder="Type a command or search…  (Esc to close)"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <kbd className="text-[10px] rounded border bg-muted px-1.5 py-0.5 text-muted-foreground">Ctrl K</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No matches for “{q}”</div>}
          {filtered.map((it, i) => {
            const showHead = it.section !== lastSection;
            lastSection = it.section;
            const Icon = icons[it.section] || Search;
            return (
              <div key={it.id}>
                {showHead && <div className="px-2.5 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{it.section}</div>}
                <button
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => { it.run(); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm ${i === idx ? "bg-foreground text-background" : "hover:bg-muted"}`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate flex-1">{it.label}</span>
                  {it.hint && <span className={`text-[11px] truncate max-w-[40%] ${i === idx ? "opacity-70" : "text-muted-foreground"}`}>{it.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="border-t px-4 py-2 text-[11px] text-muted-foreground flex gap-3">
          <span>↑↓ navigate</span><span>↵ open</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
}

// Unused re-export guard for tree-shaking clarity
export const _paletteIcons = { MessageSquare, LayoutDashboard, Bot, KeyRound, Settings, UsersIcon };
