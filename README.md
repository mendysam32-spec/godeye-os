# GodEye OS — by S&P Group

Workforce OS that sees everything. Cloud + Windows App • Any LLM (Nvidia, OpenRouter, OmeRoute, OpenAI, Anthropic + 8 more)

**Live:** https://godeye-os.grade-up.workers.dev

## Features
- **Projects** — Create, view, filter, archive. Stored locally + cloud. Dashboard is fully responsive (mobile/tablet/desktop)
- **Workforce** — Multi-model crews fan out in parallel to any provider
- **Chat** — 7 modes (coding/image/plan/search/chat/research/terminal) with file upload + streaming
- **Providers Vault** — 11 providers, live verified via `POST /api/providers/test`
- **5 Themes** — Light, Dark, Glass (frosted modern), Midnight (navy premium), Aurora (cream warm) + accent + density
- **Responsive** — Mobile drawer, adaptive grids, touch-friendly

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
Next.js 16, React 19, Zustand, Tailwind 4, OpenNext Cloudflare, Wrangler 4
