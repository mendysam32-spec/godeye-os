# godseye-terminal — MEDUSA OS cloud terminal backend

Pairs a **Durable Object** with a **Debian (trixie) container**: one sandbox per
MEDUSA user (named `u-<userId>`), reachable through a service binding from the
main app.

## Layout

```
src/index.ts     TerminalShell Durable Object (container exec + NDJSON streams)
wrangler.jsonc   containers + durable_objects config (durable_object policy)
```

## Protocol

`POST /run` `{ command, cwd?, env?, timeoutMs? }` → NDJSON body stream:

```json
{"stream":"stdout","text":"..."}
{"stream":"stderr","text":"..."}
{"type":"exit","code":0}
{"type":"error","message":"..."}
```

`GET /` (ping via service binding) → `{ ok: true, backend: "container" }`

Auth: every request carries `x-medusa-terminal: <TOKEN>`; the main app also
sends `x-medusa-user: <userId>` which names the Durable Object instance
(→ per-user container). Client-disconnect aborts (`enable_request_signal` flag)
kill the running process — that is how Ctrl+C works.

## Local dev

Docker must be running (wrangler executes the container locally).

```sh
# 1) start this worker (prints http://127.0.0.1:8787 or :8799 depending on port)
cd workers/terminal && npx wrangler dev

# 2) point the main app at it for next dev:
#    C:\Users\kumen\GodEye\.env.local
#    TERMINAL_URL=http://127.0.0.1:8787
#    TERMINAL_TOKEN=dev-shared-token-change-me
```

## Deploy

```sh
cd workers/terminal && npx wrangler deploy   # deploys godseye-terminal
# then set the SAME token as a secret in the main app:
npx wrangler secret put TERMINAL_TOKEN
```

The main worker already declares the `TERMINAL_BACKEND` service binding to
`godseye-terminal` (see the root `wrangler.jsonc`). After both deploys the
browser terminal works on any device — each user keeps their own sandbox for
10 minutes between commands.
