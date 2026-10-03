# GodEye OS — by S&P Group

Workforce OS that sees everything. Cloud + Windows App • Any LLM (Nvidia, OpenRouter, OmeRoute, OpenAI, Anthropic + 8 more)

**Live:** https://godeye-os.grade-up.workers.dev

## Features
- **Projects** — Create, view, filter, archive. Stored locally + cloud. Dashboard is fully responsive (mobile/tablet/desktop)
- **Workforce** — Multi-model crews fan out in parallel to any provider
- **Chat** — 8 modes (coding/image/plan/search/chat/research/terminal/video) with file upload + streaming
- **Agent tools** — 18 tools across internet, APIs, database, files and system metrics (see below)
- **Voice** — Free dictation + read-aloud via the Web Speech API (no API keys)
- **Providers Vault** — 11 providers, live verified via `POST /api/providers/test`
- **5 Themes** — Light, Dark, Glass (frosted modern), Midnight (navy premium), Aurora (cream warm) + accent + density
- **Responsive** — Mobile drawer, adaptive grids, touch-friendly

### Agent tools

Tools split by where they run. Definitions live in `src/lib/tools.ts`.

**Server-side** (`src/lib/web-tools.ts` → `POST /api/tools/run`) — need the network without CORS, the D1 binding, or a provider key that must stay off the client:

| Tool | What it does |
| --- | --- |
| `godeye_webSearch` | Keyless DuckDuckGo search → ranked titles, URLs, snippets |
| `godeye_fetchUrl` | Downloads a page and returns readable text (scripts/nav stripped), or JSON |
| `godeye_httpRequest` | Any REST call: method, headers, JSON body. `{{VAULT:openai}}` in a header injects a vault key server-side |
| `godeye_queryDb` | Read-only SQL against GodEye's D1 (`godeye_db`) |
| `godeye_listTables` | Tables, columns and row counts — call this before `godeye_queryDb` |
| `godeye_generateImage` | Real image generation from the chat's provider, saved to disk (desktop) or downloadable |

Safety rails: `safeUrl()` refuses non-http(s) and private/loopback/link-local/metadata addresses, requests time out at 20s, downloads are byte-capped, and `assertReadOnlySql()` rejects anything that is not a single `SELECT`/`WITH`/`PRAGMA` reader (including `WITH … INSERT`, multi-statement tricks and write keywords).

**Desktop-only** (Electron bridge) — need real disk and real metrics:

| Tool | What it does |
| --- | --- |
| `godeye_listDir` | Browse a folder (optionally recursive) with sizes and mtimes |
| `godeye_editFile` | Rewrite a file, or patch it with `find`/`replace` (`all` for every match) |
| `godeye_movePath` | Move or rename, falling back to copy+remove across volumes |
| `godeye_copyPath` | Copy a file or folder |
| `godeye_deletePath` | Delete a file/folder; refuses non-empty folders without `recursive`, supports `dryRun` |
| `godeye_systemStats` | CPU % (two-sample, per-core), memory, disk free, uptime, interfaces, network throughput |

Guards: clobbering an existing destination needs `overwrite`; symlinked directories are never traversed; binary files are refused for text edits.

In the browser these report a clear reason instead of failing silently.


## Run locally
```bash
npm install
npm run dev # http://localhost:3000
```

## Deploy to Cloudflare Workers (online, fixes OpenRouter local vs online)
OpenRouter keys work both locally and online — server `fetch` to `https://openrouter.ai/api/v1`. Deploying makes it public and removes `localhost` limits.

```bash
npm run cf:build   # builds .open-next
npm run cf:deploy  # deploys to https://godeye-os.<subdomain>.workers.dev
# already deployed: https://godeye-os.grade-up.workers.dev
```

Config:
- `wrangler.jsonc` — Worker name `godeye-os`, `nodejs_compat`, assets `/.open-next/assets`
- `open-next.config.ts` — Cloudflare adapter
- `wrangler login` already authenticated as `mendysam32@gmail.com`

### Test OpenRouter online
```bash
curl -X POST https://godeye-os.grade-up.workers.dev/api/providers/test \
  -H "Content-Type: application/json" \
  -d '{"provider":"openrouter","apiKey":"sk-or-v1-..."}'
# -> {ok:true, message:"Connected"} with valid key
```

## Push to GitHub (host code online)
```bash
# create repo on github.com/new (name: godeye-os, no README)
git remote add origin https://github.com/<YOUR_USERNAME>/godeye-os.git
git push -u origin main
```

GitHub Actions auto-deploy is ready (`.github/workflows/deploy.yml`):
1. Add secrets in GitHub repo Settings > Secrets and variables > Actions:
   - `CLOUDFLARE_API_TOKEN` — create at https://dash.cloudflare.com/profile/api-tokens (Workers:Edit)
   - `CLOUDFLARE_ACCOUNT_ID` — `74d44c8ba83fe529f83b3e408e0366e1`
2. Push to `main` → auto builds & deploys to Cloudflare Workers

Alternatively connect Cloudflare Dashboard:
- Cloudflare > Workers & Pages > Create > Workers > Connect to Git > select `godeye-os` > Build `npx opennextjs-cloudflare build` > Deploy `npx opennextjs-cloudflare deploy`

## Adaptable to all screens
- Sidebar: desktop 260px, mobile fixed top bar + slide drawer
- Dashboard grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `p-4 md:p-6`, flex-col on mobile
- Glass theme uses `backdrop-blur(16px)` for modern clean look

## Stack
Next.js 16, React 19, Zustand, Tailwind 4, OpenNext Cloudflare, Wrangler 4, Electron 33

## Notes
- Voice (`src/lib/voice.ts`) uses the browser's built-in `SpeechRecognition` / `speechSynthesis`, so it is free and keyless but Chromium-only (Chrome, Edge, the desktop shell). The mic and speaker buttons hide themselves elsewhere.
- `godeye_queryDb` reads D1 only — it needs the deployed Worker, not `next dev`.
