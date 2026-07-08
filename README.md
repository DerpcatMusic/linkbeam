# Beamlink

**Fast first-party music smartlinks** — self-hosted on Cloudflare Workers with edge-rendered link pages, first-party analytics, and server-side Meta Pixel/CAPI.

**Documentation:** [derpcatmusic.github.io/beamlink](https://derpcatmusic.github.io/beamlink)  
**Repository:** [github.com/DerpcatMusic/beamlink](https://github.com/DerpcatMusic/beamlink)

## Stack

- Astro server output on Cloudflare Workers
- D1 for artists, tracks, links, destinations, and daily rollups
- KV for published link cache
- R2 for owned artwork storage
- Cloudflare Queues for async Meta CAPI delivery
- Cloudflare Access or password gate for `/admin/*`

Workers Analytics Engine is supported but optional (commented out in `wrangler.jsonc` by default).

## Quick start

See the [getting started guide](https://derpcatmusic.github.io/beamlink/getting-started.html) for full setup. Short version:

```sh
bun install
# create D1, KV, R2, queues — see wrangler.jsonc
bun run db:migrate:local
bun run dev
```

## Docs

| Guide | Description |
|-------|-------------|
| [Getting started](https://derpcatmusic.github.io/beamlink/getting-started.html) | Install, resources, migrations, deploy |
| [Configuration](https://derpcatmusic.github.io/beamlink/configuration.html) | Bindings, vars, secrets, routes |
| [Admin workflow](https://derpcatmusic.github.io/beamlink/admin.html) | Create and publish smartlinks |
| [Meta tracking](https://derpcatmusic.github.io/beamlink/tracking.html) | Pixel, CAPI, cookies, troubleshooting |

## Workflow

1. Open `/admin`.
2. Create a new link.
3. Paste a TooLost, Spotify, or Apple Music URL.
4. Fill missing ISRC/title/artist if the provider does not expose them.
5. Add platform destinations.
6. Publish the link.

Published links resolve at `/:slug`; outbound clicks resolve at `/out/:slug/:platform` (short alias `/d/:slug/:platform`).

## Deployment fork

If you run a personal deployment with existing Cloudflare resources (e.g. the [music-shortlink](https://github.com/DerpcatMusic/music-shortlink) fork), develop features in this repo and sync into your fork. See that repo's `docs/deployment-workflow.md`.

## License

MIT — see [LICENSE](LICENSE).
