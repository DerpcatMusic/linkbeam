# Meta Event Integrity Design

## Goal

Preserve `ViewContent` as the production ad-optimization event while allowing each link to collect a parallel `Stream_Click` learning signal, prevent duplicate CAPI intake, and report Meta acceptance truthfully.

## Event contract

- Existing links continue using `ViewContent` as their primary outbound event unless an operator changes the controlled selection.
- A new optional learning-event selection defaults to `None`. Operators may select `Stream_Click` so a single tap produces both the primary event and the learning event.
- The learning event uses the primary click ID plus a deterministic `_stream` suffix. Browser Pixel and server CAPI use the same name and ID for each logical event.
- Paid traffic is represented by attribution parameters. `Stream_Click_Paid` is retained only as readable legacy data and is no longer emitted as another conversion.
- Event-name controls are dropdowns rather than arbitrary text. Page events allow `PageView` or `ViewContent`; primary click events allow `ViewContent`, `Lead`, or `Stream_Click`; learning events allow `None`, `ViewContent`, `Lead`, or `Stream_Click` while rejecting equality with the primary event.
- Existing unsupported stored custom names remain readable during migration but must be changed to a supported selection before saving.

## Idempotent intake

Before enqueueing CAPI work, the server claims `(pixel_id, event_name, event_id)` in D1 with a unique constraint. A successful prior claim suppresses repeated HTTP requests carrying the same event identity. Queue delivery retries do not pass through this ingress claim and remain allowed.

The claim and event enqueue cannot be one atomic operation across D1 and Cloudflare Queues. To avoid losing events after a queue-send failure, a failed enqueue releases its claim. The retention job deletes old claims after seven days.

## Meta delivery truth

The CAPI response parser records `events_received`, response messages, and `fbtrace_id`. A 2xx response is considered accepted only when `events_received` equals the number submitted. A malformed response or count mismatch is retryable and is logged as failed with the response detail.

## Registration and consent

The browser registration event keeps the shared `eventID` but no longer puts raw email in the Pixel event-options object. Hashed email remains in server CAPI user data.

Consent behavior is configurable rather than silently changing production. The current immediate-tracking behavior remains the default; a deployment can require consent, in which case Pixel, Meta cookies, and CAPI are withheld until consent exists. This design does not introduce a full consent-management UI.

## Operator UI and migration

A schema migration adds the optional learning-event field and the idempotency table. Link create/edit APIs validate event selections centrally. The editor explains that `ViewContent` remains the active optimization event and `Stream_Click` can accumulate in parallel before a future switch.

The deployment fork receives these changes only through `scripts/sync-from-linkbeam.sh`; its bindings and production identity remain fork-local.

## Verification

Automated coverage is deliberately limited to three high-value behavioral tests:

1. Repeated ingress with an identical event name and ID queues once, while a queue retry remains deliverable.
2. A link configured with primary `ViewContent` plus learning `Stream_Click` emits exactly those two events with stable distinct IDs and never emits `Stream_Click_Paid`.
3. Meta delivery accepts matching `events_received` and rejects malformed or mismatched success responses.

Existing focused tracking, database, public-page, and outbound tests must continue passing. Before production deployment, apply the remote D1 migration, deploy the fork, smoke-test page and outbound behavior, and inspect recent CAPI rows for the new event contract.
