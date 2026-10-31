"use client";

/* Terminal executors — the MEDUSA bridge (Electron, your real PC) and the
 * cloud sandbox (Debian Durable Object container). Both speak the same event
 * stream so the terminal view never cares which one is live:
 *
 *   { kind: "chunk", stream: "stdout" | "stderr", text: string }
 *   { kind: "exit",  code: number }
 *   { kind: "error", message: string }
 */

import type { MEDUSADesktopBridge } from "@/lib/desktop";

export type RunEvent =
  | { kind: "chunk"; stream: "stdout" | "stderr"; text: string }
  | { kind: "exit"; code: number }
  | { kind: "error"; message: string };

export interface RunHandle {
  kill(): void;
  /** resolves when the process is finished (or killed/errored) */
  done: Promise<void>;
}

export interface RunOptions {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  onEvent: (ev: RunEvent) => void;
}

export type Backend = "desktop" | "cloud";

/* ------------------------------------------------------------------ */
/* Desktop (Electron bridge)                                          */
/* ------------------------------------------------------------------ */

const desktopListeners = new Map<string, { onEvent: (ev: RunEvent) => void; off: () => void }>();

function ensureDesktopListener(bridge: MEDUSADesktopBridge): void {
  if ((bridge as unknown as { __cmdListener?: boolean }).__cmdListener) return;
  (bridge as unknown as { __cmdListener?: boolean }).__cmdListener = true;
  bridge.onCommandData?.((ev: { id: string; stream: "stdout" | "stderr" | "exit"; text?: string; code?: number }) => {
    if (!ev?.id) return;
    const entry = desktopListeners.get(ev.id);
    if (!entry) return;
    if (ev.stream === "exit") {
      desktopListeners.delete(ev.id);
      if (desktopListeners.size === 0) entry.off();
      entry.onEvent({ kind: "exit", code: ev.code ?? 0 });
    } else {
      entry.onEvent({
        kind: "chunk",
        stream: ev.stream === "stderr" ? "stderr" : "stdout",
        text: ev.text ?? "",
      });
    }
  });
}

export function runDesktop(bridge: MEDUSADesktopBridge, opts: RunOptions): RunHandle {
  ensureDesktopListener(bridge);
  const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  let exitResolve: (() => void) | undefined;
  const done = new Promise<void>((r) => {
    exitResolve = r;
  });
  let exited = false;

  desktopListeners.set(id, {
    onEvent: (ev) => {
      if (ev.kind === "exit") {
        if (exited) return;
        exited = true;
        opts.onEvent(ev);
        exitResolve?.();
      } else {
        opts.onEvent(ev);
      }
    },
    off: () => bridge.offCommandData?.(),
  });

  const started = bridge.startCommand?.(id, {
    command: opts.command,
    cwd: opts.cwd,
    envNote: opts.env,
    timeoutMs: opts.timeoutMs,
  });
  if (started) {
    started.catch((e: unknown) => {
      if (exited) return;
      exited = true;
      desktopListeners.delete(id);
      opts.onEvent({ kind: "error", message: String((e as Error)?.message || e) });
      opts.onEvent({ kind: "exit", code: -1 });
      exitResolve?.();
    });
  }

  return {
    done,
    kill: () => {
      void bridge.killCommand?.(id);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Cloud sandbox (Debian container behind /api/terminal/exec)          */
/* ------------------------------------------------------------------ */

interface WireEvent {
  stream?: "stdout" | "stderr";
  text?: string;
  type?: string;
  code?: number;
  message?: string;
}

let cloudAbort: AbortController | null = null;

export function runCloud(opts: RunOptions): RunHandle {
  const controller = new AbortController();
  cloudAbort = controller;
  let exitResolve: (() => void) | undefined;
  const done = new Promise<void>((r) => {
    exitResolve = r;
  });
  let exited = false;

  void (async () => {
    try {
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: opts.command, cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs }),
        signal: controller.signal,
      });
      if (!res.ok && res.status !== 499) {
        const detail = (await res.json().catch(() => null)) as { message?: string; hint?: string; error?: string } | null;
        if (!exited) {
          opts.onEvent({ kind: "error", message: detail?.message || detail?.error || `Cloud terminal error (${res.status})` });
        }
        return;
      }
      if (!res.body) {
        if (!exited) opts.onEvent({ kind: "error", message: "Cloud terminal returned no stream" });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      for (;;) {
        const { done: rd, value } = await reader.read();
        if (rd) break;
        pending += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, nl);
          pending = pending.slice(nl + 1);
          if (!line.trim()) continue;
          let ev: WireEvent | null = null;
          try {
            ev = JSON.parse(line) as WireEvent;
          } catch {
            // not JSON — surface raw
            opts.onEvent({ kind: "chunk", stream: "stdout", text: `${line}\n` });
            continue;
          }
          if (!ev) continue;
          if (ev.type === "exit") {
            exited = true;
            opts.onEvent({ kind: "exit", code: ev.code ?? 0 });
          } else if (ev.type === "error") {
            if (!exited) opts.onEvent({ kind: "error", message: ev.message || "Unknown backend error" });
          } else if (ev.stream === "stdout" || ev.stream === "stderr") {
            opts.onEvent({
              kind: "chunk",
              stream: ev.stream,
              text: ev.text ?? "",
            });
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!exited && !/aborted/i.test(msg)) {
        opts.onEvent({ kind: "error", message: msg });
      }
    } finally {
      if (cloudAbort === controller) cloudAbort = null;
      if (!exited) {
        exited = true;
        opts.onEvent({ kind: "exit", code: 0 });
      }
      exitResolve?.();
    }
  })();

  return {
    done,
    kill: () => controller.abort(),
  };
}

/** Kill whatever cloud run is active (Ctrl+C from the status bar). */
export function killCloudRun(): void {
  cloudAbort?.abort();
}

/* ------------------------------------------------------------------ */

export function createRunner(backend: Backend, bridge: MEDUSADesktopBridge | null) {
  return (opts: RunOptions): RunHandle => (backend === "desktop" && bridge ? runDesktop(bridge, opts) : runCloud(opts));
}
