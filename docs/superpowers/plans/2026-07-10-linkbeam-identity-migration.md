# Linkbeam Identity Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Linkbeam the canonical product/repository identity while preserving legacy source aliases and all existing Dolmen Gate resources.

**Architecture:** Centralize brand constants, migrate visible/source namespaces, retain narrow compatibility aliases, update generated/static docs, then update the deployment fork and perform the remote repository cutover only after both repos verify cleanly.

**Tech Stack:** Astro/TypeScript/CSS, Bash sync tooling, Git/GitHub Pages, Cloudflare configuration.

## Global Constraints

- Product name is `Linkbeam`; canonical technical slug is `linkbeam`.
- Existing production Worker, D1, KV, R2, Queue, table, metric, and record identifiers are not renamed.
- New-install defaults use `linkbeam`, `linkbeam-artwork`, and `linkbeam-conversions`.
- Legacy `--beamlink-*`, `.beamlink-*`, `BEAMLINK_DIR`, and old sync command remain until the next breaking release and at least 90 days.
- Parent repository changes land and verify before GitHub repository/Pages cutover.
- Fork-only config and the Dolmen Gate custom domain remain untouched by sync.

---

### Task 1: Canonical brand constants and user-facing rename

**Files:**
- Create: `src/lib/brand.ts`
- Create: `test/brand.test.ts`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/layouts/MarketingLayout.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/admin/login.astro`
- Modify: `src/pages/admin/onboarding.astro`
- Modify: `src/lib/onboarding.ts`
- Modify: `src/lib/platforms/open-graph.ts`
- Modify: `src/lib/platforms/odesli.ts`
- Modify: `public/favicon.svg`
- Modify: `package.json`

**Interfaces:**
- Produces constants: `PRODUCT_NAME`, `PRODUCT_SLUG`, `REPOSITORY_URL`, `DOCS_BASE_URL`, `DEFAULT_WORKER_NAME`, `USER_AGENT`.

- [ ] **Step 1: Write failing canonical-brand tests**

```ts
it("defines the canonical Linkbeam identity", () => {
  expect(PRODUCT_NAME).toBe("Linkbeam");
  expect(PRODUCT_SLUG).toBe("linkbeam");
  expect(REPOSITORY_URL).toBe("https://github.com/DerpcatMusic/linkbeam");
  expect(DEFAULT_WORKER_NAME).toBe("linkbeam");
});
```

- [ ] **Step 2: Verify brand module is missing**

Run: `bunx vitest run test/brand.test.ts`
Expected: FAIL because `src/lib/brand.ts` does not exist.

- [ ] **Step 3: Implement constants and migrate runtime-visible strings**

```ts
export const PRODUCT_NAME = "Linkbeam";
export const PRODUCT_SLUG = "linkbeam";
export const REPOSITORY_URL = "https://github.com/DerpcatMusic/linkbeam";
export const DOCS_BASE_URL = "https://derpcatmusic.github.io/linkbeam";
export const DEFAULT_WORKER_NAME = PRODUCT_SLUG;
export const USER_AGENT = `Linkbeam/1.0 (+${REPOSITORY_URL})`;
```

Use the constants in layouts, marketing, onboarding, and outbound provider requests. Set package name and favicon label to Linkbeam.

- [ ] **Step 4: Run brand/onboarding tests and build**

Run: `bunx vitest run test/brand.test.ts test/onboarding.test.ts && bun run build`
Expected: PASS and zero Astro diagnostics.

- [ ] **Step 5: Commit canonical identity**

```bash
git add src/lib/brand.ts test/brand.test.ts src/layouts src/pages/index.astro src/pages/admin/login.astro src/pages/admin/onboarding.astro src/lib/onboarding.ts src/lib/platforms/open-graph.ts src/lib/platforms/odesli.ts public/favicon.svg package.json
git commit -m "feat: make Linkbeam the canonical product identity"
```

### Task 2: CSS namespace migration with compatibility aliases

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/styles/marketing.css`
- Modify: `src/layouts/AdminLayout.astro`
- Modify: `src/layouts/LinkLayout.astro`
- Modify: `src/components/Badge.astro`
- Modify: `src/components/Button.astro`
- Modify: `src/components/Field.astro`
- Modify: `src/components/SmartlinkFanPage.astro`
- Modify: `src/pages/[slug].astro`
- Modify: `test/project-cleanliness.test.ts`

**Interfaces:**
- Canonical source uses `--linkbeam-*` and `.linkbeam-*`.
- Legacy tokens/classes resolve identically as aliases.

- [ ] **Step 1: Add failing alias/source-cleanliness tests**

```ts
it("defines Linkbeam tokens and legacy aliases", () => {
  expect(globalCss).toContain("--linkbeam-bg:");
  expect(globalCss).toContain("--beamlink-bg: var(--linkbeam-bg)");
  expect(globalCss).not.toMatch(/var\(--beamlink-/);
});
```

- [ ] **Step 2: Verify current namespace fails**

Run: `bunx vitest run test/project-cleanliness.test.ts`
Expected: FAIL because Beamlink is still canonical.

- [ ] **Step 3: Migrate canonical tokens/classes and add explicit aliases**

```css
:root {
  --linkbeam-bg: oklch(0.125 0.005 265);
  --beamlink-bg: var(--linkbeam-bg);
}

.linkbeam-link--embedded,
.beamlink-link--embedded { /* compatibility selector */ }
```

Mechanically migrate internal `var(--beamlink-*)` consumers to `var(--linkbeam-*)`; keep aliases only in the compatibility block.

- [ ] **Step 4: Run cleanliness, style, and build gates**

Run: `bunx vitest run test/project-cleanliness.test.ts test/page-style.test.ts && bun run build`
Expected: PASS; no unallowlisted canonical Beamlink usage.

- [ ] **Step 5: Commit namespace migration**

```bash
git add src/styles src/layouts/AdminLayout.astro src/layouts/LinkLayout.astro src/components src/pages/[slug].astro test/project-cleanliness.test.ts
git commit -m "refactor: migrate styles to the Linkbeam namespace"
```

### Task 3: New-install defaults, docs, and stale-brand guard

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `astro.config.mjs`
- Modify: `README.md`, `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`
- Modify: `docs/index.html`
- Modify: `docs/ai.html`
- Modify: `docs/getting-started.html`
- Modify: `docs/configuration.html`
- Modify: `docs/admin.html`
- Modify: `docs/tracking.html`
- Modify: `docs/llms.txt`
- Modify: `docs/llms-full.txt`
- Modify: `docs/ai-integration-prompt.txt`
- Modify: `docs/assets/docs.css`
- Modify: `test/project-cleanliness.test.ts`
- Modify: `test/onboarding.test.ts`

**Interfaces:**
- New installers receive Linkbeam resource commands.
- Historical specs and compatibility aliases are narrowly allowlisted.

- [ ] **Step 1: Add failing default-resource and stale-brand tests**

```ts
it("uses Linkbeam defaults for new installs", () => {
  expect(wrangler).toContain('"name": "linkbeam"');
  expect(wrangler).toContain('"bucket_name": "linkbeam-artwork"');
  expect(wranglerResourceCommands()).toContain("linkbeam-conversions");
});
```

- [ ] **Step 2: Verify old defaults fail**

Run: `bunx vitest run test/onboarding.test.ts test/project-cleanliness.test.ts`
Expected: FAIL on old Worker/resource names and docs strings.

- [ ] **Step 3: Migrate defaults/docs and implement the allowlisted scan**

```ts
const LEGACY_ALLOWED = [
  "docs/superpowers/specs/",
  "--beamlink-",
  ".beamlink-",
  "BEAMLINK_DIR",
  "sync-from-beamlink.sh"
];
```

Update every public URL/clone command to `DerpcatMusic/linkbeam` and `/linkbeam`. Keep historical specs intact and label the pre-rename design document historical.

- [ ] **Step 4: Run repo-wide search, tests, and build**

Run: `bun run test && bun run build && rg -n -i 'beamlink' --glob '!bun.lock'`
Expected: only compatibility/historical allowlist matches remain.

- [ ] **Step 5: Commit docs/default migration**

```bash
git add wrangler.jsonc astro.config.mjs README.md AGENTS.md PRODUCT.md DESIGN.md docs test/onboarding.test.ts test/project-cleanliness.test.ts
git commit -m "docs: rename Beamlink to Linkbeam"
```

### Task 4: Deployment-fork sync compatibility

**Files in `/home/derpcat/projects/music-shortlink`:**
- Create: `scripts/sync-from-linkbeam.sh`
- Modify: `scripts/sync-from-beamlink.sh`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/deployment-workflow.md`

**Interfaces:**
- Source resolution: `LINKBEAM_DIR`, `BEAMLINK_DIR`, `../linkbeam`, then `../beamlink`.
- Old script delegates to the new script.

- [ ] **Step 1: Write a failing shell resolution test**

```bash
tmp="$(mktemp -d)"
LINKBEAM_DIR=/missing BEAMLINK_DIR=/home/derpcat/projects/beamlink scripts/sync-from-linkbeam.sh --dry-run | rg 'legacy BEAMLINK_DIR'
```

- [ ] **Step 2: Verify the new command is missing**

Run from fork: `bash scripts/sync-from-linkbeam.sh --dry-run`
Expected: FAIL with file not found.

- [ ] **Step 3: Implement canonical sync, wrapper, dry-run, and docs**

```bash
SOURCE="${LINKBEAM_DIR:-${BEAMLINK_DIR:-}}"
for candidate in "$SOURCE" "$ROOT/../linkbeam" "$ROOT/../beamlink"; do
  [[ -n "$candidate" && -d "$candidate/.git" ]] && SOURCE="$candidate" && break
done
[[ -d "$SOURCE/.git" ]] || { printf 'Linkbeam source repo not found\n' >&2; exit 1; }
```

Preserve both sync scripts in the rsync exclude list. `--dry-run` passes rsync's dry-run flag and never restores/writes files.

- [ ] **Step 4: Run dry sync and fork verification**

Run: `LINKBEAM_DIR=/home/derpcat/projects/beamlink ./scripts/sync-from-linkbeam.sh --dry-run && bun install --frozen-lockfile && bun run test && bun run build`
Expected: dry run reports intended changes; fork tests/build pass; fork-only configs are unchanged.

- [ ] **Step 5: Commit fork compatibility**

```bash
git add scripts/sync-from-linkbeam.sh scripts/sync-from-beamlink.sh AGENTS.md README.md docs/deployment-workflow.md
git commit -m "chore: sync deployment fork from Linkbeam"
```

### Task 5: Parent/fork final gate and GitHub cutover

**Files:**
- No source changes expected; remote GitHub repository and local Git remotes change after verification.

**Interfaces:**
- Parent canonical remote: `https://github.com/DerpcatMusic/linkbeam.git`.
- Fork upstream remote name: `linkbeam`.

- [ ] **Step 1: Run both repository gates and confirm clean trees**

Run: `cd /home/derpcat/projects/beamlink && bun run test && bun run build && bun run smoke && git status --short`
Expected: all gates pass and no uncommitted files.

Run: `cd /home/derpcat/projects/music-shortlink && bun run test && bun run build && git status --short`
Expected: all gates pass and no uncommitted files.

- [ ] **Step 2: Push parent and fork commits before remote rename**

```bash
cd /home/derpcat/projects/beamlink && git push origin main
cd /home/derpcat/projects/music-shortlink && git push origin redesign/admin-and-smartlink
```

Expected: both pushes succeed.

- [ ] **Step 3: Rename the GitHub parent repository**

Run: `gh repo rename linkbeam --repo DerpcatMusic/beamlink --yes`
Expected: GitHub reports `DerpcatMusic/linkbeam`.

- [ ] **Step 4: Verify new/old repository and Pages routes before changing remotes**

Run: `git ls-remote https://github.com/DerpcatMusic/linkbeam.git HEAD && git ls-remote https://github.com/DerpcatMusic/beamlink.git HEAD && curl -fsSI https://derpcatmusic.github.io/linkbeam/`
Expected: both Git endpoints resolve to the same HEAD and new Pages returns 2xx/3xx. If the old Pages URL fails, stop and preserve it with a minimal redirect repository before continuing.

- [ ] **Step 5: Update local remotes and verify**

```bash
cd /home/derpcat/projects/beamlink && git remote set-url origin https://github.com/DerpcatMusic/linkbeam.git
cd /home/derpcat/projects/music-shortlink && git remote rename beamlink linkbeam && git remote set-url linkbeam https://github.com/DerpcatMusic/linkbeam.git
git remote -v
```

- [ ] **Step 6: Commit any verified Pages redirect artifact separately and report cutover**

If no redirect artifact was required, do not create an empty commit. Report exact new/old URL status and Dolmen Gate resource preservation.
