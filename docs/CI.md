# CI

CI installs the existing Bun 1.3.14 lockfile once, runs `bun run test`, then `bun run smoke`. Smoke already runs `bun run build` (Astro type checking and production compilation), applies migrations to **local** D1, starts a local Worker and verifies routes/payload limits. A separate build step would repeat the same compilation. No remote migration or deployment runs.

The stable `conclusion` check succeeds only when `check` succeeds; failure, cancellation and unexpected skip all fail it. PRs, the existing merge queue and main pushes use the same checks. This change is stacked on CI baseline PR #1, not a replacement for it.

Locally: install Bun 1.3.14, Node 24 and sqlite3, then run `bun install --frozen-lockfile && bun run test && bun run smoke`. Unit tests check logic; integration tests check storage/contracts; smoke checks that the compiled Worker works end to end locally. This does not prove a production deployment.

## Why this shape

GitHub recommends [minimum token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token), [scoped concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), and [full action commit pins](https://docs.github.com/en/actions/reference/security/secure-use). Validation cancels obsolete runs without changing deployment queues. Ubuntu 24.04 is explicit so the upcoming ubuntu-latest image migration does not silently change this lane. Required jobs have no workflow-level path exclusions, which can otherwise leave a required result pending.
