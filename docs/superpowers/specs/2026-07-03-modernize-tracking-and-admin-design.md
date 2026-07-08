# Modernize pixel tracking, presave, and admin — design

## Context

Personal music shortlink tool (Astro on Cloudflare Workers, D1, KV, Analytics Engine, Meta
Pixel/CAPI) built to replace hypeddit/feature.fm/linkfire/submithub. Goal: stronger and more
accurate pixel tracking with a way to test it, a modernized admin UI with a real shortlink list,
a clear live vs. presave distinction, and a first phase that fixes existing correctness/security
gaps before adding features.

Current gaps identified in `src/lib/tracking.ts`, `src/lib/runtime.ts`, `src/pages/out/[slug]/[platform].ts`:

- `requireAdmin` only checks for the *presence* of the `cf-access-authenticated-user-email`
  header — it never validates the Cloudflare Access JWT, so the header is spoofable by anyone
  who can reach the origin directly.
- No bot filtering. Every crawler/preview-bot hit inflates view/click counts and fires pixel
  events.
- Live-mode outbound clicks and presave-mode outbound clicks both send Meta event name `Lead`
  (`src/pages/out/[slug]/[platform].ts:19`) — no differentiation between a real stream click and
  a presave action.
- `sendMetaBatch` throws on non-OK response but nothing catches/logs it outside the `waitUntil`
  — CAPI failures are silent and unrecoverable.
- Presave mode is cosmetic only: it's a label and a redirect. No countdown, no auto-transition to
  live at release, no capture of interested listeners.
- No way to test the pixel/CAPI configuration without firing a real production event and
  eyeballing Meta Events Manager.
- Admin list (`src/pages/admin/index.astro`) shows name/slug/status only — no views, clicks, CTR,
  or mode-at-a-glance.
- `_fbp`/`_fbc` are read from cookies but never *set* by the server, so if `fbevents.js` is
  blocked (ad blockers, Meta's own script failing to load) CAPI events carry no browser
  identifiers, which is exactly the accuracy edge a first-party tool should have over the
  giants' third-party-script-dependent approach.

## Planning

This spec covers four phases. They are implemented as a single implementation plan with four
sequential phases (not four separate plan documents) — each phase gets its own review checkpoint
during execution, but tracking stays in one plan for this solo project.

## Approach

Chosen: keep the existing inline `waitUntil`-based event pipeline (no Cloudflare Queues) and add
a `capi_log` D1 table for delivery tracking, pixel health reporting, and retries via a scheduled
Worker cron. This avoids new infrastructure (Queues, consumer workers) that isn't justified at
this traffic scale, while still giving accurate delivery visibility and a retry path for
transient CAPI failures.

Scope: Meta Pixel + CAPI only (no TikTok/GA4). Presave becomes a real countdown + email-capture +
auto-flip-to-live experience, but without Spotify OAuth save-to-library (that requires Spotify
app review and is out of scope). Admin dashboard shows per-link stats and pixel health, not full
UTM/geo reporting.

## Phase 1 — Hardening

**Goal:** fix correctness and security issues that would undermine any accuracy claims, before
building new features on top of them.

1. **Validate Cloudflare Access JWT.** `requireAdmin` (`src/lib/runtime.ts`) currently trusts the
   `cf-access-authenticated-user-email` header outright. Replace with real JWT verification:
   fetch and cache the team's JWKS (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`),
   verify the `cf-access-jwt-assertion` cookie/header against it, check `aud` matches the
   configured Access application audience tag, and check expiry. New env vars:
   `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`. Localhost/dev bypass unchanged.
2. **Bot filtering.** New `isBot(request): boolean` helper in `src/lib/tracking.ts` (or a new
   `src/lib/bots.ts`): true if `request.cf?.botManagement?.verdict` indicates a bot (when the
   field is present — Bot Management may not be enabled on all plans, so treat absence as
   "unknown, not bot") OR the User-Agent matches a denylist (facebookexternalhit, WhatsApp,
   Discordbot, Twitterbot, Slackbot, curl, headless, bot-like generic patterns). Bots still
   receive the redirect/page response (so link previews render) but skip pixel events and
   `daily_metrics` increments.
3. **Distinct event names per link, per action.** Add `view_event_name` and `click_event_name`
   columns to `links` (migration), replacing the single `meta_event_name`. `view_event_name`
   defaults to `'ViewContent'`. `click_event_name` is resolved dynamically at request time (not
   stored per-mode at creation): if the admin has set an explicit override, use it; otherwise
   default to `Lead` when the link's *current* effective mode (see Phase 3 item 1 auto-flip) is
   presave, or `Stream_Click` (a Meta custom event, still visible and usable as a custom
   conversion in Ads Manager) when live. This means a link's default click event name changes
   automatically when it flips from presave to live. Both fields are editable per link in the
   admin editor, overriding the dynamic default. Migration backfills existing `meta_event_name`
   values into `view_event_name`.
4. **CAPI delivery logging.** `migrations/0001_initial.sql` already defines a `capi_failures`
   table (`id, event_id, link_id, payload, error, created_at`) that no application code
   currently writes to or reads from. Replace it (new migration: `DROP TABLE capi_failures`,
   `CREATE TABLE capi_log`) rather than adding a parallel table — `capi_log` needs both success
   and failure rows for the health panel, not just failures. Columns: `id, event_id, link_id,
   kind, status ('sent'|'failed'), http_status, meta_trace_id, error_message, attempt,
   created_at`. Every `sendMetaBatch` call logs one row per event, whether it succeeds or throws.
   Failures are retried by a new scheduled Worker (`triggers.crons` in `wrangler.jsonc`, e.g.
   every 15 min): query `capi_log` for `status = 'failed' AND attempt < 3 AND created_at > now -
   24h`, rebuild and resend the event, log the retry attempt. Events older than 24h are
   abandoned (Meta CAPI rejects event_time beyond 7 days, but 24h is a reasonable operational
   cutoff for a personal tool).
5. **Cache correctness.** Purge `LINK_CACHE` entry immediately on archive (currently only done
   on update/publish). Drop published-link KV TTL from effectively-until-next-publish to 60s so
   admin edits (mode flips, destination changes) propagate quickly without needing a manual
   purge.
6. **Null-safe Analytics Engine writes.** `queueMetaEvent`'s `writeDataPoint` call passes
   `link.track.isrc` directly into `blobs`, which can be `null` — guard with `?? ""`.

## Phase 2 — Tracking accuracy

**Goal:** make pixel events as accurate as first-party server-side tracking can be, and give a
way to verify that without touching production data.

1. **Server-set first-party `_fbp`/`_fbc` cookies.** On every `/:slug` view, if `_fbp` cookie is
   absent, generate one in Meta's format (`fb.1.<timestamp>.<random>`) and set it as a
   first-party cookie on the response (`Set-Cookie`, `SameSite=Lax`, `Max-Age=7776000` [90d],
   `Secure`, not `HttpOnly` since `fbevents.js` also needs to read/write it client-side). If
   `fbclid` is present and no `_fbc` cookie exists, derive and set `_fbc` the same way (reusing
   existing `fbcFromFbclid`). This means CAPI events carry consistent browser identifiers even
   when `fbevents.js` is blocked by an ad blocker — the identifiers originate from the server,
   not a third-party script. This is the concrete accuracy advantage over hypeddit-style tools
   that rely entirely on client-side pixel firing.
2. **Base `PageView` event.** Pixel script fires standard `PageView` before the custom
   `view_event_name` event, matching standard Meta pixel behavior so Meta's automatic matching
   and campaign attribution work as expected.
3. **Pixel config moves into admin-editable settings.** New `settings` table (or reuse a single
   `app_settings` row: key/value) storing `meta_pixel_id` and `meta_test_event_code`, editable
   from a new `/admin/settings` page. `META_ACCESS_TOKEN` remains a Wrangler secret (never
   exposed to admin UI). Runtime resolution: DB setting overrides env var if present.
4. **Pixel tester.** New section on `/admin/settings` (or a dedicated `/admin/pixel-test` page):
   a "Send test event" button that POSTs to a new `src/pages/api/admin/test-pixel.ts` endpoint,
   which fires a synthetic `ViewContent` event through the *real* `sendMetaBatch` pipeline using
   the configured `meta_test_event_code`, then returns Meta's raw response (`events_received`,
   `fbtrace_id`, or error) rendered inline — plus a link to Meta Events Manager's Test Events
   tab. This lets pixel config be verified without polluting real link stats.
5. **CAPI health panel.** Also on `/admin/settings`: last 50 rows from `capi_log` (event kind,
   link, status, timestamp, error if any) so delivery problems are visible without leaving the
   admin.

## Phase 3 — Presave that means something

**Goal:** make presave links functionally distinct from live links, not just a label.

1. **Auto-flip at release.** `getPublishedLink` (or a wrapper around it) compares
   `track.release_at` to `Date.now()`: if the link's `mode` is `presave` and `release_at` has
   passed, treat it as `live` for rendering/event purposes without a DB write (a lazy read-time
   resolution, not a stored state change — avoids needing a cron just for the flip). This is the
   same `getPublishedLink` cache path touched by Phase 1 item 5 (60s TTL); the 60s TTL already
   established there is what keeps the flip visible promptly — no separate TTL logic needed here.
2. **Presave page variant.** When effective mode is `presave`: page shows a countdown to
   `release_at`, copy changes from "Listen now" to "Releases in...", destinations are labeled
   "Pre-save on Spotify" etc. (existing destination URLs, just relabeled), and a new email
   capture form appears above/alongside destinations.
3. **Email capture.** New `subscribers` table: `id, link_id, email, consented_at, source
   ('presave_form')`. New endpoint `src/pages/api/subscribe.ts` (POST, public) validates email
   format, inserts, and fires a `Lead` event (browser pixel + CAPI, deduped via shared
   `eventId`) distinct from the destination-click event. Basic rate limiting: reject if the same
   email+link_id already exists (idempotent, no duplicate event storms).
4. **Presave click event.** Outbound presave destination clicks
   (`src/pages/out/[slug]/[platform].ts`) fire `click_event_name` (default `Lead`, per Phase 1
   item 3) — already covered by the event-name split, no additional work beyond Phase 1.
5. **Admin CSV export.** `/admin/links/[id]` gets an "Export subscribers" link/button that
   streams a CSV of that link's `subscribers` rows.

## Phase 4 — Modern admin + dashboard

**Goal:** make the admin usable at a glance — see what's live, what's presave, what's working.

1. **Link list redesign** (`src/pages/admin/index.astro`): each row/card shows artwork
   thumbnail, link name, track/artist, a mode badge (presave = amber with days-to-release,
   live = green), status badge, 14-day view/click sparkline (inline SVG, server-rendered, no
   client JS/chart library), views/clicks/CTR numbers, and a copy-shortlink button. Add
   status/mode filter controls (client-side, no new endpoint needed since link count is small).
2. **Link detail redesign** (`src/pages/admin/links/[id].astro`): stats header (total views,
   clicks, CTR, presave email count), a 30-day daily bar chart (server-rendered inline SVG from
   `daily_metrics`), a per-platform breakdown table (clicks by destination), the Phase 2 pixel
   test/health panel, and the existing edit form restyled to match.
3. **Data access:** new `src/lib/stats.ts` with `getLinkStats(env, linkId)` (aggregates from
   `daily_metrics`) and `getLinkTimeseries(env, linkId, days)`. No new tables needed beyond what
   Phase 1/3 already add.
4. **Visual system:** stays within the existing oklch-token-based CSS in
   `src/styles/global.css` / `AppLayout.astro` — refined (spacing, badges, chart styling), not
   replaced with a new design system or UI framework.

## Testing

Extend `test/tracking.test.ts` and add new test files as needed:

- JWT validation: valid token passes, expired/wrong-`aud`/malformed tokens are rejected (mock
  JWKS response).
- Bot detection: known bot UAs rejected, normal browser UAs pass, missing `botManagement` field
  treated as not-bot.
- `_fbp`/`_fbc` cookie generation: correct format, only generated when absent, `fbclid` → `_fbc`
  derivation unchanged from existing behavior.
- Auto-flip logic: presave link before/after `release_at` resolves to correct effective mode.
- Event name resolution: correct `view_event_name`/`click_event_name` used per mode, falls back
  to defaults when unset.
- `capi_log` retry query: only picks up `failed` rows under attempt limit and within the time
  window.
- `api/subscribe.ts` idempotency: duplicate email+link_id submission does not insert a second
  row or fire a second `Lead` event; invalid email format is rejected.

Existing `test/id.test.ts` untouched.

## Explicitly out of scope (YAGNI)

- Spotify OAuth save-to-library presave (requires Spotify app review + token storage + release-
  day cron; a real feature but a separate project).
- Multi-pixel support (TikTok Events API, GA4, etc.) — Meta only for now.
- Cloudflare Queues or any new infrastructure beyond D1 tables and a cron trigger.
- UTM/referrer/geo breakdown reporting UI (Analytics Engine data exists but isn't surfaced beyond
  what's described above).
- Multi-user/team admin accounts — single Access-gated admin as today.
