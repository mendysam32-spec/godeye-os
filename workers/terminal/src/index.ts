/**
 * MEDUSA OS — Cloud terminal backend.
 *
 * A Worker that pairs a Durable Object with a Linux (Debian) container. Each
 * authenticated user gets their own named Durable Object → their own sandbox
 * with persisted working state while it lives.
 *
 * The main MEDUSA OS app (deployed via OpenNext) reaches this Worker through
 * the `TERMINAL_BACKEND` service binding (or `TERMINAL_URL` fetch in dev).
 * Every request must present the shared token in the `x-medusa-terminal`
 * header. Requests:
 *
 *   POST /run    { command, cwd?, env? }  → NDJSON stream
 *                 {"stream":"stdout","text":...}
 *                 {"stream":"stderr","text":...}
 *                 {"type":"exit","code":n}
 *                 {"type":"error",  "message":...}
 *   POST /ping                          → {"ok":true,...} backend status
 *
 * The client aborting the /run request kills the running process (SIGKILL)
 * thanks to the `enable_request_signal` compatibility flag — which is exactly
 * what Ctrl+C in the terminal needs.
 */

import { DurableObject } from "cloudflare:workers";

interface Env {
  TERMINAL_TOKEN: string;
}

// debian-trixie ships bash, git, node 24, python3 and the usual GNU utils.
const IMAGE_NAME = "cloudflare/debian-trixie";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

interface RunBody {
  command?: unknown;
  cwd?: unknown;
  env?: unknown;
  timeoutMs?: unknown;
}

class TerminalShell extends DurableObject<Env> {
  /** Boot the shared container if it is not already running. */
  private ensureRunning() {
    const container = this.ctx.container;
    if (!container) throw new Error("No container is configured for this Durable Object");
    if (!container.running) {
      container.start({
        image: IMAGE_NAME,
        entrypoint: ["sleep", "infinity"],
        enableInternet: true,
        labels: { app: "godseye-terminal" },
      });
      // Stay warm for 10 minutes between commands.
      void container.setInactivityTimeout(10 * 60 * 1000).catch(() => undefined);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const token = request.headers.get("x-medusa-terminal");
    if (!this.env.TERMINAL_TOKEN || token !== this.env.TERMINAL_TOKEN) {
      return Response.json({ type: "error", message: "Terminal backend token mismatch" }, { status: 401 });
    }

    try {
      if (request.method === "GET") {
        return Response.json({ ok: true, backend: "container" });
      }
      if (request.method !== "POST") {
        return Response.json({ type: "error", message: "Method not allowed" }, { status: 405 });
      }

      if ((new URL(request.url).pathname || "/").startsWith("/ping")) {
        this.ensureRunning();
        return Response.json({ ok: true, backend: "container", running: this.ctx.container?.running ?? false });
      }
      if ((new URL(request.url).pathname || "/").endsWith("/run")) {
        const body = (await request.json().catch(() => null)) as RunBody | null;
        const command = body && typeof body.command === "string" ? body.command : "";
        if (!command.trim()) {
          return Response.json({ type: "error", message: "command is required" }, { status: 400 });
        }
        return this.runStream(request, body!);
      }
      return Response.json({ type: "error", message: "Not found" }, { status: 404 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ type: "error", message }, { status: 500 });
    }
  }

  private runStream(request: Request, body: RunBody): Response {
    const command = String(body.command);
    const cwd = typeof body.cwd === "string" && body.cwd ? body.cwd : undefined;
    const env =
      body.env && typeof body.env === "object" && !Array.isArray(body.env)
        ? Object.fromEntries(
            Object.entries(body.env as Record<string, unknown>)
              .filter(([k, v]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && !k.includes("=") && (typeof v === "string" || typeof v === "number"))
              .map(([k, v]) => [k, String(v)])
          )
        : undefined;
    const timeoutMs = typeof body.timeoutMs === "number" && body.timeoutMs > 0 ? Math.min(body.timeoutMs, 600000) : DEFAULT_TIMEOUT_MS;

    // Kill the process when the client goes away (Ctrl+C / tab closed).
    const controller = new AbortController();
    const abort = () => {
      // Once the process exits, abort() would throw inside the DO — drop the
      // listener first.
      exitedGuard();
      controller.abort();
    };
    let cleared = false;
    const exitedGuard = () => {
      if (!cleared) {
        cleared = true;
        request.signal?.removeEventListener?.("abort", abort);
      }
    };
    try {
      request.signal?.addEventListener?.("abort", abort, { once: true });
    } catch {
      /* signal plumbing unavailable in this runtime — timeouts still apply */
    }

    const encoder = new TextEncoder();
    const ndjsonFrame = (obj: unknown) => encoder.encode(`${JSON.stringify(obj)}\n`);

    const stream = new ReadableStream<Uint8Array>({
      start: (push) => {
        void (async () => {
          let exited = false;
          let exitListener = () => {};
          try {
            this.ensureRunning();
            const proc = await this.ctx.container!.exec(["bash", "-lc", command], {
              stdout: "pipe",
              stderr: "pipe",
              ...(cwd ? { cwd } : {}),
              ...(env && Object.keys(env).length ? { env } : {}),
              signal: controller.signal,
            });

            exitListener = () => {
              exited = true;
              exitedGuard();
            };
            void proc.exitCode.then(exitListener);

            const decoder = new TextDecoder();
            const pump = async (pipe: ReadableStream | undefined, streamName: "stdout" | "stderr") => {
              if (!pipe) return;
              const reader = pipe.getReader();
              try {
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  push(ndjsonFrame({ stream: streamName, text: decoder.decode(value, { stream: true }) }));
                }
              } catch {
                // Stream torn down (kill/abort) — caller sees the error frame.
              }
            };

            const pumps = [pump(proc.stdout, "stdout"), pump(proc.stderr, "stderr")];

            const timer = setTimeout(() => {
              if (!exited) {
                push(ndjsonFrame({ type: "error", message: `Timed out after ${Math.round(timeoutMs / 1000)}s` }));
                try {
                  if (!exited) proc.kill(9);
                } catch {
                  /* already gone */
                }
              }
            }, timeoutMs);

            let code = -1;
            try {
              code = await proc.exitCode;
            } catch (err) {
              push(ndjsonFrame({ type: "error", message: err instanceof Error ? err.message : String(err) }));
              code = -1;
            }
            clearTimeout(timer);
            await Promise.allSettled(pumps);
            push(ndjsonFrame({ type: "exit", code }));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            push(ndjsonFrame({ type: "error", message: /abort/i.test(message) ? "Killed" : message }));
          } finally {
            clearSignal();
            void push.close();
          }
          function clearSignal() {
            try {
              request.signal?.removeEventListener?.("abort", abort);
            } catch {
              /* ignore */
            }
            exitedGuard();
          }
        })();
      },
      // No cancel handler: abort already kills the process.
    });

    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson",
        "cache-control": "no-store, no-transform",
        "x-accel-buffering": "no",
      },
    });
  }
}

interface Bindings {
  TERMINAL: { getByName(name: string): TerminalShell };
  TERMINAL_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Bindings): Promise<Response> {
    const token = request.headers.get("x-medusa-terminal");
    if (!env.TERMINAL_TOKEN || token !== env.TERMINAL_TOKEN) {
      return Response.json({ type: "error", message: "Terminal backend token mismatch" }, { status: 401 });
    }
    const user = sanitizeName(request.headers.get("x-medusa-user") || "");
    if (!user) {
      return Response.json({ type: "error", message: "x-medusa-user required" }, { status: 400 });
    }
    const stub = env.TERMINAL.getByName(`u-${user}`);
    return stub.fetch(request);
  },
};

/** Durable Object names have charset limits; ids are hex-ish anyway. */
function sanitizeName(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 100);
}

export { TerminalShell };
