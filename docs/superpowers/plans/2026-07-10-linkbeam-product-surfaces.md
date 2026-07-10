# Linkbeam Product Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make fan pages, the editor, and marketing fast, truthful, accessible, and visually specific to Linkbeam.

**Architecture:** Replace the oversized ASCII SVG fallback with a compact tile, add preset helpers around the existing style model, centralize visible pre-release vocabulary, then simplify marketing around live product artifacts and responsive semantic controls.

**Tech Stack:** Astro components, vanilla TypeScript, CSS/OKLCH tokens, Vitest, server-rendered Cloudflare pages.

## Global Constraints

- Fan routes remain server-rendered HTML with no client framework.
- Normal fan HTML ≤30 KB; ASCII fan HTML ≤40 KB; editor HTML ≤100 KB; preview HTML ≤40 KB.
- Visible `Pre-save` claims become truthful `Pre-release`, `Pre-release taps`, or `Email signups` wording.
- Three initial presets: Clean, Color, Bold; every existing saved combination remains editable.
- Public/marketing touch targets and mobile admin targets are at least 44×44 CSS pixels.
- Marketing uses no Google Fonts, aurora field, decorative grid overlay, border-plus-wide-shadow card, or unsupported fixed speed claim.

---

### Task 1: Compact ASCII fallback and payload budgets

**Files:**
- Modify: `src/lib/ascii-mosaic.ts`
- Modify: `src/lib/page-style.ts`
- Modify: `src/components/PageStyleFields.astro`
- Modify: `src/components/SmartlinkFanPage.astro`
- Modify: `test/page-style.test.ts`
- Create: `test/payload-budget.test.ts`

**Interfaces:**
- Produces: `compactAsciiPatternDataUri(vars, contrast): string` below 4 KB.
- Removes production use of per-cell SVG `<text>` serialization.

- [ ] **Step 1: Write failing compact-pattern and response-budget tests**

```ts
it("keeps the encoded ASCII fallback below 4 KB", () => {
  expect(compactAsciiPatternDataUri(STYLE_CARD_PREVIEW_PALETTE, 0.7).length).toBeLessThan(4_000);
});

it("keeps every preview style below 40 KB", async () => {
  for (const style of PAGE_BACKGROUND_STYLES) expect((await renderPreview(style)).length).toBeLessThan(40_000);
});
```

- [ ] **Step 2: Verify payload tests fail on the 700 KB fallback**

Run: `bunx vitest run test/page-style.test.ts test/payload-budget.test.ts`
Expected: FAIL with the ASCII size above 700,000 bytes.

- [ ] **Step 3: Implement a compact fixed tile and reuse it in editor/public fallback**

```ts
export function compactAsciiPatternDataUri(vars: TrackPaletteVars, contrast = 0.7): string {
  const glyphs = ["@", "#", "+", ":", ".", "*", "=", "%"];
  const text = glyphs.map((glyph, index) => `<text x="${2 + (index % 4) * 9}" y="${9 + Math.floor(index / 4) * 10}">${glyph}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="22"><g fill="${escapeXml(vars['--primary'] ?? '#fff')}" opacity="${contrast}">${text}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
```

Keep artwork-aware canvas enhancement unchanged and remove the large pattern calculation from every editor render.

- [ ] **Step 4: Run style, preview, and budget tests**

Run: `bunx vitest run test/page-style.test.ts test/page-style-options.test.ts test/preview-draft.test.ts test/payload-budget.test.ts`
Expected: PASS with all four budgets under their limits.

- [ ] **Step 5: Commit the performance fix**

```bash
git add src/lib/ascii-mosaic.ts src/lib/page-style.ts src/components/PageStyleFields.astro src/components/SmartlinkFanPage.astro test/page-style.test.ts test/payload-budget.test.ts
git commit -m "perf: shrink ASCII fan-page fallbacks"
```

### Task 2: Curated appearance presets and Advanced disclosure

**Files:**
- Modify: `src/lib/page-style.ts`
- Modify: `src/components/PageStyleFields.astro`
- Modify: `src/components/LinkEditorPreviewScript.astro`
- Modify: `test/page-style.test.ts`

**Interfaces:**
- Produces: `APPEARANCE_PRESETS`, `appearancePresetFor(background, button): AppearancePresetId | "custom"`.

- [ ] **Step 1: Write failing preset mapping and custom-state tests**

```ts
it.each([
  ["blur", "monochrome", "clean"],
  ["mesh", "logo-color", "color"],
  ["vinyl", "full-color", "bold"],
  ["ascii", "colored-border", "custom"]
])("maps %s/%s to %s", (background, buttons, expected) => {
  expect(appearancePresetFor(background, buttons)).toBe(expected);
});
```

- [ ] **Step 2: Verify the helper is missing**

Run: `bunx vitest run test/page-style.test.ts -t 'maps'`
Expected: FAIL.

- [ ] **Step 3: Implement presets, custom detection, and disclosure**

```ts
export const APPEARANCE_PRESETS = {
  clean: { label: "Clean", background: "blur", buttons: "monochrome" },
  color: { label: "Color", background: "mesh", buttons: "logo-color" },
  bold: { label: "Bold", background: "vinyl", buttons: "full-color" }
} as const;
```

Render three native radio cards first. Put the existing full background/button grids and knobs in `<details open={activePreset === 'custom'}>`. Selecting a preset updates both underlying native radio groups and the preview.

- [ ] **Step 4: Run style and build verification**

Run: `bunx vitest run test/page-style.test.ts test/preview-draft.test.ts && bun run build`
Expected: PASS and zero Astro diagnostics.

- [ ] **Step 5: Commit the distilled editor**

```bash
git add src/lib/page-style.ts src/components/PageStyleFields.astro src/components/LinkEditorPreviewScript.astro test/page-style.test.ts
git commit -m "feat: add curated appearance presets"
```

### Task 3: Truthful pre-release and email-signup vocabulary

**Files:**
- Modify: `src/lib/effective-mode.ts`
- Modify: `src/components/SmartlinkFanPage.astro`
- Modify: `src/pages/admin/index.astro`
- Modify: `src/pages/admin/links/new.astro`
- Modify: `src/pages/admin/links/[id]/edit.astro`
- Modify: `src/pages/admin/links/[id]/index.astro`
- Modify: `src/components/Chart.astro`
- Modify: `src/lib/stats.ts`
- Modify: `test/page-style.test.ts`
- Modify: `test/stats.test.ts`
- Modify: `README.md`
- Modify: `PRODUCT.md`
- Modify: `DESIGN.md`
- Modify: `docs/index.html`
- Modify: `docs/ai.html`
- Modify: `docs/getting-started.html`
- Modify: `docs/configuration.html`
- Modify: `docs/admin.html`
- Modify: `docs/tracking.html`
- Modify: `docs/llms.txt`
- Modify: `docs/llms-full.txt`
- Modify: `docs/ai-integration-prompt.txt`

**Interfaces:**
- Replaces: `presaveDestinationLabel` with `preReleaseDestinationLabel` returning `Open on <platform>`.
- Produces presentation labels without changing stored mode/event values.

- [ ] **Step 1: Write failing vocabulary tests**

```ts
it("uses truthful pre-release destination labels", () => {
  expect(preReleaseDestinationLabel("Spotify", "presave")).toBe("Open on Spotify");
  expect(preReleaseDestinationLabel("Spotify", "live")).toBe("Spotify");
});
```

- [ ] **Step 2: Verify legacy wording fails the tests**

Run: `bunx vitest run test/page-style.test.ts test/stats.test.ts`
Expected: FAIL on `Pre-save on Spotify` and `Pre-saves` labels.

- [ ] **Step 3: Implement presentation mapping and public disclosure**

```ts
export function preReleaseDestinationLabel(platformLabel: string, mode: LinkMode): string {
  return mode === "presave" ? `Open on ${platformLabel}` : platformLabel;
}
```

Use `Pre-release`, `Coming soon`, `Pre-release taps`, and `Email signups` in visible UI. Change form CTA to `Join list` and add: `Your email is shared with this link's owner for release updates.` Keep database/event compatibility values unchanged.

- [ ] **Step 4: Run vocabulary scan, tests, and build**

Run: `! rg -n 'Pre-save|Pre-saves|presaves' src --glob '*.astro' && bun run test && bun run build`
Expected: no visible legacy matches; all tests/build pass.

- [ ] **Step 5: Commit truthful product language**

```bash
git add src README.md PRODUCT.md DESIGN.md docs test
git commit -m "fix: describe pre-release behavior truthfully"
```

### Task 4: Distinctive, restrained marketing system

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/layouts/MarketingLayout.astro`
- Modify: `src/styles/marketing.css`
- Modify: `docs/index.html`
- Modify: `docs/assets/docs.css`
- Modify: `test/project-cleanliness.test.ts`

**Interfaces:**
- Preserves: live fan-page iframe and GitHub/admin CTAs.
- Removes: Google Fonts, aurora backdrop, grid overlays, fixed speed claim.

- [ ] **Step 1: Add failing anti-pattern and external-font assertions**

```ts
it("keeps marketing free of banned decoration and remote fonts", () => {
  expect(marketingLayout).not.toContain("fonts.googleapis.com");
  expect(marketingCss).not.toMatch(/m-aurora|background-size:\s*(40|48)px\s+(40|48)px/);
  expect(marketingPage).not.toContain("Loads in ~150ms");
});
```

- [ ] **Step 2: Verify current marketing fails**

Run: `bunx vitest run test/project-cleanliness.test.ts`
Expected: FAIL on Google Fonts, aurora/grid selectors, and speed copy.

- [ ] **Step 3: Recompose marketing around product artifacts**

```astro
<div class="m-proof" aria-label="What Linkbeam ships">
  <span>Edge-rendered HTML</span>
  <span>Server-side Meta events</span>
  <span>Your Cloudflare account</span>
</div>
```

Use the existing live fan iframe, one compact analytics artifact, a single solid blue beam rule, system typography, ≤16px panels, and border-only or ≤8px shadows. Update the static docs homepage to the same content hierarchy.

- [ ] **Step 4: Run detector, tests, and build**

Run: `node /home/derpcat/.agents/skills/impeccable/scripts/detect.mjs --json src/pages/index.astro src/layouts/MarketingLayout.astro && bunx vitest run test/project-cleanliness.test.ts && bun run build`
Expected: no grid/glow/over-round findings; tests/build pass.

- [ ] **Step 5: Commit marketing redesign**

```bash
git add src/pages/index.astro src/layouts/MarketingLayout.astro src/styles/marketing.css docs/index.html docs/assets/docs.css test/project-cleanliness.test.ts
git commit -m "feat: give Linkbeam a restrained product-led homepage"
```

### Task 5: Accessible touch targets, comparison semantics, and mobile navigation

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/styles/marketing.css`
- Modify: `src/components/AnalyticsTabs.astro`
- Modify: `src/pages/index.astro`
- Modify: `test/project-cleanliness.test.ts`

**Interfaces:**
- Produces mobile rules with 44px minimum targets while retaining desktop admin density.

- [ ] **Step 1: Add failing markup/style assertions**

```ts
it("keeps mobile controls and marketing comparison accessible", () => {
  expect(globalCss).toMatch(/@media[^}]+max-width:[^}]+\.button[^}]+min-height:\s*2\.75rem/s);
  expect(marketingPage).toContain("<table");
  expect(marketingPage).toContain('aria-label="Open navigation"');
});
```

- [ ] **Step 2: Verify current UI fails**

Run: `bunx vitest run test/project-cleanliness.test.ts`
Expected: FAIL because controls remain 28–36px and comparison/nav semantics are missing.

- [ ] **Step 3: Implement responsive targets and semantic structures**

```css
@media (max-width: 720px), (pointer: coarse) {
  .button, .tab-chip, .range, .admin-filters select { min-height: 2.75rem; }
  .button.icon-only { width: 2.75rem; min-width: 2.75rem; }
}
```

Render the comparison as a table with real column headers. Add a labelled mobile navigation disclosure that retains What it does, Why Linkbeam, Run it yourself, Admin, and GitHub.

- [ ] **Step 4: Run full product-surface gate**

Run: `bun run test && bun run build && bun run smoke`
Expected: all tests pass, budgets hold, built routes return expected statuses.

- [ ] **Step 5: Commit accessibility improvements**

```bash
git add src/styles/global.css src/styles/marketing.css src/components/AnalyticsTabs.astro src/pages/index.astro test/project-cleanliness.test.ts
git commit -m "fix: improve mobile and keyboard accessibility"
```
