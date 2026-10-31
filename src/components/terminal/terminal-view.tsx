"use client";

/**
 * MEDUSA OS terminal view — an opencode-style power terminal.
 *
 * Two live backends behind one interface:
 *   • desktop — the MEDUSA desktop app: real shell sessions on your PC (files,
 *     long runs, Ctrl+C), streamed over the window.medusa bridge.
 *   • cloud   — a Debian container in a Cloudflare Durable Object, one per
 *     user, reachable from any device (streams over /api/terminal/exec).
 *
 * opencode-inspired affordances: mode toggle (EXEC / ASK, Alt+M), `?` asks the
 * AI from the shell prompt, `!` force-runs while in ASK mode, slash commands,
 * ↑/↓ history, Tab completion, ANSI colors, run timing + exit codes, and
 * Run/Insert chips on every AI answer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS, modelsFor, type ProviderId, type ProviderModel } from "@/lib/providers";
import { useMEDUSA } from "@/lib/store";
import { isDesktop, desktopBridge, type MEDUSADesktopBridge } from "@/lib/desktop";
import { getDecryptedVaultForApi } from "@/lib/vault-crypto";
import { createRunner, killCloudRun, type Backend, type RunEvent, type RunHandle } from "@/lib/terminal/engine";
import { LineBuffer, textOf, type TerminalLine } from "@/lib/terminal/lines";
import { tokenizeAnsi, type AnsiRun } from "@/lib/terminal/ansi";
import {
  Zap,
  MessageCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Terminal as TerminalIcon,
  KeyRound,
  CircleDot,
} from "lucide-react";

const HISTORY_KEY = "medusa:terminal:history";
const CWD_KEY = "medusa:terminal:cwd";
const MAX_HISTORY = 80;

const HELP_TEXT = [
  "MEDUSA OS terminal — opencode-style power terminal",
  "  modes    EXEC runs commands · ASK sends input to the AI · Alt+M or /mode toggles",
  "  ?text    ask the AI anything (context: recent transcript + cwd)",
  "  !cmd     run a command while in ASK mode",
  "  ↑/↓      history · Tab completes · Ctrl+C kills the current run · Ctrl+L clears",
  "  slash    /help /clear /history /mode /models /model <id> /provider <id> /ask <q> /status",
].join("\n");

function shortPath(p: string): string {
  if (!p) return "~";
  const parts = p.replace(/[\\/]+$/, "").split(/[\\/]/);
  if (parts.length <= 3) return p;
  return `…${parts.slice(-2).join("\\")}`;
}

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;
}

/** Renders one line's ANSI tokens as styled spans. */
function Segmented({ runs }: { runs: AnsiRun[] }) {
  if (!runs.length) return null;
  return (
    <>
      {runs.map((r, i) => {
        const style: React.CSSProperties = { color: r.fg ?? "var(--term-fg)" };
        if (r.bg) style.background = r.bg;
        if (r.invert) {
          style.background = "var(--term-fg)";
          style.color = "var(--term-bg)";
        }
        if (style.background) style.borderRadius = 2;
        if (r.bold) style.fontWeight = 600;
        if (r.dim) style.opacity = 0.6;
        if (r.italic) style.fontStyle = "italic";
        if (r.underline) style.textDecoration = "underline";
        return (
          <span key={i} style={style} className="whitespace-pre-wrap">
            {r.text}
          </span>
        );
      })}
    </>
  );
}

const KIND_COLOR: Record<TerminalLine["kind"], string> = {
  out: "#dfe4ee",
  err: "#ff8b94",
  sys: "#8b93a7",
  echo: "#9ad0ff",
  ai: "#d8b4fe",
};

export function TerminalView() {
  const store = useMEDUSA() as unknown as {
    currentUser?: { displayName?: string };
    profile?: { name?: string };
    vault: Record<string, { key?: string; models?: unknown[]; connected?: boolean }>;
    settings: { defaultProvider?: string; reasoningEffort?: "off" | "low" | "medium" | "high" | "extra-high" };
  };
  const { vault, settings } = store;

  /* ---------------- state ---------------- */
  const [backend, setBackend] = useState<Backend>(isDesktop() ? "desktop" : "cloud");
  const [cloudOk, setCloudOk] = useState<boolean | null>(null);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"exec" | "ask">("exec");
  const [cwd, setCwd] = useState("");
  const [provider, setProvider] = useState<ProviderId>((settings.defaultProvider || "openrouter") as ProviderId);
  const [modelOverride, setModel] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const [lastExit, setLastExit] = useState<{ code: number; ms: number } | null>(null);

  const bufRef = useRef<LineBuffer>(new LineBuffer("out"));
  const outRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<RunHandle | null>(null);
  const modeRef = useRef<"exec" | "ask">("exec");
  const finishRef = useRef<(code: number, startedAt: number) => void>(() => undefined);
  const bridge: MEDUSADesktopBridge | null = desktopBridge();

  const modelList: ProviderModel[] = useMemo(
    () => modelsFor(PROVIDERS.find((p) => p.id === provider), vault[provider]?.models as never),
    [provider, vault],
  );
  /** Current model — derived so it follows the provider's list by default,
   *  while /model <id> or manual picks take precedence via the override. */
  const model = modelOverride ?? modelList[0]?.id ?? "";

  /* ---------------- paint ---------------- */
  const repaint = useCallback(() => setLines(bufRef.current.snapshot()), []);
  const push = useCallback(
    (text: string, kind: TerminalLine["kind"], chips?: { command: string; label: string }[]) => {
      bufRef.current.push(text, kind, chips);
      repaint();
    },
    [repaint],
  );

  /* ---------------- init ---------------- */
  // Deferred one tick so the first paint matches SSR (no hydration
  // mismatch) and hydration lands as an async external-system update.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const h = localStorage.getItem(HISTORY_KEY);
        if (h) setHistory((JSON.parse(h) as string[]).slice(-MAX_HISTORY));
        const c = localStorage.getItem(CWD_KEY);
        if (c) setCwd(c);
      } catch {
        /* fresh session */
      }
      bufRef.current.push(HELP_TEXT, "sys");
      bufRef.current.flush();
      repaint();
    }, 0);
    return () => window.clearTimeout(t);
  }, [repaint]);

  useEffect(() => {
    void fetch("/api/terminal/exec", { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { backend?: string } | null) => setCloudOk(j?.backend === "cloud"))
      .catch(() => setCloudOk(false));
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  /* ---------------- run completion ---------------- */
  const commitExit = useCallback(
    (code: number, startedAt: number) => {
      bufRef.current.flush();
      setRunning(false);
      activeRef.current = null;
      setLastExit({ code, ms: Date.now() - startedAt });
      push(`─ exit ${code} ${code !== 0 ? "⚠" : "✓"} · ${fmtMs(Date.now() - startedAt)}`, "sys");
      inputRef.current?.focus();
    },
    [push],
  );
  useEffect(() => {
    finishRef.current = commitExit;
  }, [commitExit]);

  const runEvent = (startedAt: number, ev: RunEvent): void => {
    if (ev.kind === "chunk") {
      bufRef.current.append(ev.text, ev.stream === "stderr" ? "err" : "out");
      repaint();
    } else if (ev.kind === "error") {
      bufRef.current.append(`\n✗ ${ev.message}\n`, "sys");
      repaint();
    } else if (ev.kind === "exit") {
      finishRef.current(ev.code, startedAt);
    }
  };

  const startRun = (command: string): void => {
    const startedAt = Date.now();
    setRunning(true);
    const runner = createRunner(backend, bridge);
    const handle = runner({
      command,
      cwd: cwd || undefined,
      onEvent: (ev) => runEvent(startedAt, ev),
    });
    activeRef.current = handle;
    void handle.done.finally(() => {
      if (activeRef.current === handle) {
        setRunning(false);
        activeRef.current = null;
      }
    });
  };

  /* ---------------- AI (declared before execute — execute references it) ---- */
  const askAi = useCallback(
    async (question: string): Promise<void> => {
      const startedAt = Date.now();
      setRunning(true);
      push(`▲ ai — ${question}`, "ai");
      try {
        const decryptedVault = await getDecryptedVaultForApi(vault as never);
        const res = await fetch("/api/terminal/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            cwd: cwd || undefined,
            backend,
            platform: backend === "desktop" ? navigator.platform || "unknown" : "linux-cloud",
            provider,
            model: model || undefined,
            vault: decryptedVault,
            transcript: textOf(bufRef.current.snapshot()).slice(-30),
            reasoningEffort: settings.reasoningEffort,
          }),
        });
        const data = (await res.json().catch(() => null)) as { reply?: string; commands?: string[]; error?: string } | null;
        bufRef.current.flush();
        if (!res.ok || data?.error || !data?.reply) {
          push(`✗ ${data?.error || `AI error (${res.status})`}`, "err");
        } else {
          bufRef.current.append(data.reply, "ai");
          bufRef.current.flush();
          const chips = (data.commands || []).map((c) => ({ command: c, label: c.length > 52 ? `${c.slice(0, 52)}…` : c }));
          if (chips.length) push("", "out", chips);
        }
      } catch (e) {
        push(`✗ ask failed: ${String((e as Error).message || e)}`, "err");
      } finally {
        push(`  (${provider}/${model || "—"} · ${fmtMs(Date.now() - startedAt)})`, "sys");
        setRunning(false);
        inputRef.current?.focus();
      }
    },
    [backend, cwd, model, provider, push, settings.reasoningEffort, vault],
  );

  /* ---------------- builtins ---------------- */
  const slashCommands = useMemo(
    () => ["/help", "/clear", "/history", "/mode", "/models", "/model", "/provider", "/ask", "/status"],
    [],
  );

  const persistHistory = (cmd: string) => {
    setHistory((prev) => {
      const next = [...prev.filter((h) => h !== cmd), cmd].slice(-MAX_HISTORY);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* storage full */
      }
      return next;
    });
  };

  const execute = useCallback(
    (raw: string): void => {
      const trimmed = raw.trim();
      bufRef.current.flush();
      if (!trimmed) return;
      push(`${shortPath(cwd)} ${trimmed}`, "echo");
      persistHistory(trimmed);

      if (trimmed.startsWith("/")) {
        const [cmd, ...rest] = trimmed.slice(1).split(" ");
        const arg = rest.join(" ").trim();
        switch (cmd) {
          case "help":
            push(HELP_TEXT, "sys");
            return;
          case "clear":
            bufRef.current.clear();
            repaint();
            return;
          case "history":
            push(history.map((h, i) => `${String(i + 1).padStart(3)}  ${h}`).join("\n") || "(empty)", "out");
            return;
          case "mode": {
            const next = mode === "exec" ? "ask" : "exec";
            setMode(next);
            push(`mode → ${next}${next === "exec" ? " (shell runs)" : " (AI answers)"}`, "sys");
            return;
          }
          case "models":
            push(modelList.map((m) => `${m.id}${m.id === model ? "  ←" : ""}`).join("\n") || "(no models)", "out");
            return;
          case "model": {
            if (!arg) {
              push(`current model: ${model || "(none)"} — usage: /model <id>`, "sys");
              return;
            }
            const found = modelList.find(
              (m) => m.id.toLowerCase() === arg.toLowerCase() || m.id.toLowerCase().includes(arg.toLowerCase()),
            );
            if (found) {
              setModel(found.id);
              push(`model → ${found.id}`, "sys");
            } else {
              push(`model not found: ${arg}`, "err");
            }
            return;
          }
          case "provider": {
            if (!arg) {
              push(`current provider: ${provider} — usage: /provider <${PROVIDERS.map((p) => p.id).join("|")}>`, "sys");
              return;
            }
            const p = PROVIDERS.find((x) => x.id === (arg.toLowerCase() as ProviderId));
            if (p) {
              setProvider(p.id);
              setModel(null); // let the new provider's first model take over
              push(`provider → ${p.id}`, "sys");
            } else {
              push(`unknown provider: ${arg}`, "err");
            }
            return;
          }
          case "ask":
            void askAi(arg || trimmed);
            return;
          case "status":
            push(
              [
                `backend:  ${backend}${backend === "desktop" ? " (bridge active — your PC)" : " (Debian sandbox, per-user)"}`,
                `cloud:    ${cloudOk === null ? "checking…" : cloudOk ? "configured" : "not configured — deploy workers/terminal"}`,
                `model:    ${provider} / ${model || "(none)"}`,
                `cwd:      ${cwd || "(session root)"}`,
                `mode:     ${mode}${running ? " · running…" : ""}`,
                lastExit ? `last run: exit ${lastExit.code} · ${fmtMs(lastExit.ms)}` : "last run: —",
              ].join("\n"),
              "sys",
            );
            return;
          default:
            push(`unknown command: /${cmd} — try /help`, "sys");
            return;
        }
      }

      if (trimmed === "clear") {
        bufRef.current.clear();
        repaint();
        return;
      }
      if (trimmed === "help" || trimmed === "?") {
        push(HELP_TEXT, "sys");
        return;
      }

      // Desktop sessions: intercept `cd` and resolve through the bridge so the
      // prompt — and every following command's working directory — is real.
      if (backend === "desktop" && /^\s*cd(\s|$)/.test(trimmed)) {
        const target = trimmed.slice(2).trim().replace(/^"(.*)"$/, "$1");
        void bridge
          ?.cwdResolve?.({ cwd: cwd || undefined, target })
          .then((r) => {
            if (r?.ok && r.cwd) {
              setCwd(r.cwd);
              try {
                localStorage.setItem(CWD_KEY, r.cwd);
              } catch {
                /* ignore */
              }
              push(r.cwd, "sys");
            } else {
              push(r?.error || "cd failed", "err");
            }
          })
          .catch(() => push("cd failed (bridge missing)", "err"));
        return;
      }

      startRun(trimmed);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [askAi, backend, bridge, cloudOk, cwd, history, lastExit, mode, model, modelList, provider, push, repaint, running, vault],
  );

  /* ---------------- submit + keyboard ---------------- */
  const submit = (raw: string): void => {
    const v = raw.trim();
    if (!v) return;
    setInput("");

    if (v.startsWith("!")) {
      const cmd = v.slice(1).trim();
      if (!cmd) return;
      persistHistory(cmd);
      startRun(cmd);
      return;
    }
    if (v.startsWith("?")) {
      const q = v.slice(1).trim();
      if (!q) return;
      push(`${shortPath(cwd)} ?${q}`, "echo");
      void askAi(q);
      return;
    }
    if (v.startsWith("/")) {
      execute(v);
      return;
    }
    if (modeRef.current === "exec") {
      execute(v);
    } else {
      push(`${shortPath(cwd)} ${v}`, "echo");
      void askAi(v);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (running) {
        // runs are killed via Ctrl+C — never double-launch
        return;
      }
      submit(input);
      return;
    }
    if (e.altKey && (e.key === "m" || e.key === "M")) {
      e.preventDefault();
      const next = mode === "exec" ? "ask" : "exec";
      setMode(next);
      push(`mode → ${next}${next === "exec" ? " (shell runs)" : " (AI answers)"}`, "sys");
      return;
    }
    if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      if (running) {
        activeRef.current?.kill();
        if (backend === "cloud") killCloudRun();
        push("^C", "echo");
        bufRef.current.flush();
        repaint();
      } else {
        setInput("");
      }
      return;
    }
    if (e.ctrlKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      bufRef.current.clear();
      repaint();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const idx = histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setInput(history[idx] ?? input);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === null) return;
      const idx = histIdx + 1;
      if (idx >= history.length) {
        setHistIdx(null);
        setInput("");
      } else {
        setHistIdx(idx);
        setInput(history[idx]);
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const v = input.trim();
      const pool: string[] = [...(v.startsWith("/") ? slashCommands : []), ...history];
      const match = pool.find((c) => c.startsWith(v) && c !== v);
      if (match) setInput(match);
    }
  };

  /* ---------------- scroll follow ---------------- */
  useEffect(() => {
    if (follow && outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [lines, follow]);

  /* ---------------- render ---------------- */
  const promptUser = (store.currentUser?.displayName || store.profile?.name || "medusa").split(" ")[0].toLowerCase();
  const modelOptions: { id: string }[] = modelList.length ? modelList : [{ id: model || "no-models" }];

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl shadow-inner"
      style={
        {
          background: "#0b0e15",
          border: "1px solid #1e2331",
          color: "var(--term-fg)",
          "--term-bg": "#0b0e15",
          "--term-fg": "#dfe4ee",
        } as React.CSSProperties
      }
    >
      {/* status header */}
      <div
        className="flex flex-wrap items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: "#1e2331", background: "#0e111a" }}
      >
        <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
          <TerminalIcon className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
          MEDUSA terminal
        </div>
        <button
          type="button"
          title="Backend: the MEDUSA desktop app where installed, else the cloud sandbox"
          onClick={() => {
            const nextB: Backend = backend === "desktop" ? "cloud" : "desktop";
            setBackend(nextB);
            push(`backend → ${nextB === "desktop" ? "desktop (your PC)" : "cloud (Debian sandbox)"}`, "sys");
          }}
          className="rounded-full border px-2 py-0.5 text-[11px] transition hover:brightness-125"
          style={{ borderColor: "#242b3d", color: "#9fb0cf", background: "#101828" }}
        >
          {backend === "desktop" ? "desktop — your PC" : "cloud — Debian sandbox"}
        </button>
        <span
          className="rounded-full border px-2 py-0.5 text-[11px]"
          style={{ borderColor: "#242b3d", color: cloudOk ? "#6cf79a" : "#fbbf24", background: "#0e111a" }}
        >
          {cloudOk === null ? "checking cloud…" : cloudOk ? "cloud ready" : "cloud off — /status"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <select
            value={provider}
            onChange={(e) => {
              const id = e.target.value as ProviderId;
              setProvider(id);
              setModel(null); // derived model follows the new provider's list
            }}
            className="rounded-md border px-1.5 py-1 text-[11px] outline-none"
            style={{ borderColor: "#242b3d", background: "#0e111a", color: "#c6d2e6" }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {vault[p.id]?.connected ? " ✓" : " ·"}
              </option>
            ))}
          </select>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="max-w-[210px] rounded-md border px-1.5 py-1 text-[11px] outline-none"
            style={{ borderColor: "#242b3d", background: "#0e111a", color: "#c6d2e6" }}
          >
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Reset terminal"
            title="Reset terminal"
            onClick={() => {
              bufRef.current.clear();
              push(HELP_TEXT, "sys");
              repaint();
            }}
            className="grid h-7 w-7 place-items-center rounded-md border hover:brightness-125"
            style={{ borderColor: "#242b3d", background: "#0e111a", color: "#c6d2e6" }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const next = mode === "exec" ? "ask" : "exec";
              setMode(next);
              push(`mode → ${next}`, "sys");
            }}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium"
            style={{
              borderColor: "#242b3d",
              background: mode === "exec" ? "#12213a" : "#241528",
              color: mode === "exec" ? "#7cc3ff" : "#f2a2c6",
            }}
          >
            {mode === "exec" ? <Zap className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
            {mode === "exec" ? "EXEC" : "ASK"}
          </button>
        </div>
      </div>

      {/* output */}
      <div
        ref={outRef}
        onMouseUp={() => {
          if (!window.getSelection()?.toString()) inputRef.current?.focus();
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3 font-mono text-[12.5px] leading-[1.55]"
      >
        {lines.map((line) => (
          <div key={line.id} className="min-h-[1.2em]" style={{ color: KIND_COLOR[line.kind] }}>
            <Segmented runs={tokenizeAnsi(line.text)} />
            {line.chips && (
              <div className="mb-1 mt-1 flex flex-wrap gap-1.5">
                {line.chips.map((c) => (
                  <span key={c.command} className="inline-flex overflow-hidden rounded-md border" style={{ borderColor: "#2c3550" }}>
                    <button
                      type="button"
                      title={`Run in this terminal: ${c.command}`}
                      onClick={() => submit(`!${c.command}`)}
                      className="px-2 py-1 text-[11px] font-medium"
                      style={{ background: "#12213a", color: "#7cc3ff" }}
                    >
                      ▶ {c.label}
                    </button>
                    <button
                      type="button"
                      title="Insert into the prompt"
                      onClick={() => setInput(c.command)}
                      className="border-l px-1.5 py-1 text-[11px] hover:brightness-125"
                      style={{ borderColor: "#2c3550", background: "#0e111a", color: "#c6d2e6" }}
                    >
                      ⤵
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {!lines.length && <div style={{ color: "#5b6272" }}>loading…</div>}
      </div>

      {/* input */}
      <div className="border-t px-3 py-2" style={{ borderColor: "#1e2331", background: "#0e111a" }}>
        <div className="flex items-center gap-1.5 font-mono text-[12.5px]">
          <span className="shrink-0 select-none truncate" title={cwd || "session root"}>
            <span style={{ color: "var(--accent)" }}>{promptUser}</span>
            <span style={{ color: "#5b6272" }}>@</span>
            <span style={{ color: "#6cf79a" }}>{backend === "cloud" ? "sandbox" : "local"}</span>
            <span style={{ color: "#5b6272" }}>:</span>
            <span style={{ color: "#c6d2e6" }}>{shortPath(cwd)}</span>
            <span style={{ color: "#5b6272" }}> $</span>
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoFocus
            placeholder={
              mode === "exec" ? "type a command — ?question asks the AI" : "ask anything — !cmd force-runs · Alt+M toggles"
            }
            className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none"
            style={{ color: "#dfe4ee" }}
          />
          {running && (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-amber-300">
              <CircleDot className="h-3 w-3 animate-pulse" /> Ctrl+C to stop
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px]" style={{ color: "#8b93a7" }}>
          <span>Alt+M mode</span>
          <span>· ↑ history</span>
          <span>· Tab complete</span>
          <span>· Ctrl+C kill</span>
          <span>· Ctrl+L clear</span>
          <button
            type="button"
            onClick={() => setFollow((f) => !f)}
            className="ml-auto inline-flex items-center gap-1 hover:brightness-125"
            style={{ color: follow ? "#6cf79a" : "#8b93a7" }}
          >
            {follow ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            {follow ? "following output" : "output paused"}
          </button>
          {lastExit && (
            <span style={{ color: lastExit.code !== 0 ? "#ef5a68" : "#6cf79a" }}>
              last: exit {lastExit.code} · {fmtMs(lastExit.ms)}
            </span>
          )}
          {backend === "desktop" && !bridge && (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <KeyRound className="h-3 w-3" /> open the desktop app for full power
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
