# Linkbeam Design System

Brand tokens and surface rules for the Linkbeam admin (instrument panel) and marketing shell. Public fan link pages follow **release-first** branding per `PRODUCT.md` — artwork-derived palettes only, no Linkbeam marks.

## Brand

| Token | Value |
|-------|-------|
| Name | Linkbeam |
| Domain | GitHub project home |
| Tagline | Fast first-party music smartlinks |
| Voice | Precise, fast, understated |

## Color — Admin (instrument panel)

Defined in `src/styles/global.css`. Single neutral hue (~265° oklch) for elevation; one accent blue for CTAs and focus.

| Token | Role |
|-------|------|
| `--background` | Page canvas |
| `--surface` / `--surface-2` / `--surface-3` | Raised panels, controls, popovers |
| `--inset` | Inputs, code wells |
| `--foreground` / `--muted` / `--faint` | Text hierarchy |
| `--accent` | Primary CTA, focus ring, selection |
| `--success` / `--warn` / `--danger` | Status, series colors |

Accent is the only chromatic brand color in admin. Avoid gradient heroes, purple SaaS defaults, and decorative glow.

## Color — Marketing

When a public marketing or docs surface ships, use:

- Background: same neutral dark as admin (`--background`)
- Text: `--foreground` on dark, high contrast
- Accent: `--accent` for links and primary buttons only
- No competing gradients or illustration-heavy hero sections

## Typography

| Context | Stack | Scale |
|---------|-------|-------|
| Admin UI | Inter, system-ui | `--text-xs` … `--text-2xl` (1.125 ratio) |
| Fan pages | Inter, system-ui | Release title prominent; platform labels secondary |
| Code / slugs | `--mono` | Tabular numbers in metrics |

## Layout

- **Admin:** `.shell` max-width container, `.admin-panel` cards, compact `.link-row` tables.
- **Fan pages:** Centered single column, artwork-forward, minimal chrome.

## Motion

- `--transition-fast` (150ms) for hovers and focus only.
- Respect `prefers-reduced-motion` (global.css).

## Logo & wordmark

Text wordmark **Linkbeam** in admin eyebrow (`login.astro`, list header). No logo asset required for v1; lowercase `linkbeam` in URLs and package names.

## Public pages (do not)

- No Linkbeam wordmark, footer, or “powered by” on `/:slug` fan pages.
- Palette comes from track artwork via `parseTrackPalette()`.
