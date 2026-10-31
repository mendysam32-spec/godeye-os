import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

/**
 * Terminal execution proxy (cloud mode).
 *
 * Browsers can't run commands; the terminal page streams every command through
 * this route to the `godseye-terminal` worker — a Durable Object + Debian
 * container, one sandbox per user. Output arrives back as the worker's NDJSON
 * stream, byte for byte.
 *
 * Desktop (Electron) sessions bypass this route entirely: they execute locally
 * over the medusa bridge IPC.
 *
 * Stream events (NDJSON, one JSON object per line):
 *   {"stream":"stdout","text":...} {"stream":"stderr","text":...}
 *   {"type":"exit","code":0}       {"type":"error","message":...}
 */

export const maxDuration = 300;

interface RunBody {
  command?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

interface TerminalEnv {
  TERMINAL_BACKEND?: { fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> };
  TERMINAL_URL?: string;
  TERMINAL_TOKEN?: string;
}

/** Route a terminal request to the configured backend. Null when unconfigured. */
type Backend = (path: string, init: { headers: Headers; body: string; signal?: AbortSignal }) => Promise<Response>;
interface ResolvedBackend {
  send: Backend;
  /** shared secret expected by the terminal worker */
  token: string;
}

function userIsSafe(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 100);
}

function authHeaders(sharedToken: string, userId: string): Headers {
  return new Headers({
    "content-type": "application/json",
    "x-medusa-terminal": sharedToken,
    "x-medusa-user": userIsSafe(userId),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as RunBody | null;
  const command = body?.command;
  if (typeof command !== "string" || !command.trim()) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  const resolved = await resolveBackend();
  if (!resolved) {
    return NextResponse.json(
      {
        type: "error",
        message: "Cloud terminal backend is not configured on this deployment.",
        hint: "Deploy workers/terminal and bind TERMINAL_BACKEND (workers/terminal/README.md). Use the desktop app meanwhile — it runs commands locally.",
      },
      { status: 503 }
    );
  }

  // Optional caller override of a merciful default — server clamps anyway.
  const timeoutMs = typeof body?.timeoutMs === "number" && body.timeoutMs > 0 ? Math.min(body.timeoutMs, 600_000) : undefined;
  const payload = {
    command: command.slice(0, 8000),
    ...(body?.cwd ? { cwd: String(body.cwd).slice(0, 400) } : {}),
    ...(body?.env && typeof body.env === "object" ? { env: body.env } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
  };

  try {
    const upstream = await resolved.send("/run", {
      headers: authHeaders(resolved.token, user.id),
      body: JSON.stringify(payload),
      // Walking the client hangup into the DO signal so Ctrl+C kills the remote
      // process — requires enable_request_signal on the terminal worker.
      signal: req.signal ?? undefined,
    });
    if (!upstream.ok) {
      const detail = (await upstream.json().catch(() => null)) as { message?: string } | null;
      return NextResponse.json({ type: "error", message: detail?.message || `Terminal backend error (${upstream.status})` }, { status: upstream.status === 401 ? 401 : 502 });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: { "content-type": "application/x-ndjson", "cache-control": "no-store", "x-accel-buffering": "no" },
    });
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message));
    if (aborted) return new Response(null, { status: 499 });
    return NextResponse.json({ type: "error", message: String((e as Error).message || e) }, { status: 502 });
  }
}

/** Availability probe for the terminal status bar. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const resolved = await resolveBackend();
  return NextResponse.json({ ok: true, backend: resolved ? "cloud" : "unconfigured", user: user.id });
}

async function resolveBackend(): Promise<ResolvedBackend | null> {
  const token = typeof process.env.TERMINAL_TOKEN === "string" ? process.env.TERMINAL_TOKEN : "";
  let env: TerminalEnv | undefined;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    env = ctx.env as unknown as TerminalEnv;
  } catch {
    /* not on Cloudflare — fall back to process env (dev) */
    env = { TERMINAL_URL: process.env.TERMINAL_URL };
  }
  const shared = env?.TERMINAL_TOKEN || token || "dev-shared-token-change-me";
  if (env?.TERMINAL_BACKEND) {
    // Service binding: absolute request URL is ignored; path rides along.
    return { token: shared, send: (path, init) => env!.TERMINAL_BACKEND!.fetch(`https://terminal.local${path}`, init) };
  }
  const devUrl = ((env?.TERMINAL_URL || process.env.TERMINAL_URL || "") as string).replace(/\/+$/, "");
  if (devUrl) {
    // Plain fetch to a locally running `wrangler dev` inside workers/terminal.
    return { token: shared, send: (path, init) => globalThis.fetch(`${devUrl}${path}`, init) };
  }
  return null;
}
