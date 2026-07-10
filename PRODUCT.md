# Linkbeam

**Linkbeam on GitHub** — Fast first-party music smartlinks. Open source, self-hosted on Cloudflare.

## Register

product

## Users

- **Label owner / operator** — self-hosts Linkbeam, creates smartlinks and pre-release pages, wires them into Meta ad campaigns, checks analytics daily to steer spend. Fluent in tools like SubmitHub, Linkfire, feature.fm; expects dense, fast, no-hand-holding UI.
- **Fans** — arrive on the public link page from an Instagram/Facebook ad on a phone, in a feed-scrolling mindset. One job: get them to tap through to a streaming destination in under three seconds.

## Product Purpose

An open-source, self-hosted music smartlink + pre-release tool on Cloudflare Workers that beats Hypeddit/Linkfire/SubmitHub on two axes: page speed (edge-rendered, zero client framework) and pixel accuracy (first-party server-side Meta CAPI with server-set identifiers). Success = faster link pages than the incumbents, trustworthy per-campaign metrics, and ad optimization signals Meta can actually match.

## Brand Personality

Precise, fast, understated. The admin is an instrument panel, not a marketing site. The public page is a stage for the release: the track's own artwork and colors carry the identity; Linkbeam itself disappears.

## Anti-references

- Hypeddit: cluttered gates, stacked CTAs, popups, visual noise.
- Generic SaaS dashboard slop: hero metrics with gradient accents, identical card grids, purple-on-dark defaults.
- Linkfire's cookie-banner-heavy, script-laden public pages (slow, third-party-tracker feel).

## Design Principles

1. **The release is the brand.** Public pages derive their palette from the track artwork (Spotify visualIdentity colors); Linkbeam contributes typography and hierarchy, never competing decoration. No Linkbeam or operator branding on public fan pages.
2. **Speed is the feature.** Every byte of client JS must justify itself; server-rendered HTML is the default answer. No client framework, no chart library.
3. **Density over ceremony (admin).** Linear/Stripe-dashboard register: compact tables, tabular numbers, keyboard-reachable actions, no orchestrated animations. Linkbeam branding lives here only.
4. **Numbers must be trustworthy.** Metrics shown must match what was actually sent to Meta; bot traffic excluded; failures visible in the UI, never silent.
5. **Works without JS, better with it.** Charts, countdowns, and forms render server-side; small vanilla scripts enhance them.

## Accessibility & Inclusion

- WCAG AA contrast (4.5:1 body text) on both surfaces — including text over artwork-tinted backgrounds (enforce with a computed overlay/scrim, never raw artwork behind text).
- `prefers-reduced-motion` honored everywhere (already in global.css; keep it).
- Public page must be fully usable via keyboard and screen reader: destination links are real anchors, countdown has a text fallback, form has proper labels and live-region status.

## Open Source

Linkbeam is designed to be forked and self-hosted. Operators bring their own Cloudflare account, D1 database, KV namespace, and Meta credentials. The canonical project home is [github.com/DerpcatMusic/linkbeam](https://github.com/DerpcatMusic/linkbeam).
