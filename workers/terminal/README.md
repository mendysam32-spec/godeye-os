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
#    TERMINAL_TOKEN=<a local dev token; also set it for `wrangler dev`>
```

## Deploy

`TERMINAL_TOKEN` is a secret, never a `vars` entry. Set the same value on both
workers:

```sh
cd workers/terminal && npx wrangler deploy   # deploys godseye-terminal
npx wrangler secret put TERMINAL_TOKEN -c wrangler.jsonc
# then, from the repo root, the SAME token for the main app:
npx wrangler secret put TERMINAL_TOKEN
```

The main worker already declares the `TERMINAL_BACKEND` service binding to
`godseye-terminal` (see the root `wrangler.jsonc`). After both deploys the
browser terminal works on any device — each user keeps their own sandbox for
10 minutes between commands.

### Known issue: "container application settings" error on the free plan

`wrangler deploy` uploads the Worker fine, then fails with:

> The Worker version was deployed, but Wrangler could not finish applying its
> Durable Object-managed Container application settings.

The API response body is the real reason:

> Unauthorized: You do not have access to Cloudflare Containers. Deploying
> containers requires the Workers Paid plan.

- **Cause** — the account is on the Workers **Free** plan. The Containers API
  (`/containers/applications/*`) is plan-gated and refuses *all* calls, even
  reads (`wrangler containers list` fails the same way). OAuth scopes
  (`containers (write)`) don't help; newer wrangler versions behave the same.
- **Impact** — cosmetic at deploy time. The Worker code deploys and the existing
  container application (created before the gate) keeps running; `POST /ping`
  verifies `running: true` through the service binding.
- **Risk** — container *settings* can never be changed (scheduling policy,
  image updates, instance limits) and if Cloudflare ever tears the application
  down it may not be recreatable until the plan allows it.
- **Proper fix** — upgrade to the Workers Paid plan
  (`https://dash.cloudflare.com/?to=/:account/workers/plans`), then re-run the
  deploy. Verified empirically on wrangler 4.133.0 and 4.160.0 (2026-11-11).
