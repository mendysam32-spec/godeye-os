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
 * opencode-inspired behaviour:
 *   - Modes: EXEC (shell runs) · AGENT (AI proposes a command, runs it, sees
 *     the real output and keeps going until done) · ASK (AI answers only).
 *   - Header shows the chosen model with a free badge, thinking (reasoning)
 *     level for capable models, and the backend/cloud state.
 *   - Self-setup: missing-tool errors in output are detected and offered as
 *     one-click install chips (python, wrangler, git, ffmpeg, …) — or run
 *     automatically when /auto is on, with one retry of the failed command.
 *   - /setup installs the full toolbox, /install <tool> installs one piece,
 *     /upgrade refreshes wrangler/npm, /timeout <sec> for heavy runs.
 *   - View preference: fit (in-page) / full (edge-to-edge, Esc to leave) /
 *     min (floating mini-panel), remembered per device.
 *   - Plus: ↑/↓ history, Tab completion, ANSI colors, run timing, exit codes,
 *     and Run/Insert chips on every AI answer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROVIDERS, modelsFor, isFreeModel, isReasoningModel, type ProviderId, type ProviderModel } from "@/lib/providers";
import { useMEDUSA } from "@/lib/store";
import { isDesktop, desktopBridge, type MEDUSADesktopBridge } from "@/lib/desktop";
import { getDecryptedVaultForApi } from "@/lib/vault-crypto";
import { createRunner, killCloudRun, type Backend, type RunEvent, type RunHandle } from "@/lib/terminal/engine";
import { LineBuffer, textOf, type TerminalLine } from "@/lib/terminal/lines";
import { tokenizeAnsi, type AnsiRun } from "@/lib/terminal/ansi";
import {
  Zap,
  Bot,
  MessageCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Terminal as TerminalIcon,
  Maximize2,
  Shrink,
  Minimize2,
  KeyRound,
  CircleDot,
} from "lucide-react";

const HISTORY_KEY = "medusa:terminal:history";
const CWD_KEY = "medusa:terminal:cwd";
const MODE_KEY = "medusa:terminal:mode";
const PROVIDER_KEY = "medusa:terminal:provider";
const MODEL_KEY = "medusa:terminal:model";
const BACKEND_KEY = "medusa:terminal:backend";
const VIEW_KEY = "medusa:terminal:view";
const AUTOINSTALL_KEY = "medusa:terminal:autoinstall";
const TIMEOUT_KEY = "medusa:terminal:timeout";
const MAX_HISTORY = 80;
const MAX_AGENT_STEPS = 6;

type Mode = "exec" | "agent" | "ask";
type ViewMode = "fit" | "full" | "min";
type ReasoningEffort = "off" | "low" | "medium" | "high" | "extra-high";
const EFFORTS: ReasoningEffort[] = ["off", "low", "medium", "high", "extra-high"];

const HELP_TEXT = [
  "MEDUSA OS terminal — opencode-style power terminal",
  "  modes    EXEC shell runs · AGENT the AI runs the shell until the goal is met (Alt+M cycles)",
  "  ?text    one-shot AI answer   · !cmd force-run while in AGENT/ASK   · Ctrl+C stops runs + agent",
  "  self-setup detects missing tools (python, wrangler, git…) → install chips; /auto installs + retries silently",
  "  slash    /help /clear /history /mode [m] /models /model <id> /provider <id> /ask <q>",
  "           /status /setup /install <tool> /upgrade /timeout <sec> /auto",
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

function persistPref(key: string, value: string | number | boolean | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    /* storage full / private mode */
  }
}

/* ------------------------------------------------------------------ */
/* Missing-tool detection + backend-aware install commands            */
/* ------------------------------------------------------------------ */

interface MissingTool {
  /** canonical key: python | pip | node | git | curl | wget | jq | ffmpeg | wrangler */
  name: string;
  /** exact spelling from the error (for the chip label) */
  raw: string;
  /** pip module when the error was "No module named 'x'" */
  module?: string;
}

function canonicalTool(s: string): string | null {
  const k = s.toLowerCase();
  if (/^python(\d+(\.\d+)*)?$|^py$/.test(k)) return "python";
  if (/^pip3?(\d+(\.\d+)*)?$/.test(k)) return "pip";
  if (k === "node" || k === "npm" || k === "npx") return "node";
  if (["git", "curl", "wget", "jq", "ffmpeg", "wrangler"].includes(k)) return k;
  return null;
}

/** Scans freshly streamed output for known missing-tool errors. */
function detectMissing(out: string): MissingTool | null {
  // Debian: `bash: python3: command not found` · dash: `/bin/sh: 1: python3: not found`
  const linux = out.match(/(?:^|\n)[^\n:]{0,60}(?:bash: |sh: )?(?:\d+: )?([A-Za-z][\w.+-]*): (?:command not found|not found)(?=\n|$)/);
  if (linux) {
    const raw = linux[1];
    const name = canonicalTool(raw);
    if (name) return { name, raw };
  }
  // cmd.exe / pwsh: `'python' is not recognized as an internal or external command`
  const win = out.match(/(?:^|\n)[^\n]*?['"]([A-Za-z][\w.+-]*)['"]\s+is not recognized/);
  if (win) {
    const raw = win[1];
    const name = canonicalTool(raw);
    if (name) return { name, raw };
  }
  // Python interpreter present but module absent → pip install
  const mod =
    out.match(/ModuleNotFoundError: No module named ['"]([\w.-]+)['"]/) ||
    out.match(/(?:^|\n)[^\n]*No module named ['"]([\w.-]+)['"]/);
  if (mod) return { name: "pip", raw: mod[1], module: mod[1] };
  return null;
}

function winWinget(id: string, interactive = true): string {
  return `winget install --id ${id} -e --accept-source-agreements --accept-package-agreements${interactive ? "" : " --disable-interactivity"}`;
}

/** One command that installs the missing piece for the active backend. */
function installFor(tool: MissingTool, backend: Backend, desktopPlatform: string): string | null {
  const win = backend === "desktop" && /win/i.test(desktopPlatform);
  const mac = backend === "desktop" && /mac|darwin/i.test(desktopPlatform);
  if (tool.module) {
    const mod = tool.module.replace(/["$`;\\]/g, "");
    if (backend === "cloud" || (!win && !mac)) return `pip3 install --break-system-packages "${mod}"`;
    return `pip install "${mod}"`;
  }
  if (backend === "desktop" && !win && !mac) {
    // desktop on Linux — apt is the pragmatic default
    return installFor(tool, "cloud", "");
  }
  if (win) {
    switch (tool.name) {
      case "python": case "pip": return winWinget("Python.Python.3.12");
      case "node": return winWinget("OpenJS.NodeJS.LTS");
      case "git": return winWinget("Git.Git");
      case "jq": return winWinget("jqlang.JQ", false);
      case "ffmpeg": return winWinget("Gyan.FFmpeg", false);
      case "curl": case "wget": return winWinget("OpenJS.NodeJS.LTS", false);
      case "wrangler": return "npm install -g wrangler";
      default: return null;
    }
  }
  if (mac) {
    switch (tool.name) {
      case "python": case "pip": return "brew install python";
      case "node": return "brew install node";
      case "git": return "brew install git";
      case "jq": return "brew install jq";
      case "wget": return "brew install wget";
      case "curl": return "brew install curl";
      case "ffmpeg": return "brew install ffmpeg";
      case "wrangler": return "npm install -g wrangler";
      default: return null;
    }
  }
  switch (tool.name) {
    case "python": case "pip": return "apt-get update -qq && apt-get install -y python3 python3-pip python3-venv";
    case "node": return "apt-get update -qq && apt-get install -y nodejs npm";
    case "git": return "apt-get update -qq && apt-get install -y git";
    case "curl": return "apt-get update -qq && apt-get install -y curl";
    case "wget": return "apt-get update -qq && apt-get install -y wget";
    case "jq": return "apt-get update -qq && apt-get install -y jq";
    case "ffmpeg": return "apt-get update -qq && apt-get install -y ffmpeg";
    case "wrangler": return "npm install -g wrangler";
    default: return null;
  }
}

const INSTALLABLE = ["python", "pip", "node", "git", "curl", "wget", "jq", "ffmpeg", "wrangler"];

function toolboxSetup(backend: Backend, desktopPlatform: string): string {
  const win = backend === "desktop" && /win/i.test(desktopPlatform);
  const mac = backend === "desktop" && /mac|darwin/i.test(desktopPlatform);
  if (win) {
    // cmd.exe chains with &&
    return `${winWinget("Python.Python.3.12")} && ${winWinget("Git.Git")} && npm install -g wrangler`;
  }
  if (mac) return "brew install git jq python && npm install -g wrangler";
  return "apt-get update -qq && apt-get install -y git curl jq build-essential python3 python3-pip python3-venv && npm install -g wrangler";
}

function upgradeToolbox(backend: Backend, desktopPlatform: string): string {
  const win = backend === "desktop" && /win/i.test(desktopPlatform);
  if (win) return `${winWinget("Python.Python.3.12", false)} && npm install -g npm@latest wrangler@latest`;
  if (backend === "desktop" && /mac|darwin/i.test(desktopPlatform))
    return "brew update && npm install -g npm@latest wrangler@latest";
  return "apt-get update -qq && npm install -g npm@latest wrangler@latest";
}

/* ------------------------------------------------------------------ */
/* Rendering helpers                                                  */
/* ------------------------------------------------------------------ */

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

const CHIP_BTN = { background: "#12213a", color: "#7cc3ff" } as const;

const MODE_STYLE: Record<Mode, { bg: string; fg: string }> = {
  exec: { bg: "#12213a", fg: "#7cc3ff" },
  agent: { bg: "#1a1230", fg: "#c9a6ff" },
  ask: { bg: "#241528", fg: "#f2a2c6" },
};

export function TerminalView() {
  const store = useMEDUSA() as unknown as {
    currentUser?: { displayName?: string };
    profile?: { name?: string };
    vault: Record<string, { key?: string; models?: unknown[]; connected?: boolean }>;
    settings: { defaultProvider?: string; reasoningEffort?: ReasoningEffort };
    setSettings: (patch: { reasoningEffort?: ReasoningEffort }) => void;
  };
  const { vault, settings } = store;

  /* ---------------- persisted prefs (hydrated one tick after paint) -- */
  const [backend, setBackend] = useState<Backend>(isDesktop() ? "desktop" : "cloud");
  const [view, setView] = useState<ViewMode>("fit");
  const [prevView, setPrevView] = useState<ViewMode | null>(null);
  const [autoInstall, setAutoInstall] = useState(false);
  const [timeoutSec, setTimeoutSec] = useState(300);
  const [mode, setMode] = useState<Mode>("exec");

  /* ---------------- terminal state ---------------- */
  const [cloudOk, setCloudOk] = useState<boolean | null>(null);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
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
  const agentAbortRef = useRef(false);
  const modeRef = useRef<Mode>("exec");
  const viewRef = useRef<ViewMode>("fit");
  const modelRef = useRef<{ provider: ProviderId; model: string }>({ provider: "openrouter", model: "" });
  const backendRef = useRef<Backend>("cloud");
  const autoInstallRef = useRef(false);
  const prevViewRef = useRef<ViewMode | null>(null);
  type StartRunFn = (command: string, raw?: boolean) => { handle: RunHandle | null; exit: Promise<number> };
  const startRunRef = useRef<StartRunFn | null>(null);
  const finishRef = useRef<(code: number, startedAt: number, mark: number, command: string, raw: boolean) => void>(
    () => undefined,
  );
  const bridge: MEDUSADesktopBridge | null = desktopBridge();

  const modelList: ProviderModel[] = useMemo(
    () => modelsFor(PROVIDERS.find((p) => p.id === provider), vault[provider]?.models as never),
    [provider, vault],
  );
  /** Current model — derived so it follows the provider's list by default,
   *  while /model <id> or manual picks take precedence via the override. */
  const model = modelOverride ?? modelList[0]?.id ?? "";
  const modelEntry = modelList.find((m) => m.id === model);
  const freeModel = isFreeModel(modelEntry ?? { id: model });
  const reasoningCapable = isReasoningModel(model, modelList);
  const effort: ReasoningEffort = settings.reasoningEffort ?? "medium";
  const setEffort = useCallback(
    (e: ReasoningEffort) => store.setSettings({ reasoningEffort: e }),
    [store],
  );

  /* ---------------- paint ---------------- */
  const repaint = useCallback(() => setLines(bufRef.current.snapshot()), []);
  const push = useCallback(
    (text: string, kind: TerminalLine["kind"], chips?: { command: string; label: string }[]) => {
      bufRef.current.push(text, kind, chips);
      repaint();
    },
    [repaint],
  );

  /* ---------------- init: restore prefs + banner ---------------- */
  // Deferred one tick so the first paint matches SSR (no hydration
  // mismatch) and hydration lands as an async external-system update.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const h = localStorage.getItem(HISTORY_KEY);
        if (h) setHistory((JSON.parse(h) as string[]).slice(-MAX_HISTORY));
        const c = localStorage.getItem(CWD_KEY);
        if (c) setCwd(c);
        const m = localStorage.getItem(MODE_KEY);
        if (m === "exec" || m === "agent" || m === "ask") setMode(m);
        const p = localStorage.getItem(PROVIDER_KEY);
        if (p && PROVIDERS.some((x) => x.id === p)) setProvider(p as ProviderId);
        const mo = localStorage.getItem(MODEL_KEY);
        if (mo) setModel(mo);
        const b = localStorage.getItem(BACKEND_KEY);
        if (b === "desktop" || b === "cloud") setBackend(b);
        const v = localStorage.getItem(VIEW_KEY);
        if (v === "fit" || v === "full" || v === "min") setView(v);
        if (localStorage.getItem(AUTOINSTALL_KEY) === "1") setAutoInstall(true);
        const ts = Number(localStorage.getItem(TIMEOUT_KEY));
        if (Number.isFinite(ts) && ts >= 10 && ts <= 600) setTimeoutSec(Math.round(ts));
      } catch {
        /* fresh session */
      }
      bufRef.current.push(HELP_TEXT, "sys");
      bufRef.current.flush();
      repaint();
    }, 0);
    return () => window.clearTimeout(t);
  }, [repaint]);

  const switchBackend = useCallback(
    (next: Backend) => {
      setBackend(next);
      persistPref(BACKEND_KEY, next);
      push(`backend → ${next === "desktop" ? "desktop (your PC)" : "cloud (Debian sandbox)"}`, "sys");
    },
    [push],
  );

  const setProviderPersist = useCallback((id: ProviderId) => {
    setProvider(id);
    setModel(null);
    persistPref(PROVIDER_KEY, id);
    persistPref(MODEL_KEY, null);
  }, []);

  const setModelPersist = useCallback((id: string | null) => {
    setModel(id);
    persistPref(MODEL_KEY, id);
  }, []);

  /** Leaving a real view records it as the minimize target; landing on one clears nothing. */
  const setViewPersist = useCallback((next: ViewMode) => {
    const prev = viewRef.current;
    if (prev !== "min" && prev !== next) setPrevView(prev);
    setView(next);
    persistPref(VIEW_KEY, next);
  }, []);

  const setModePersist = useCallback(
    (next: Mode, announce = true) => {
      setMode(next);
      persistPref(MODE_KEY, next);
      if (announce)
        push(
          `mode → ${next}${next === "exec" ? " (shell runs)" : next === "agent" ? " (AI drives the shell)" : " (AI answers)"}`,
          "sys",
        );
    },
    [push],
  );

  useEffect(() => {
    void fetch("/api/terminal/exec", { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { backend?: string } | null) => setCloudOk(j?.backend === "cloud"))
      .catch(() => setCloudOk(false));
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    modelRef.current = { provider, model };
  }, [provider, model]);

  /* ---------------- run machinery ---------------- */
  /**
   * Stream a command into the shared buffer. Returns the per-run exit code
   * promise so callers (agent loop, self-setup) can await semantics without
   * racing global lastExit state.
   */
  const startRun = useCallback(
    (command: string, raw = false): { handle: RunHandle | null; exit: Promise<number> } => {
      let codeResolve: (code: number) => void = () => undefined;
      const exit = new Promise<number>((r) => {
        codeResolve = r;
      });
      const startedAt = Date.now();
      const mark = bufRef.current.snapshot().length;
      setRunning(true);
      const runner = createRunner(backend, bridge);
      const handle = runner({
        command,
        cwd: cwd || undefined,
        timeoutMs: timeoutSec * 1000,
        onEvent: (ev: RunEvent) => {
          if (ev.kind === "chunk") {
            bufRef.current.append(ev.text, ev.stream === "stderr" ? "err" : "out");
            repaint();
          } else if (ev.kind === "error") {
            bufRef.current.append(`\n✗ ${ev.message}\n`, "sys");
            repaint();
          } else if (ev.kind === "exit") {
            codeResolve(ev.code);
            finishRef.current(ev.code, startedAt, mark, command, raw);
          }
        },
      });
      activeRef.current = handle;
      void handle.done.finally(() => {
        if (activeRef.current === handle) {
          setRunning(false);
          activeRef.current = null;
        }
        codeResolve(-1); // engine guarantees an exit frame; belt & braces
      });
      void handle.done.catch(() => undefined);
      return { handle, exit };
    },
    [backend, bridge, cwd, repaint, timeoutSec],
  );

  /**
   * Run completion + smart self-setup: a non-zero exit whose output points at
   * a missing tool (python, wrangler, git, a pip module, …) gets an install
   * plan. When /auto is on the plan runs by itself, then the failed command
   * retries exactly once — everything else becomes a one-click chip.
   */
  const commitExit = useCallback(
    (code: number, startedAt: number, mark: number, command: string, raw: boolean) => {
      bufRef.current.flush();
      setRunning(false);
      activeRef.current = null;
      setLastExit({ code, ms: Date.now() - startedAt });
      push(`─ exit ${code} ${code !== 0 ? "⚠" : "✓"} · ${fmtMs(Date.now() - startedAt)}`, "sys");
      inputRef.current?.focus();
      if (raw || code === 0) return;
      const outText = textOf(bufRef.current.snapshot().slice(mark)).join("\n");
      const missing = detectMissing(outText);
      if (!missing) return;
      const platform = backendRef.current === "desktop" ? navigator.platform || "" : "linux";
      const install = installFor(missing, backendRef.current, platform);
      if (!install) {
        push(`✗ missing “${missing.raw}” — no automatic installer for this backend. Install it, then retry.`, "err");
        return;
      }
      const label = missing.module ? `pip module ${missing.module}` : missing.raw;
      if (autoInstallRef.current) {
        push(`✦ auto-install: installing ${label} … (/auto on)`, "sys");
        void (async () => {
          const ok = (await startRunRef.current!(install, true).exit) === 0;
          if (ok) {
            push(`→ retrying: ${command}`, "sys");
            void startRunRef.current!(command, true).exit;
          } else {
            push(`✗ install of ${label} failed — fix manually, then retry.`, "err");
          }
        })();
        return;
      }
      push(`✦ missing ${label} — /auto enables silent setup, or click install:`, "sys");
      push(
        "",
        "out",
        [
          { command: install, label: `install ${missing.module ?? missing.raw}` },
          { command, label: "retry original" },
        ],
      );
    },
    [push],
  );
  useEffect(() => {
    finishRef.current = commitExit;
  }, [commitExit]);

  // keep the runtimeRefs fresh for callbacks that outlive renders (agent
  // loop, self-install retries) — assigned after startRun is defined.
  useEffect(() => {
    backendRef.current = backend;
    autoInstallRef.current = autoInstall;
    startRunRef.current = startRun;
    prevViewRef.current = prevView;
  });

  /* ---------------- AI one-shot (ask) ---------------- */
  const askAi = useCallback(
    async (question: string): Promise<void> => {
      const startedAt = Date.now();
      setRunning(true);
      push(`▲ ai — ${question}`, "ai");
      try {
        const decryptedVault = await getDecryptedVaultForApi(vault as never);
        const { provider: p, model: m } = modelRef.current;
        const res = await fetch("/api/terminal/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            cwd: cwd || undefined,
            backend,
            platform: backend === "desktop" ? navigator.platform || "unknown" : "linux-cloud",
            provider: p,
            model: m || undefined,
            vault: decryptedVault,
            transcript: textOf(bufRef.current.snapshot()).slice(-30),
            reasoningEffort: effort,
            stage: "ask",
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
        const { provider: p, model: m } = modelRef.current;
        push(`  (${p}/${m || "—"} · think ${effort} · ${fmtMs(Date.now() - startedAt)})`, "sys");
        setRunning(false);
        inputRef.current?.focus();
      }
    },
    [backend, cwd, push, effort, vault],
  );

  /* ---------------- AI agent loop (opencode-style autonomous) -------- */
  const runAgentLoop = useCallback(
    async (question: string): Promise<void> => {
      const startedAt = Date.now();
      agentAbortRef.current = false;
      setRunning(true);
      push(`▲ agent — ${question}`, "ai");
      try {
        const decryptedVault = await getDecryptedVaultForApi(vault as never);
        for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
          if (agentAbortRef.current) {
            push("● agent — stopped", "sys");
            return;
          }
          const { provider: p, model: m } = modelRef.current;
          const res = await fetch("/api/terminal/ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question,
              cwd: cwd || undefined,
              backend: backendRef.current,
              platform: backendRef.current === "desktop" ? navigator.platform || "unknown" : "linux-cloud",
              provider: p,
              model: m || undefined,
              vault: decryptedVault,
              transcript: textOf(bufRef.current.snapshot()).slice(-30),
              reasoningEffort: effort,
              stage: "agent",
              step,
            }),
          });
          const data = (await res.json().catch(() => null)) as { reply?: string; commands?: string[]; error?: string } | null;
          if (!res.ok || data?.error) {
            push(`✗ ${data?.error || `AI error (${res.status})`}`, "err");
            return;
          }
          if (data?.reply) {
            bufRef.current.append(data.reply, "ai");
            bufRef.current.flush();
          }
          if (agentAbortRef.current) {
            push("● agent — stopped", "sys");
            return;
          }
          const commands = data?.commands || [];
          if (!commands.length) {
            push(`● agent finished — ${step - 1 || 0} command${step - 1 === 1 ? "" : "s"} · ${fmtMs(Date.now() - startedAt)}`, "sys");
            return;
          }
          const cmd = commands[0];
          push(`$ ${cmd}`, "echo");
          const { exit } = startRunRef.current!(cmd, true);
          await exit;
          if (agentAbortRef.current) {
            push("● agent — stopped", "sys");
            return;
          }
        }
        push(`● agent step cap (${MAX_AGENT_STEPS}) reached — review above, continue with ? or !`, "sys");
      } catch (e) {
        push(`✗ agent failed: ${String((e as Error).message || e)}`, "err");
      } finally {
        const { provider: p, model: m } = modelRef.current;
        push(`  (${p}/${m || "—"} · think ${effort})`, "sys");
        setRunning(false);
        inputRef.current?.focus();
      }
    },
    [cwd, push, effort, vault],
  );

  /* ---------------- builtins ---------------- */
  const slashCommands = useMemo(
    () =>
      [
        "/help",
        "/clear",
        "/history",
        "/mode",
        "/models",
        "/model",
        "/provider",
        "/ask",
        "/status",
        "/setup",
        "/install",
        "/upgrade",
        "/timeout",
        "/auto",
      ],
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

  const cycleMode = useCallback(() => {
    const order: Mode[] = ["exec", "agent", "ask"];
    const next = order[(order.indexOf(modeRef.current) + 1) % order.length];
    setModePersist(next);
  }, [setModePersist]);

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
            const a = arg.toLowerCase();
            if (a === "exec" || a === "agent" || a === "ask") setModePersist(a);
            else {
              const next = modeRef.current === "exec" ? "agent" : modeRef.current === "agent" ? "ask" : "exec";
              setModePersist(next, false);
            }
            return;
          }
          case "models":
            push(
              modelList.map((m) => `${m.id}${isFreeModel(m) ? "  · free" : "  · paid"}${m.id === model ? "  ←" : ""}`).join("\n") ||
                "(no models)",
              "out",
            );
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
              setModelPersist(found.id);
              push(`model → ${found.id}${isFreeModel(found) ? " (free)" : ""}`, "sys");
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
              setProviderPersist(p.id);
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
                `backend:  ${backendRef.current}${backendRef.current === "desktop" ? " (bridge active — your PC)" : " (Debian sandbox, per-user)"}`,
                `cloud:    ${cloudOk === null ? "checking…" : cloudOk ? "configured" : "not configured — deploy workers/terminal"}`,
                `model:    ${provider} / ${model || "(none)"}${freeModel ? " (free)" : ""}`,
                `thinking: ${reasoningCapable ? effort : `${effort} (ignored — model has no reasoning budget)`}`,
                `timeout:  ${timeoutSec}s per run`,
                `auto:     auto-install missing tools ${autoInstall ? "ON" : "off (/auto)"}`,
                `view:     ${view}`,
                `mode:     ${modeRef.current}${running ? " · running…" : ""}`,
                lastExit ? `last run: exit ${lastExit.code} · ${fmtMs(lastExit.ms)}` : "last run: —",
              ].join("\n"),
              "sys",
            );
            return;
          case "setup": {
            const plat = backend === "desktop" ? navigator.platform || "" : "linux";
            push(`✦ setting up the toolbox on ${backend}…`, "sys");
            startRun(toolboxSetup(backend, plat));
            return;
          }
          case "install": {
            if (!arg) {
              push(
                `usage: /install <tool> — tools: ${INSTALLABLE.join(", ")} · any other word installs it as a pip module`,
                "sys",
              );
              return;
            }
            const plat = backend === "desktop" ? navigator.platform || "" : "linux";
            const tool = canonicalTool(arg);
            const command = tool
              ? installFor({ name: tool, raw: arg }, backend, plat)
              : installFor({ name: "pip", raw: arg, module: arg }, backend, plat);
            if (!command) {
              push(`no installer mapping for “${arg}” — try: ${INSTALLABLE.join(", ")}`, "sys");
              return;
            }
            startRun(command);
            return;
          }
          case "upgrade": {
            const plat = backend === "desktop" ? navigator.platform || "" : "linux";
            push("✦ upgrading tooling (wrangler, npm, python via winget/brew/apt)…", "sys");
            startRun(upgradeToolbox(backend, plat));
            return;
          }
          case "timeout": {
            const sec = Number(arg);
            if (!Number.isFinite(sec) || sec < 10 || sec > 600) {
              push(`usage: /timeout <10-600> (seconds). currently ${timeoutSec}s`, "sys");
              return;
            }
            setTimeoutSec(Math.round(sec));
            persistPref(TIMEOUT_KEY, Math.round(sec));
            push(`timeout → ${Math.round(sec)}s per run`, "sys");
            return;
          }
          case "auto": {
            const a = arg.toLowerCase();
            const next = a === "on" ? true : a === "off" ? false : !autoInstall;
            setAutoInstall(next);
            persistPref(AUTOINSTALL_KEY, next);
            push(
              next
                ? "auto-install ON — missing tools install + their command retries automatically"
                : "auto-install off — missing tools appear as one-click chips",
              "sys",
            );
            return;
          }
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
              persistPref(CWD_KEY, r.cwd);
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
    [askAi, backend, bridge, cloudOk, cwd, freeModel, history, lastExit, model, modelList, provider, push, reasoningCapable, repaint, autoInstall, timeoutSec, view, effort, runAgentLoop, setModePersist, setModelPersist, setProviderPersist],
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
      push(`${shortPath(cwd)} !${cmd}`, "echo");
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
    } else if (modeRef.current === "agent") {
      push(`${shortPath(cwd)} agent ${v}`, "echo");
      void runAgentLoop(v);
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
      cycleMode();
      return;
    }
    if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      agentAbortRef.current = true;
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
    if (e.key === "Escape") {
      if (view === "full" && viewRef.current === "full") setViewPersist("fit");
      else if (view === "min" && prevView) setViewPersist(prevView);
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
      const pool: string[] = [
        ...(v.startsWith("/") ? slashCommands : []),
        ...history,
        ...INSTALLABLE.map((t) => `/install ${t}`),
      ];
      const match = pool.find((c) => c.startsWith(v) && c !== v);
      if (match) setInput(match);
    }
  };

  /* ---------------- scroll follow + Esc (global, unfocused) -------- */
  useEffect(() => {
    if (follow && outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [lines, follow]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (viewRef.current === "full") setViewPersist("fit");
      else if (viewRef.current === "min" && prevViewRef.current) setViewPersist(prevViewRef.current);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [setViewPersist]);

  /* ---------------- render ---------------- */
  const promptUser = (store.currentUser?.displayName || store.profile?.name || "medusa").split(" ")[0].toLowerCase();
  const platformLow = backend === "desktop" ? navigator.platform.toLowerCase() || "pc" : "sandbox";
  const modelOptions: ProviderModel[] = modelList.length ? modelList : [{ id: model || "no-models", name: "no models" }];
  const modeStyle = MODE_STYLE[mode];

  const headerRow = (
    /* status header — wraps on narrow screens, still one row on desktop */
    <div
      className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2"
      style={{ borderColor: "#1e2331", background: "#0e111a" }}
    >
      <div className="mr-1 flex items-center gap-2 text-xs font-medium text-slate-200">
        <TerminalIcon className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
        <span className="hidden sm:inline">MEDUSA terminal</span>
      </div>
      <button
        type="button"
        title="Backend: the MEDUSA desktop app where installed, else the cloud sandbox"
        onClick={() => switchBackend(backend === "desktop" ? "cloud" : "desktop")}
        className="rounded-full border px-2 py-0.5 text-[11px] transition hover:brightness-125"
        style={{ borderColor: "#242b3d", color: "#9fb0cf", background: "#101828" }}
      >
        {backend === "desktop" ? "desktop — your PC" : "cloud — sandbox"}
      </button>
      <span
        className="rounded-full border px-2 py-0.5 text-[11px]"
        style={{ borderColor: "#242b3d", color: cloudOk ? "#6cf79a" : "#fbbf24", background: "#0e111a" }}
      >
        {cloudOk === null ? "checking cloud…" : cloudOk ? "cloud ready" : "cloud off — /status"}
      </span>

      {/* model stack */}
      <div className="flex items-center gap-1.5">
        <select
          value={provider}
          onChange={(e) => setProviderPersist(e.target.value as ProviderId)}
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
          onChange={(e) => setModelPersist(e.target.value)}
          className="max-w-[170px] rounded-md border px-1.5 py-1 text-[11px] outline-none sm:max-w-[230px]"
          style={{ borderColor: "#242b3d", background: "#0e111a", color: "#c6d2e6" }}
          title={model}
        >
          {modelOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
              {isFreeModel(m) ? " · free" : " · paid"}
              {m.context && m.context !== "-" ? ` · ${m.context}` : ""}
            </option>
          ))}
        </select>
        <span
          title={freeModel ? "Zero-cost model" : "Metered model"}
          className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          style={{
            borderColor: freeModel ? "#2f8f5b" : "#242b3d",
            color: freeModel ? "#6cf79a" : "#5b6272",
            background: "#0e111a",
          }}
        >
          {freeModel ? "FREE" : "PAID"}
        </span>
        <select
          value={effort}
          disabled={!reasoningCapable}
          onChange={(e) => setEffort(e.target.value as ReasoningEffort)}
          title={reasoningCapable ? "Thinking (reasoning) budget sent with every AI call" : "This model has no reasoning budget"}
          className="rounded-md border px-1.5 py-1 text-[11px] outline-none disabled:opacity-40"
          style={{ borderColor: "#242b3d", background: "#0e111a", color: reasoningCapable ? "#e7c98b" : "#5b6272" }}
        >
          {reasoningCapable ? (
            EFFORTS.map((lv) => (
              <option key={lv} value={lv}>
                {lv === "off" ? "think: off" : lv === "medium" ? "think: med" : `think: ${lv}`}
              </option>
            ))
          ) : (
            <option>think: n/a</option>
          )}
        </select>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* view preferences: fit / full / min */}
        {view !== "min" ? (
          <>
            <button
              type="button"
              title={view === "full" ? "Back to fit (Esc)" : "Fullscreen (Esc leaves)"}
              onClick={() => setViewPersist(view === "full" ? "fit" : "full")}
              className="grid h-7 w-7 place-items-center rounded-md border hover:brightness-125"
              style={{ borderColor: "#242b3d", background: "#0e111a", color: "#c6d2e6" }}
            >
              {view === "full" ? <Shrink className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              title="Minimize to a floating panel"
              onClick={() => setViewPersist("min")}
              className="grid h-7 w-7 place-items-center rounded-md border hover:brightness-125"
              style={{ borderColor: "#242b3d", background: "#0e111a", color: "#c6d2e6" }}
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            title={`Restore ${prevView || "fit"}`}
            onClick={() => setViewPersist(prevView || "fit")}
            className="grid h-7 w-7 place-items-center rounded-md border hover:brightness-125"
            style={{ borderColor: "#242b3d", background: "#0e111a", color: "#c6d2e6" }}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
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
          onClick={() => cycleMode()}
          title="Cycle mode: EXEC → AGENT → ASK (Alt+M)"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium"
          style={{ borderColor: "#242b3d", background: modeStyle.bg, color: modeStyle.fg }}
        >
          {mode === "exec" ? <Zap className="h-3 w-3" /> : mode === "agent" ? <Bot className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
          {mode === "exec" ? "EXEC" : mode === "agent" ? "AGENT" : "ASK"}
        </button>
      </div>
    </div>
  );

  const outputRow = (
    /* output */
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
                    style={CHIP_BTN}
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
  );

  const inputRow = (
    /* input + hints */
    <div className="border-t px-3 py-2" style={{ borderColor: "#1e2331", background: "#0e111a" }}>
      <div className="flex items-center gap-1.5 font-mono text-[12.5px]">
        <span className="shrink-0 select-none truncate" title={cwd || "session root"}>
          <span style={{ color: "var(--accent)" }}>{promptUser}</span>
          <span style={{ color: "#5b6272" }}>@</span>
          <span style={{ color: "#6cf79a" }}>{platformLow}</span>
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
            mode === "exec"
              ? "type a command — ?q asks the AI"
              : mode === "agent"
                ? "goal for the agent — it runs commands itself · !cmd force-runs"
                : "ask anything — !cmd force-runs · Alt+M cycles modes"
          }
          className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none"
          style={{ color: "#dfe4ee" }}
        />
        {running && (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-amber-300">
            <CircleDot className="h-3 w-3 animate-pulse" /> Ctrl+C
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px]" style={{ color: "#8b93a7" }}>
        {mode === "agent" && <span style={{ color: "#c9a6ff" }}>AGENT lets the model run commands — Ctrl+C stops all</span>}
        <span>Alt+M mode</span>
        <span>· ↑ history</span>
        <span>· Tab complete</span>
        <span>· Ctrl+C kill</span>
        <span>· Ctrl+L clear</span>
        <span>· {timeoutSec}s/run</span>
        <span>· auto {autoInstall ? "on" : "off"}</span>
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
  );

  /* panel shell — one tree, different bounds for fit/full */
  const panel = (
    <div
      className={
        view === "full"
          ? "flex h-full min-h-0 flex-col overflow-hidden"
          : "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl shadow-inner"
      }
      style={
        {
          background: "#0b0e15",
          border: view === "full" ? "none" : "1px solid #1e2331",
          color: "var(--term-fg)",
          "--term-bg": "#0b0e15",
          "--term-fg": "#dfe4ee",
        } as React.CSSProperties
      }
    >
      {headerRow}
      {outputRow}
      {inputRow}
    </div>
  );

  if (view === "min") {
    /* minimized — floating mini panel, bottom-right, above everything */
    const lastLine = lines.filter((l) => l.kind !== "out" || l.text.trim()).at(-1);
    return (
      <div
        className="fixed bottom-3 right-3 z-50 flex max-h-[60vh] w-[min(470px,92vw)] max-w-[92vw] flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{ background: "#0b0e15", border: "1px solid #1e2331", color: "var(--term-fg)" }}
      >
        <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5" style={{ borderColor: "#1e2331", background: "#0e111a" }}>
          <TerminalIcon className="h-3 w-3" style={{ color: "var(--accent)" }} />
          <span className="text-[11px] font-medium text-slate-200">MEDUSA</span>
          <span
            className="rounded-full border px-1.5 py-0.5 text-[10px] leading-none"
            style={{ borderColor: "#242b3d", background: modeStyle.bg, color: modeStyle.fg }}
          >
            {mode === "exec" ? "EXEC" : mode === "agent" ? "AGENT" : "ASK"}
          </span>
          {running && <CircleDot className="h-3 w-3 animate-pulse text-amber-300" />}
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              title="Fullscreen"
              onClick={() => setViewPersist("full")}
              className="grid h-6 w-6 place-items-center rounded hover:brightness-125"
              style={{ color: "#c6d2e6" }}
            >
              <Shrink className="h-3 w-3" />
            </button>
            <button
              type="button"
              title={`Restore ${prevView || "fit"}`}
              onClick={() => setViewPersist(prevView || "fit")}
              className="grid h-6 w-6 place-items-center rounded hover:brightness-125"
              style={{ color: "#c6d2e6" }}
            >
              <Maximize2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              title="Stop everything (kill run + agent)"
              onClick={() => {
                agentAbortRef.current = true;
                activeRef.current?.kill();
                if (backend === "cloud") killCloudRun();
              }}
              className="grid h-6 w-6 place-items-center rounded font-mono text-[11px] hover:brightness-125"
              style={{ color: "#ff8b94" }}
            >
              ✕
            </button>
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-[1.45]" style={{ maxHeight: "20vh" }}>
          {(lastLine ? lastLine.text : "minimized — output keeps streaming").split("\n").map((l, i) => (
            <div key={i} style={{ color: lastLine ? KIND_COLOR[lastLine.kind] : "#5b6272" }}>
              {l.slice(0, 160)}
            </div>
          ))}
        </div>
        <div className="border-t px-2 py-1.5" style={{ borderColor: "#1e2331", background: "#0e111a" }}>
          <div className="flex items-center gap-1.5 font-mono text-[11.5px]">
            <span style={{ color: "var(--accent)" }}>{promptUser}</span>
            <span style={{ color: "#5b6272" }}>$</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              spellCheck={false}
              autoFocus
              placeholder={mode === "agent" ? "agent goal…" : mode === "ask" ? "ask…" : "command…"}
              className="min-w-0 flex-1 bg-transparent font-mono text-[11.5px] outline-none"
              style={{ color: "#dfe4ee" }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (view === "full") {
    /* fullscreen — edge to edge, above the whole app */
    return (
      <div className="fixed inset-0 z-40" style={{ background: "var(--background)" }}>
        {panel}
      </div>
    );
  }

  return panel;
}
