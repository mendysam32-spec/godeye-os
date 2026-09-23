"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Bot, KeyRound, Settings, Sparkles, Eye, MessageSquare, Menu, X, Plus, ChevronRight, Folder as FolderIcon, Trash2, FolderKanban, Users as UsersIcon, LogOut } from "lucide-react";
import { useGodEye, type Folder, type Project } from "@/lib/store";
import { toast } from "@/components/toast";
import { useState } from "react";

const nav = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard", label: "Workforce", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/vault", label: "Providers", icon: KeyRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

const FOLDER_COLORS = ["#0a4d8c", "#8b5cf6", "#0d9488", "#db2777", "#e11d48", "#d97706", "#76b900"];

export function Sidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 border-b bg-card/80 backdrop-blur flex items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-foreground text-background grid place-items-center"><Eye className="h-4 w-4" /></div>
          <div><div className="text-sm font-semibold leading-none">GodEye</div></div>
        </Link>
        <button onClick={() => setOpen(!open)} className="p-2 rounded-xl border bg-background"><Menu className="h-5 w-5" /></button>
      </div>
      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-[280px] h-full bg-card border-r flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 flex items-center justify-between border-b">
              <div className="flex items-center gap-2 font-semibold"><Eye className="h-5 w-5" /> GodEye</div>
              <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavColumn onNavigate={() => setOpen(false)} />
            </div>
            <ProfileFooter />
          </div>
        </div>
      )}
      {/* Spacer for fixed mobile header */}
      <div className="md:hidden h-14 shrink-0" />
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[260px] shrink-0 flex-col border-r bg-card/50 backdrop-blur">
        <div className="p-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-foreground text-background grid place-items-center">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[15px] font-semibold tracking-tight leading-none">GodEye</div>
            </div>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <NavColumn />
        </div>
        <ProfileFooter />
      </aside>
    </>
  );
}

function ProfileFooter() {
  const { profile, currentUser } = useGodEye();
  const admin = currentUser?.role === "admin";
  return (
    <div className="p-4 border-t space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-sm font-medium">{(currentUser?.displayName || profile.name).slice(0, 2).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate flex items-center gap-1.5">
            {currentUser?.displayName || profile.name}
            {admin && <span className="text-[10px] rounded-full bg-foreground text-background px-1.5 py-0.5 leading-none">admin</span>}
          </div>
          <div className="text-xs text-muted-foreground truncate">{currentUser?.email || profile.email}</div>
        </div>
      </div>
      <button
        onClick={() => window.dispatchEvent(new Event("godeye:logout"))}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-medium text-muted-foreground hover:text-red-600 hover:border-red-200"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}

function NavColumn({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { folders, addFolder, removeFolder, currentUser, projects, chats, agents, vault } = useGodEye();
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s: Folder[] = useGodEye.getState().folders;
    return new Set(s.map(f => f.id));
  });
  const [adding, setAdding] = useState<string | null | false>(false);
  const [newName, setNewName] = useState("");

  const navItems = currentUser?.role === "admin"
    ? [...nav, { href: "/admin", label: "Users", icon: UsersIcon }]
    : nav;

  const rootFolders = folders.filter(f => !f.parentId);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startAdd(parentId: string | null) {
    setAdding(parentId);
    setNewName("");
    if (parentId) setExpanded(prev => new Set([...prev, parentId]));
  }

  function submitAdd() {
    if (!newName.trim()) return;
    const parentId = typeof adding === "string" ? adding : undefined;
    addFolder({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: newName.trim(),
      icon: "folder",
      color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length],
      parentId,
      createdAt: new Date().toISOString(),
    });
    if (parentId) setExpanded(prev => new Set([...prev, parentId]));
    setAdding(false);
    setNewName("");
    toast(`Folder “${newName.trim()}” created`);
  }

  function handleDelete(f: Folder) {
    if (!window.confirm(`Delete "${f.name}" and everything inside it? Projects will be moved out (kept safe).`)) return;
    removeFolder(f.id);
    toast(`Folder “${f.name}” deleted`, "info");
  }

  function openFolder(f: { id: string }) {
    setExpanded(prev => new Set([...prev, f.id]));
    onNavigate?.();
    router.push(`/folders/${f.id}`);
  }

  return (
    <div>
      <nav className="space-y-1">
        {navItems.map(n => {
          const active = pathname === n.href || pathname?.startsWith(n.href + "/");
          return (
            <Link key={n.href} href={n.href} onClick={onNavigate} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-foreground text-background" : "hover:bg-muted text-foreground/80"}`}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          );
        })}
      </nav>

      {/* Folders tree */}
      <div className="pt-4">
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Folders</span>
          <button onClick={() => startAdd(null)} title="New folder" className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        <div className="space-y-0.5">
          <Link href="/dashboard" onClick={onNavigate} className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] hover:bg-muted ${pathname === "/dashboard" && !pathname.includes("folder") ? "bg-muted" : ""}`}>
            <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" /> All projects
          </Link>
          {adding === null && (
            <AddInput name={newName} setName={setNewName} onCancel={() => setAdding(false)} onSubmit={submitAdd} depth={0} />
          )}
          {rootFolders.map(f => (
            <FolderTree key={f.id} folder={f} depth={0} expanded={expanded} toggle={toggle} adding={adding} newName={newName} setNewName={setNewName} startAdd={startAdd} cancelAdd={() => setAdding(false)} submitAdd={submitAdd} onDelete={handleDelete} openFolder={openFolder} pathname={pathname} onNavigate={onNavigate} />
          ))}
          {rootFolders.length === 0 && adding === false && (
            <button onClick={() => startAdd(null)} className="w-full text-left px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-muted rounded-xl flex items-center gap-2">
              <Plus className="h-3.5 w-3.5" /> New folder
            </button>
          )}
        </div>
      </div>

      <div className="pt-6">
        <div className="rounded-2xl bg-muted p-4">
          <div className="flex items-center gap-2 text-xs font-medium"><Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} /> Workspace live</div>
          {(() => {
            const connected = Object.values(vault || {}).filter((v: any) => v?.connected).length;
            const active = projects.filter((p) => p.status === "active").length;
            const total = Math.max(agents.length + projects.length + chats.length, 1);
            const pct = Math.min(100, Math.round(((agents.length + connected) / (total + 4)) * 100));
            return (<>
              <div className="mt-2 h-2 rounded-full bg-background overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">{connected} providers • {agents.length} agents • {active} active projects • {chats.length} chats</div>
            </>);
          })()}
        </div>
      </div>
    </div>
  );
}

function AddInput({ name, setName, onCancel, onSubmit, depth }: { name: string; setName: (v: string) => void; onCancel: () => void; onSubmit: () => void; depth: number }) {
  return (
    <div className="flex items-center gap-1" style={{ paddingLeft: 24 + depth * 14 }}>
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onSubmit(); if (e.key === "Escape") onCancel(); }}
        placeholder="Folder name..."
        className="w-full min-w-0 rounded-lg border bg-muted px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-foreground/10"
      />
      <button onClick={onSubmit} title="Create" className="p-1 rounded-md hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function ProjectRow({ p, depth, pathname, onNavigate }: { p: Project; depth: number; pathname: string | null; onNavigate?: () => void }) {
  const active = pathname === `/projects/${p.id}`;
  return (
    <Link href={`/projects/${p.id}`} onClick={onNavigate} className={`group flex items-center gap-2 rounded-xl py-1.5 pr-2 text-[13px] ${active ? "bg-muted" : "hover:bg-muted"}`} style={{ paddingLeft: 24 + depth * 14 }}>
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: p.color }} />
      <span className="truncate">{p.name}</span>
      <span className="ml-auto text-[10px] text-muted-foreground flex items-center shrink-0"><FolderKanban className="h-3 w-3" /></span>
    </Link>
  );
}

function FolderTree({ folder, depth, expanded, toggle, adding, newName, setNewName, startAdd, cancelAdd, submitAdd, onDelete, openFolder, pathname, onNavigate }:
  { folder: Folder; depth: number; expanded: Set<string>; toggle: (id: string) => void; adding: string | null | false; newName: string; setNewName: (v: string) => void; startAdd: (p: string | null) => void; cancelAdd: () => void; submitAdd: () => void; onDelete: (f: Folder) => void; openFolder: (f: { id: string }) => void; pathname: string | null; onNavigate?: () => void }) {
  const { folders, projects } = useGodEye();
  const children = folders.filter(f => f.parentId === folder.id);
  const projs = projects.filter(p => p.folderId === folder.id);
  const isOpen = expanded.has(folder.id);
  const items = children.length + projs.length;

  return (
    <div>
      <div className="group flex items-center gap-1 cursor-pointer rounded-xl py-1.5 pr-1.5 hover:bg-muted" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => openFolder({ id: folder.id })} title={folder.name}>
        <span onClick={e => { e.stopPropagation(); toggle(folder.id); }} title={isOpen ? "Collapse" : "Expand"} className="shrink-0 p-0.5 -ml-0.5 rounded hover:bg-black/10"><ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} /></span>
        <FolderIcon className="h-3.5 w-3.5 shrink-0" style={{ color: folder.color }} />
        <span className="flex-1 truncate text-[13px]">{folder.name}</span>
        <span className="text-[10px] text-muted-foreground shrink-0">{items > 0 && items}</span>
        <button onClick={e => { e.stopPropagation(); startAdd(folder.id); }} title="New subfolder" className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-black/10 shrink-0"><Plus className="h-3 w-3" /></button>
        <button onClick={e => { e.stopPropagation(); onDelete(folder); }} title="Delete folder" className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-100 text-muted-foreground hover:text-red-600 shrink-0"><Trash2 className="h-3 w-3" /></button>
      </div>
      {isOpen && (
        <div>
          {adding === folder.id && <AddInput name={newName} setName={setNewName} onCancel={cancelAdd} onSubmit={submitAdd} depth={depth + 1} />}
          {children.map(c => (
            <FolderTree key={c.id} folder={c} depth={depth + 1} expanded={expanded} toggle={toggle} adding={adding} newName={newName} setNewName={setNewName} startAdd={startAdd} cancelAdd={cancelAdd} submitAdd={submitAdd} onDelete={onDelete} openFolder={openFolder} pathname={pathname} onNavigate={onNavigate} />
          ))}
          {projs.map(p => <ProjectRow key={p.id} p={p} depth={depth + 1} pathname={pathname} onNavigate={onNavigate} />)}
          {items === 0 && adding !== folder.id && (
            <div className="text-[11px] text-muted-foreground" style={{ paddingLeft: 26 + depth * 14 }}>Empty folder</div>
          )}
        </div>
      )}
    </div>
  );
}