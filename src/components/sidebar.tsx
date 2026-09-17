"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Bot, KeyRound, Settings, Layers, Sparkles, Eye, MessageSquare, Menu, X } from "lucide-react";
import { useGodEye } from "@/lib/store";
import { useState } from "react";

const nav = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard", label: "Workforce", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/vault", label: "Providers", icon: KeyRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useGodEye();
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
            <nav className="p-3 flex-1 space-y-1">
              {nav.map(n => {
                const active = pathname === n.href || pathname?.startsWith(n.href + "/");
                return <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active ? "bg-foreground text-background" : "hover:bg-muted"}`}><n.icon className="h-4 w-4" />{n.label}</Link>;
              })}
            </nav>
            <div className="p-4 border-t">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-sm font-medium">{profile.name.slice(0,2).toUpperCase()}</div>
                <div className="min-w-0"><div className="text-sm font-medium truncate">{profile.name}</div><div className="text-xs text-muted-foreground truncate">{profile.email}</div></div>
              </div>
            </div>
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
        <nav className="px-3 flex-1 space-y-1">
          {nav.map((n) => {
            const active = pathname === n.href || pathname?.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-foreground text-background" : "hover:bg-muted text-foreground/80"}`}
              >
                <n.icon className="h-4 w-4" /> {n.label}
              </Link>
            );
          })}
          <div className="pt-6">
            <div className="rounded-2xl bg-muted p-4">
              <div className="flex items-center gap-2 text-xs font-medium"><Sparkles className="h-3.5 w-3.5" style={{color: 'var(--accent)'}}/> Workforce credits</div>
              <div className="mt-2 h-2 rounded-full bg-background overflow-hidden">
                <div className="h-full w-[68%]" style={{background: 'var(--accent)'}}/>
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">6,820 / 10,000 actions</div>
            </div>
          </div>
        </nav>
        <div className="p-4 border-t">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-sm font-medium">
              {profile.name.slice(0,2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{profile.name}</div>
              <div className="text-xs text-muted-foreground truncate">{profile.email}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
