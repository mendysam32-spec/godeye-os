# MEDUSA OS — by S&P Group

Workforce OS that sees everything. Cloud + Windows App • Any LLM (Nvidia, OpenRouter, OmeRoute, OpenAI, Anthropic + 8 more)

**Live:** https://medusa-os.grade-up.workers.dev

## Features
- **Projects** — Create, view, filter, archive. Stored locally + cloud. Dashboard is fully responsive (mobile/tablet/desktop)
- **Workforce** — Multi-model crews fan out in parallel to any provider
- **Chat** — 8 modes (coding/image/plan/search/chat/research/terminal/video) with file upload + streaming
- **Skills** — Upload a `SKILL.md` pack (ZIP) and MEDUSA briefs the model with it. Ships with **Stickman** (code-rendered stickman films) and **Report Studio** (polished PDF + Word reports with charts); enabled skills are injected into every chat's system prompt and mirrored to `Documents/MEDUSA/skills` on desktop
- **Agent tools** — 18 tools across internet, APIs, database, files and system metrics (see below)
- **Voice** — Free dictation + read-aloud via the Web Speech API (no API keys)
- **Providers Vault** — 11 providers, live verified via `POST /api/providers/test`
- **8 Themes** - Porcelain, Sage, Sundial, Lilac (glass), Eclipse, Abyss, Ember, Vapor (synth dusk) + accent + density
- **Free / paid labels** - every model picker marks each model as Free or Paid; live provider lists use pricing metadata and the OpenRouter `:free` suffix
- **Responsive** — Mobile drawer, adaptive grids, touch-friendly

### Agent tools

Tools split by where they run. Definitions live in `src/lib/tools.ts`.

**Server-side** (`src/lib/web-tools.ts` → `POST /api/tools/run`) — need the network without CORS, the D1 binding, or a provider key that must stay off the client:

| Tool | What it does |
| --- | --- |
| `medusa_webSearch` | Keyless DuckDuckGo search → ranked titles, URLs, snippets |
| `medusa_fetchUrl` | Downloads a page and returns readable text (scripts/nav stripped), or JSON |
| `medusa_httpRequest` | Any REST call: method, headers, JSON body. `{{VAULT:openai}}` in a header injects a vault key server-side |
| `medusa_queryDb` | Read-only SQL against MEDUSA's D1 (`medusa_db`) |
| `medusa_listTables` | Tables, columns and row counts — call this before `medusa_queryDb` |
| `medusa_generateImage` | Real image generation from the chat's provider, saved to disk (desktop) or downloadable |

Safety rails: `safeUrl()` refuses non-http(s) and private/loopback/link-local/metadata addresses, requests time out at 20s, downloads are byte-capped, and `assertReadOnlySql()` rejects anything that is not a single `SELECT`/`WITH`/`PRAGMA` reader (including `WITH … INSERT`, multi-statement tricks and write keywords).

**Desktop-only** (Electron bridge) — need real disk and real metrics:

| Tool | What it does |
| --- | --- |
| `medusa_listDir` | Browse a folder (optionally recursive) with sizes and mtimes |
| `medusa_editFile` | Rewrite a file, or patch it with `find`/`replace` (`all` for every match) |
| `medusa_movePath` | Move or rename, falling back to copy+remove across volumes |
| `medusa_copyPath` | Copy a file or folder |
| `medusa_deletePath` | Delete a file/folder; refuses non-empty folders without `recursive`, supports `dryRun` |
| `medusa_systemStats` | CPU % (two-sample, per-core), memory, disk free, uptime, interfaces, network throughput |

Guards: clobbering an existing destination needs `overwrite`; symlinked directories are never traversed; binary files are refused for text edits.

In the browser these report a clear reason instead of failing silently.

## Skills

Skills are instruction packs — a folder with a `SKILL.md` manifest (YAML frontmatter + markdown) plus optional scripts and assets, the same convention Claude and OpenCode use.

- **Install** — `/skills` → *Install skill*, drop a `.zip` with `SKILL.md` at the root (or inside one top-level folder), or a single `SKILL.md`.
- **Storage** — metadata lives in the workspace store (persisted + synced); file bodies live in IndexedDB (`medusa-skills`), so a 1 MB pack does not touch the 5 MB localStorage quota.
- **Chat** — every enabled skill's manifest is appended to the system prompt by `POST /api/chat`. Files are listed, and when the desktop app has mirrored the pack to `Documents/MEDUSA/skills/<id>` the model can read and run it with `medusa_readFile` / `medusa_runCommand`.
- **Desktop mirror** — installing on the desktop app writes the whole pack to `Documents/MEDUSA/skills/<id>`; *Save to disk* re-writes it after an update.
- **Export / remove** — each skill can be re-exported as a ZIP or removed with its stored files.

### Bundled: Stickman

`public/skills/stickman.zip` is the MIT-licensed Stickman skill (engine, references, Python scripts, sound effects). The Skills page installs it automatically on first visit, or reinstall it from the built-in card. It renders cinematic stickman films from code and also writes voiceover scripts, YouTube titles and thumbnail prompts.

### Bundled: Report Studio

`public/skills/report-studio.zip` turns a brief, dataset or research question into a finished **PDF + DOCX** with a cover page, contents, styled headings, matplotlib charts, captioned tables and page numbers.

- **Source** — `skill-src/report-studio/` (manifest, Python renderers, runnable example).
- **Pack** — `npm run skills:pack` zips every folder in `skill-src/` into `public/skills/<id>.zip`.
- **Run** — the model writes a `report.json` spec, then runs `python scripts/build_report.py report.json --out report --preview` from the skill folder. `scripts/doctor.py` installs `python-docx`, `matplotlib` and Playwright Chromium if they are missing.
- **Fallback** — browser-only sessions (no desktop bridge) use the built-in `medusa_createPdf` / `medusa_createDocx` tools without charts.

Both built-in skills are seeded per-skill on first `/skills` visit; deleting one does not resurrect it on the next visit.


## Run locally
```bash
npm install
npm run dev # http://localhost:3000
```

## Deploy to Cloudflare Workers (online, fixes OpenRouter local vs online)
OpenRouter keys work both locally and online — server `fetch` to `https://openrouter.ai/api/v1`. Deploying makes it public and removes `localhost` limits.

```bash
npm run cf:build   # builds .open-next
npm run cf:deploy  # deploys to https://medusa-os.<subdomain>.workers.dev
# already deployed: https://medusa-os.grade-up.workers.dev
```

Config:
- `wrangler.jsonc` — Worker name `medusa-os`, `nodejs_compat`, assets `/.open-next/assets`
- `open-next.config.ts` — Cloudflare adapter
- `wrangler login` already authenticated as `mendysam32@gmail.com`

### Test OpenRouter online
```bash
curl -X POST https://medusa-os.grade-up.workers.dev/api/providers/test \
  -H "Content-Type: application/json" \
  -d '{"provider":"openrouter","apiKey":"sk-or-v1-..."}'
# -> {ok:true, message:"Connected"} with valid key
```

## Push to GitHub (host code online)
```bash
# create repo on github.com/new (name: medusa-os, no README)
git remote add origin https://github.com/<YOUR_USERNAME>/medusa-os.git
git push -u origin main
```

GitHub Actions auto-deploy is ready (`.github/workflows/deploy.yml`):
1. Add secrets in GitHub repo Settings > Secrets and variables > Actions:
   - `CLOUDFLARE_API_TOKEN` — create at https://dash.cloudflare.com/profile/api-tokens (Workers:Edit)
   - `CLOUDFLARE_ACCOUNT_ID` — `74d44c8ba83fe529f83b3e408e0366e1`
2. Push to `main` → auto builds & deploys to Cloudflare Workers

Alternatively connect Cloudflare Dashboard:
- Cloudflare > Workers & Pages > Create > Workers > Connect to Git > select `medusa-os` > Build `npx opennextjs-cloudflare build` > Deploy `npx opennextjs-cloudflare deploy`

## Adaptable to all screens
- Sidebar: desktop 260px, mobile fixed top bar + slide drawer
- Dashboard grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `p-4 md:p-6`, flex-col on mobile
- Glass theme uses `backdrop-blur(16px)` for modern clean look

## Stack
Next.js 16, React 19, Zustand, Tailwind 4, OpenNext Cloudflare, Wrangler 4, Electron 33

## Notes
- Voice (`src/lib/voice.ts`) uses the browser's built-in `SpeechRecognition` / `speechSynthesis`, so it is free and keyless but Chromium-only (Chrome, Edge, the desktop shell). The mic and speaker buttons hide themselves elsewhere.
- `medusa_queryDb` reads D1 only — it needs the deployed Worker, not `next dev`.
