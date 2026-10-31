"use client";

import { Sidebar } from "@/components/sidebar";
import { TerminalView } from "@/components/terminal/terminal-view";

export default function TerminalPage() {
  return (
    <div className="h-[100dvh] h-screen flex bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Header — matches the other pages' sticky bars */}
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur px-6 h-16 flex items-center shrink-0">
          <div>
            <div className="font-semibold">Terminal</div>
            <div className="text-xs text-muted-foreground">
              opencode-style agent terminal — EXEC / AGENT / ASK, self-installing tools, any model, any device
            </div>
          </div>
        </div>
        {/* The terminal fills everything below the header */}
        <div className="flex-1 min-h-0 p-4 md:p-6 safe-x safe-bottom">
          <TerminalView />
        </div>
      </main>
    </div>
  );
}
