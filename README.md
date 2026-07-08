# Beamlink

**Fast first-party music smartlinks** — self-hosted on Cloudflare Workers with edge-rendered link pages, first-party analytics, and server-side Meta Pixel/CAPI.

Canonical home: [github.com/DerpcatMusic/beamlink](https://github.com/DerpcatMusic/beamlink)

## Stack

- Astro server output on Cloudflare Workers
- D1 for artists, tracks, links, destinations, and daily rollups
- KV for published link cache
- R2 for owned artwork storage
- Workers Analytics Engine for raw event points
- Cloudflare Access or password gate for `/admin/*`

## Setup

```sh
bun install
wrangler d1 create beamlink
wrangler kv namespace create LINK_CACHE
wrangler r2 bucket create beamlink-artwork
wrangler queues create beamlink-conversions
wrangler queues create beamlink-conversions-dlq
```

Replace the placeholder IDs in `wrangler.jsonc`, then apply migrations:

```sh
bun run db:migrate:local
bun run db:migrate
```

Optional secrets:

```sh
wrangler secret put META_PIXEL_ID
wrangler secret put META_ACCESS_TOKEN
wrangler secret put SPOTIFY_CLIENT_ID
wrangler secret put SPOTIFY_CLIENT_SECRET
```

Without Spotify credentials, Spotify import falls back to oEmbed, which provides title/artwork but not ISRC. TooLost/manual import can still save ISRC-backed tracks.

## Migrating existing deploys

Update the placeholder IDs in `wrangler.jsonc`. Leave `PUBLIC_BASE_URL` empty to use the request origin, or set it to your deployed host. Keep `workers_dev` for a free `workers.dev` route, or replace it with a custom domain route when you bring your own domain.

## Workflow

1. Open `/admin`.
2. Create a new link.
3. Paste a TooLost, Spotify, or Apple Music URL.
4. Fill missing ISRC/title/artist if the provider does not expose them.
5. Add platform destinations.
6. Publish the link.

Published links resolve at `/:slug`; outbound clicks resolve at `/out/:slug/:platform`.

## License

See repository license file (open-source launch).
