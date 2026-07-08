# Beamlink — agent instructions

Open-source music smartlinks on Cloudflare Workers. Develop here; deployment forks sync from this repo.

## Quick commands

```sh
bun install
bun run dev          # local D1 migrations + astro dev
bun run test         # vitest
bun run build        # astro check + build
bun run deploy       # build + wrangler deploy
```

## AI integration

For self-hosting with a coding assistant, use the copy-paste prompt:

- **Web UI:** https://derpcatmusic.github.io/beamlink/ai.html
- **Raw prompt:** `docs/ai-integration-prompt.txt`
- **Doc index:** https://derpcatmusic.github.io/beamlink/llms.txt
- **Full bundle:** https://derpcatmusic.github.io/beamlink/llms-full.txt

## Architecture

- `src/worker.ts` — Worker entry (fetch, queue consumer, scheduled CAPI retry)
- `src/lib/tracking.ts` — Meta CAPI, cookies, attribution
- `src/lib/db.ts` — D1 + KV publish cache
- `src/pages/[slug].astro` — fan smartlink page (server-rendered, no client framework)
- `wrangler.jsonc` — Cloudflare bindings (D1, KV, R2, Queues)

## Constraints (do not break)

- Fan pages must stay server-rendered HTML — no React/Vue on `/:slug`
- Meta tracking is server-side CAPI with queue delivery — do not replace with browser-only pixel
- Bot traffic excluded from metrics (`src/lib/bots.ts`)
- `WORKER_NAME` wrangler var drives onboarding resource naming

## Deployment fork

Personal Dolmen Gate deploy: https://github.com/DerpcatMusic/music-shortlink — sync via `./scripts/sync-from-beamlink.sh`, keep fork `wrangler.jsonc` and domain.

## Docs

https://derpcatmusic.github.io/beamlink/
