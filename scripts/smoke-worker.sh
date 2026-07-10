#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8791}"
BASE_URL="http://${HOST}:${PORT}"
LOG_FILE="$(mktemp -t linkbeam-worker-smoke.XXXXXX.log)"

cleanup() {
  if [[ -n "${WORKER_PID:-}" ]]; then
    kill "${WORKER_PID}" 2>/dev/null || true
    wait "${WORKER_PID}" 2>/dev/null || true
  fi
  rm -f "${LOG_FILE}"
}
trap cleanup EXIT

bun run build
bunx wrangler d1 migrations apply DB --local --config dist/server/wrangler.json
bunx wrangler dev --config dist/server/wrangler.json --ip "${HOST}" --port "${PORT}" >"${LOG_FILE}" 2>&1 &
WORKER_PID=$!

for _ in $(seq 1 60); do
  if curl --fail --silent --output /dev/null "${BASE_URL}/"; then
    break
  fi
  if ! kill -0 "${WORKER_PID}" 2>/dev/null; then
    sed -n '1,200p' "${LOG_FILE}" >&2
    exit 1
  fi
  sleep 0.5
done

for route in / /admin/onboarding /admin/links/new; do
  curl --fail --silent --show-error --output /dev/null "${BASE_URL}${route}"
done

curl --fail --silent --show-error "${BASE_URL}/" | rg --quiet '<html|<!doctype html'
rg --quiet 'queue|scheduled' dist/server/entry.mjs dist/server/chunks 2>/dev/null

echo "Built Worker smoke test passed at ${BASE_URL}"
