# Linkbeam System Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden authentication, secrets, remote imports, subscriber data, analytics failure isolation, local development, and CI while preserving existing production data.

**Architecture:** Add focused helpers for password records, bounded remote fetches, subscriber privacy, analytics section results, and shared redirects. Keep Cloudflare-native bindings, server-rendered analytics, and compatibility with existing sessions and hashes.

**Tech Stack:** Astro 7, TypeScript 5.9, Cloudflare Workers/D1/KV/R2/Queues, Bun 1.3.14, Vitest 4.

## Global Constraints

- No VPS, paid backend, or client framework.
- Existing links, metrics, destinations, and retained subscribers must survive migrations.
- `META_ACCESS_TOKEN` is read only from a Worker secret.
- PBKDF2-HMAC-SHA256 uses 600,000 iterations, a 16-byte salt, and 32-byte digest.
- Generic HTML fetches are limited to 2 MB/8 seconds; artwork to 10 MB/12 seconds.
- Subscriber limit is five attempts per link/client per ten minutes using HMAC keys in `LINK_CACHE`.
- Primary analytics remain server-rendered and readable without JavaScript.

---

### Task 1: Bounded remote fetch boundary

**Files:**
- Create: `src/lib/safe-fetch.ts`
- Create: `test/safe-fetch.test.ts`
- Modify: `src/lib/platforms/open-graph.ts`
- Modify: `src/lib/platforms/spotify.ts`
- Modify: `src/lib/platforms/youtube.ts`
- Modify: `src/lib/platforms/apple.ts`
- Modify: `src/lib/platforms/isrc.ts`
- Modify: `src/lib/platforms/odesli.ts`
- Modify: `src/lib/artwork.ts`

**Interfaces:**
- Produces: `safeFetchText(url, options): Promise<{ text: string; response: Response }>`
- Produces: `safeFetchResponse(url, options): Promise<Response>` for fixed provider APIs.
- Produces: `safeFetchStream(url, options): Promise<Response>`
- Consumes: native Worker `fetch`, `AbortSignal.timeout`, and `URL`.

- [ ] **Step 1: Write failing URL, redirect, timeout, type, and size tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { safeFetchText, validateRemoteUrl } from "../src/lib/safe-fetch";

describe("safe remote fetch", () => {
  it.each(["http://127.0.0.1/x", "http://169.254.169.254/x", "http://localhost/x", "file:///tmp/x"])("rejects %s", (url) => {
    expect(() => validateRemoteUrl(url)).toThrow(/public http/i);
  });

  it("rejects oversized HTML", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(33), {
      headers: { "content-type": "text/html", "content-length": "33" }
    })));
    await expect(safeFetchText("https://music.example/release", { maxBytes: 32, timeoutMs: 100 })).rejects.toThrow(/too large/i);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `bunx vitest run test/safe-fetch.test.ts`
Expected: FAIL because `src/lib/safe-fetch.ts` does not exist.

- [ ] **Step 3: Implement validated, redirect-bounded, size-bounded fetches**

```ts
export function validateRemoteUrl(input: string): URL {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || isPrivateHost(url.hostname)) {
    throw new Error('Remote URL must use public HTTP or HTTPS.');
  }
  return url;
}

export async function safeFetchText(input: string, options: { maxBytes: number; timeoutMs: number; accept?: RegExp }) {
  const response = await fetchFollowingValidatedRedirects(validateRemoteUrl(input), options.timeoutMs, 5);
  assertContentType(response, options.accept ?? /^(text\/html|application\/xhtml\+xml)/i);
  return { text: await readBoundedBody(response, options.maxBytes), response };
}
```

The same module defines `isPrivateHost`, `fetchFollowingValidatedRedirects`, `assertContentType`, and `readBoundedBody`; each is private to the module and unit-tested through the three exports. Adopt `safeFetchText(..., { maxBytes: 2_000_000, timeoutMs: 8_000 })` in Open Graph and `safeFetchStream(..., { maxBytes: 10_000_000, timeoutMs: 12_000, accept: /^image\// })` before R2 storage. Fixed Spotify, YouTube, Apple, Deezer, and Odesli calls use `safeFetchResponse` with an explicit allowed hostname, 8-second timeout, and 2 MB response limit.

- [ ] **Step 4: Run focused and importer tests**

Run: `bunx vitest run test/safe-fetch.test.ts test/import-merge.test.ts test/odesli.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the fetch boundary**

```bash
git add src/lib/safe-fetch.ts src/lib/platforms src/lib/artwork.ts test/safe-fetch.test.ts
git commit -m "fix: bound remote metadata and artwork fetches"
```

### Task 2: Versioned PBKDF2 admin passwords

**Files:**
- Create: `scripts/hash-admin-password.mjs`
- Modify: `src/lib/admin-session.ts`
- Modify: `test/admin-session.test.ts`
- Modify: `package.json`
- Modify: `docs/getting-started.html`
- Modify: `docs/configuration.html`

**Interfaces:**
- Produces: `createAdminPasswordRecord(password, salt?): Promise<string>`
- Produces: `adminPasswordHashKind(value): "pbkdf2" | "legacy" | "invalid"`
- Preserves: `verifyAdminPassword(password, env): Promise<boolean>`.

- [ ] **Step 1: Add failing PBKDF2, malformed-record, and legacy tests**

```ts
it("creates and verifies PBKDF2 password records", async () => {
  const record = await createAdminPasswordRecord("correct horse", new Uint8Array(16).fill(7));
  expect(record).toMatch(/^pbkdf2_sha256\$600000\$/);
  await expect(verifyAdminPassword("correct horse", { ADMIN_PASSWORD_HASH: record })).resolves.toBe(true);
  await expect(verifyAdminPassword("wrong", { ADMIN_PASSWORD_HASH: record })).resolves.toBe(false);
});
```

- [ ] **Step 2: Verify the new test fails**

Run: `bunx vitest run test/admin-session.test.ts`
Expected: FAIL because `createAdminPasswordRecord` is not exported.

- [ ] **Step 3: Implement the versioned record and generator command**

```ts
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_BYTES = 32;

export async function createAdminPasswordRecord(password: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<string> {
  const digest = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_BYTES);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(digest)}`;
}
```

The script reads a password with hidden terminal input, prints only the record, and `package.json` exposes `"auth:hash": "bun scripts/hash-admin-password.mjs"`.

- [ ] **Step 4: Run auth tests and generator smoke check**

Run: `bunx vitest run test/admin-session.test.ts && printf 'test-password\n' | bun run auth:hash | rg '^pbkdf2_sha256\$600000\$'`
Expected: tests pass and one record line matches.

- [ ] **Step 5: Commit password hardening**

```bash
git add src/lib/admin-session.ts scripts/hash-admin-password.mjs test/admin-session.test.ts package.json docs/getting-started.html docs/configuration.html
git commit -m "feat: use versioned PBKDF2 admin passwords"
```

### Task 3: Worker-secret-only Meta access token

**Files:**
- Create: `migrations/0014_remove_stored_meta_token.sql`
- Modify: `src/lib/settings.ts`
- Modify: `src/pages/api/admin/settings.ts`
- Modify: `src/components/SettingsModal.astro`
- Modify: `src/pages/admin/settings.astro`
- Modify: `src/pages/admin/onboarding.astro`
- Modify: `src/lib/validation.ts`
- Modify: `test/tracking.test.ts`
- Modify: `docs/configuration.html`
- Modify: `docs/tracking.html`

**Interfaces:**
- `getMetaAccessToken(env)` returns only `env.META_ACCESS_TOKEN`.
- Settings GET returns `hasMetaAccessToken`; PATCH has no token field.

- [ ] **Step 1: Replace the stored-token precedence test with a failing secret-only test**

```ts
it("ignores a D1 token and reads the Worker secret", async () => {
  const env = settingsEnv({ meta_access_token: "stored-token" }, { META_ACCESS_TOKEN: "worker-secret" });
  await expect(getMetaAccessToken(env)).resolves.toBe("worker-secret");
});
```

- [ ] **Step 2: Verify focused failure**

Run: `bunx vitest run test/tracking.test.ts -t 'Worker secret'`
Expected: FAIL because the D1 value currently wins.

- [ ] **Step 3: Remove token writes/UI input and add cleanup migration**

```sql
DELETE FROM settings WHERE key = 'meta_access_token';
```

```ts
export async function getMetaAccessToken(env: RuntimeEnv): Promise<string | undefined> {
  return env.META_ACCESS_TOKEN?.trim() || undefined;
}
```

Replace token fields with configured status and a copyable `wrangler secret put META_ACCESS_TOKEN` command. Document: set secret, verify CAPI, then apply migration.

- [ ] **Step 4: Run settings/tracking tests and build**

Run: `bunx vitest run test/tracking.test.ts test/onboarding.test.ts && bun run build`
Expected: PASS with zero Astro diagnostics.

- [ ] **Step 5: Commit secret migration**

```bash
git add migrations/0014_remove_stored_meta_token.sql src/lib/settings.ts src/lib/validation.ts src/pages/api/admin/settings.ts src/components/SettingsModal.astro src/pages/admin/settings.astro src/pages/admin/onboarding.astro test/tracking.test.ts docs/configuration.html docs/tracking.html
git commit -m "fix: keep Meta access tokens in Worker secrets"
```

### Task 4: Subscriber abuse protection, deletion, and retention

**Files:**
- Create: `src/lib/subscriber-privacy.ts`
- Create: `test/subscriber-privacy.test.ts`
- Create: `src/pages/api/admin/links/[id]/subscribers/[subscriberId].ts`
- Create: `src/components/SubscriberManager.astro`
- Modify: `src/pages/api/subscribe.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/pages/admin/links/[id]/index.astro`
- Modify: `src/worker.ts`
- Modify: `src/env.d.ts`
- Modify: `wrangler.jsonc`
- Modify: `src/components/SmartlinkFanPage.astro`

**Interfaces:**
- Produces: `consumeSubscribeLimit(env, request, linkId): Promise<boolean>`.
- Produces: `deleteSubscriber(env, linkId, subscriberId): Promise<void>`.
- Produces: `deleteExpiredSubscribers(env, retentionDays): Promise<number>`.

- [ ] **Step 1: Write failing HMAC rate-limit, bot-before-write, retention, and delete tests**

```ts
it("allows five attempts and blocks the sixth for ten minutes", async () => {
  const env = privacyEnv();
  for (let count = 0; count < 5; count++) await expect(consumeSubscribeLimit(env, request, "link_1")).resolves.toBe(true);
  await expect(consumeSubscribeLimit(env, request, "link_1")).resolves.toBe(false);
  expect(env.keys.every((key) => !key.includes("203.0.113.8"))).toBe(true);
});
```

- [ ] **Step 2: Verify focused failure**

Run: `bunx vitest run test/subscriber-privacy.test.ts`
Expected: FAIL because the privacy helper does not exist.

- [ ] **Step 3: Implement the privacy boundary and API**

```ts
const WINDOW_SECONDS = 600;
const MAX_ATTEMPTS = 5;

export async function consumeSubscribeLimit(env: RuntimeEnv, request: Request, linkId: string): Promise<boolean> {
  const key = await hmacKey(env.RATE_LIMIT_SECRET, `${linkId}:${clientIpFromRequest(request) ?? 'unknown'}`);
  const count = Number(await env.LINK_CACHE.get(`subscribe-rate:${key}`) ?? 0);
  if (count >= MAX_ATTEMPTS) return false;
  await env.LINK_CACHE.put(`subscribe-rate:${key}`, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  return true;
}
```

Reject honeypot/bots and enforce the limit before `subscribeEmail`. Add scheduled retention after CAPI retry, plus authenticated DELETE for one subscriber. `SubscriberManager.astro` renders the signup count, CSV export, and a labelled delete button for each address; deletion requires a native confirmation dialog and replaces the row with a live-region success message.

- [ ] **Step 4: Run subscriber, DB, and tracking tests**

Run: `bunx vitest run test/subscriber-privacy.test.ts test/db.test.ts test/tracking.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit subscriber safety**

```bash
git add src/lib/subscriber-privacy.ts test/subscriber-privacy.test.ts src/pages/api/subscribe.ts src/pages/api/admin/links/[id]/subscribers/[subscriberId].ts src/lib/db.ts src/worker.ts src/env.d.ts wrangler.jsonc src/components/SmartlinkFanPage.astro src/components/SubscriberManager.astro src/pages/admin/links/[id]/index.astro
git commit -m "feat: protect and expire subscriber data"
```

### Task 5: Analytics failure isolation and redirect deduplication

**Files:**
- Create: `src/lib/analytics-loader.ts`
- Create: `src/lib/outbound-handler.ts`
- Create: `test/analytics-loader.test.ts`
- Create: `test/outbound-handler.test.ts`
- Create: `src/components/AnalyticsAudience.astro`
- Create: `src/components/AnalyticsAttribution.astro`
- Create: `src/components/AnalyticsMetaDelivery.astro`
- Modify: `src/pages/admin/links/[id]/index.astro`
- Modify: `src/pages/out/[slug]/[platform].ts`
- Modify: `src/pages/d/[slug]/[platform].ts`

**Interfaces:**
- Produces: `sectionResult(name, load): Promise<{ ok: true; value } | { ok: false; message }>`.
- Produces: `handleOutbound(context): Promise<Response>` consumed by both route aliases.

- [ ] **Step 1: Write failing section-isolation and route-equivalence tests**

```ts
it("keeps successful analytics sections when one loader rejects", async () => {
  const [core, meta] = await Promise.all([
    sectionResult("core", async () => ({ views: 2 })),
    sectionResult("meta", async () => { throw new Error("timeout"); })
  ]);
  expect(core).toEqual({ ok: true, value: { views: 2 } });
  expect(meta).toEqual({ ok: false, message: "Meta data is temporarily unavailable." });
});
```

- [ ] **Step 2: Verify new tests fail**

Run: `bunx vitest run test/analytics-loader.test.ts test/outbound-handler.test.ts`
Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement isolated loaders, components, and shared route handler**

```ts
export async function sectionResult<T>(name: AnalyticsSection, load: () => Promise<T>): Promise<SectionResult<T>> {
  try { return { ok: true, value: await load() }; }
  catch (error) {
    console.error(JSON.stringify({ operation: "analytics-section", section: name, error: safeError(error) }));
    return { ok: false, message: sectionMessage(name) };
  }
}
```

Move audience, attribution, and Meta delivery markup to focused components. Both alias route files export `GET = handleOutbound`.

- [ ] **Step 4: Run analytics/stats/redirect tests and build**

Run: `bunx vitest run test/analytics-loader.test.ts test/outbound-handler.test.ts test/stats.test.ts test/public-click-tracking.test.ts && bun run build`
Expected: PASS and zero Astro diagnostics.

- [ ] **Step 5: Commit analytics isolation**

```bash
git add src/lib/analytics-loader.ts src/lib/outbound-handler.ts test/analytics-loader.test.ts test/outbound-handler.test.ts src/components/AnalyticsAudience.astro src/components/AnalyticsAttribution.astro src/components/AnalyticsMetaDelivery.astro src/pages/admin/links/[id]/index.astro src/pages/out/[slug]/[platform].ts src/pages/d/[slug]/[platform].ts
git commit -m "refactor: isolate analytics and outbound handlers"
```

### Task 6: Reliable dev launcher, built-Worker smoke suite, and CI

**Files:**
- Create: `scripts/dev.mjs`
- Create: `scripts/smoke-worker.sh`
- Create: `.github/workflows/ci.yml`
- Create: `test/migrations.test.ts`
- Modify: `package.json`
- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**
- Produces commands: `bun run dev`, `bun run dev:background`, `bun run smoke`.

- [ ] **Step 1: Add a failing package-script cleanliness test**

```ts
it("pins Bun and exposes deterministic dev and smoke commands", () => {
  expect(pkg.packageManager).toBe("bun@1.3.14");
  expect(pkg.scripts.dev).toBe("wrangler d1 migrations apply DB --local && bun scripts/dev.mjs");
  expect(pkg.scripts.smoke).toBe("bash scripts/smoke-worker.sh");
});
```

- [ ] **Step 2: Verify the test fails**

Run: `bunx vitest run test/project-cleanliness.test.ts`
Expected: FAIL because package manager and scripts are absent.

- [ ] **Step 3: Implement launcher, smoke lifecycle, and CI workflow**

```js
import { dev } from "astro";
const server = await dev({ host: "127.0.0.1", port: Number(process.env.PORT ?? 4321) });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await server.stop(); process.exit(0); });
```

The shell smoke script builds, migrates `dist/server/wrangler.json`, starts Wrangler with a trap, waits on HTTP readiness, checks route statuses/payload budgets/exports, and exits nonzero with response/log context. CI runs frozen install, test, build, migrations, and smoke.

`test/migrations.test.ts` creates an in-memory pre-0014 schema fixture, applies the remaining SQL, and asserts that links, destinations, metrics, and retained subscribers remain while only the stored Meta token is removed.

- [ ] **Step 4: Run the full local gate**

Run: `bun run test && bun run build && bun run smoke`
Expected: 0 failures; homepage/admin/fan/redirect/ASCII probes pass; Wrangler exits cleanly.

- [ ] **Step 5: Commit workflow hardening**

```bash
git add scripts/dev.mjs scripts/smoke-worker.sh .github/workflows/ci.yml package.json AGENTS.md README.md test/project-cleanliness.test.ts test/migrations.test.ts
git commit -m "ci: verify the built Cloudflare worker"
```
