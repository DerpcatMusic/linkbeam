# Meta Event Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep `ViewContent` optimization intact while optionally collecting `Stream_Click`, suppress duplicate ingress, and record Meta acceptance accurately.

**Architecture:** Add a controlled event contract to link configuration, emit a deterministic optional learning event beside the primary click event, and claim each server event in D1 before queue ingress. Keep Cloudflare Queue retries independent from ingress idempotency and make CAPI response parsing authoritative.

**Tech Stack:** Astro, TypeScript, Cloudflare Workers, Queues, D1, Vitest, Bun.

## Global Constraints

- Develop in `/home/derpcat/projects/beamlink`, then sync into the deployment fork.
- Preserve `ViewContent` as the default primary click event.
- Add only three production-critical behavioral tests; do not add coverage-only cases.
- Event names are controlled selections, never free text.

---

### Task 1: Controlled primary and learning events

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/validation.ts`, `src/lib/db.ts`, `src/lib/effective-mode.ts`
- Modify: `src/pages/admin/links/[id]/edit.astro`, `src/pages/[slug].astro`, `src/lib/outbound-handler.ts`
- Create: `migrations/0015_meta_event_integrity.sql`
- Test: `test/public-click-tracking.test.ts`

**Interfaces:**
- Produces: `learning_click_event_name: "ViewContent" | "Lead" | "Stream_Click" | null`
- Produces: `resolveLearningClickEventName(link): string | null`
- Produces: deterministic `learningEventId(primaryId, eventName): string`

- [ ] Write one integration assertion proving a configured tap renders and sends exactly `ViewContent` plus `Stream_Click`, with distinct stable IDs and no paid event.
- [ ] Run the focused test and verify it fails because the learning-event contract is absent.
- [ ] Add the migration, controlled validation, database mapping, dropdown UI, and dual browser/server emission; stop emitting `Stream_Click_Paid`.
- [ ] Run the focused test and existing database/outbound tests.

### Task 2: D1 ingress idempotency

**Files:**
- Modify: `src/lib/tracking.ts`, `src/lib/runtime.ts`, `src/worker.ts`
- Modify: `migrations/0015_meta_event_integrity.sql`
- Test: `test/tracking.test.ts`

**Interfaces:**
- Produces: `claimMetaEvent(env, event): Promise<boolean>` keyed by pixel ID, event name, and event ID.
- Produces: queue ingress that releases its claim on queue-send failure.

- [ ] Write one behavioral test proving two ingress calls with identical identity enqueue once, while the queued message remains independently deliverable.
- [ ] Run it and verify the current code enqueues twice.
- [ ] Implement the D1 claim, failure release, and seven-day scheduled cleanup.
- [ ] Run the focused test and tracking suite.

### Task 3: Truthful CAPI acceptance

**Files:**
- Modify: `src/lib/tracking.ts`, `src/lib/capi-log.ts`
- Modify: `migrations/0015_meta_event_integrity.sql`
- Test: `test/tracking.test.ts`

**Interfaces:**
- Extends `SendMetaBatchResult` with `eventsReceived?: number` and `messages?: unknown[]`.
- A 2xx response is `sent` only when `events_received === submitted event count`.

- [ ] Write one table-style behavioral test covering an exact acceptance count and malformed/mismatched 2xx responses.
- [ ] Run it and verify mismatched 2xx currently passes incorrectly.
- [ ] Parse response acceptance fields, persist them, and treat invalid success bodies as retryable failures.
- [ ] Remove raw email from browser event options and run focused tests.

### Task 4: Verify, sync, migrate, deploy

**Files:**
- Modify through sync: `/home/derpcat/projects/music-shortlink`

- [ ] Run `bun run test`, `bunx tsc --noEmit`, and `bun run build` in Linkbeam.
- [ ] Commit and push Linkbeam `main`.
- [ ] Run `./scripts/sync-from-linkbeam.sh` in the deployment fork and verify fork-only files remain unchanged.
- [ ] Run tests and build in the deployment fork.
- [ ] Apply migration `0015_meta_event_integrity.sql` to remote D1.
- [ ] Deploy production and smoke-test page HTML, outbound redirect, idempotent repeated `eid`, and new CAPI response fields.
- [ ] Commit and push the deployment branch.
