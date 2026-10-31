/**
 * Minimal runtime type shim for the MEDUSA terminal worker.
 *
 * Covers exactly the Workers + Containers surface this worker uses so the
 * folder compiles standalone — no @cloudflare/workers-types dependency. If you
 * prefer generated types, run `npx wrangler types`, adjust `tsconfig.json`, and
 * remove the matching declarations here.
 */

declare module "cloudflare:workers" {
  export interface DurableObjectContext {
    container?: ContainerLike;
    waitUntil(promise: Promise<unknown>): void;
    abort(reason?: unknown): void;
  }

  export class DurableObject<Env = unknown> {
    env: Env;
    ctx: DurableObjectContext;
    constructor(ctx: DurableObjectContext, env: Env) {
      this.ctx = ctx;
      this.env = env;
    }
  }
}

/** Subset of the Durable Object Container API used by TerminalShell. */
interface ContainerExecOptions {
  stdout?: "pipe" | "inherit";
  stderr?: "pipe" | "inherit";
  cwd?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
}

interface ContainerExecResult {
  exitCode: Promise<number>;
  stdout: ReadableStream | null;
  stderr: ReadableStream | null;
  kill?(signal?: number): void;
}

interface ContainerStartInit {
  image?: string;
  entrypoint?: string[];
  enableInternet?: boolean;
  labels?: Record<string, string>;
}

interface ContainerLike {
  running: boolean;
  start(init: ContainerStartInit): void;
  exec(argv: string[], options: ContainerExecOptions): ContainerExecResult;
  signal(signal: AbortSignal): void;
  setInactivityTimeout(ms: number): Promise<void>;
  destroy(): Promise<void>;
}
