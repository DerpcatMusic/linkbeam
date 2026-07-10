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

assert_max_bytes() {
  local label="$1"
  local maximum="$2"
  shift 2
  local response_file
  response_file="$(mktemp -t linkbeam-payload.XXXXXX.html)"
  curl --fail --silent --show-error "$@" --output "${response_file}"
  local actual
  actual="$(wc -c < "${response_file}")"
  rm -f "${response_file}"
  if (( actual > maximum )); then
    echo "${label} payload is ${actual} bytes; budget is ${maximum}" >&2
    exit 1
  fi
}

assert_max_bytes "fan page" 30000 "${BASE_URL}/demon-cake"
assert_max_bytes "new-link editor" 100000 "${BASE_URL}/admin/links/new"
assert_max_bytes "ASCII preview" 40000 -X POST -H 'content-type: application/json' --data '{"title":"Payload check","artistName":"Linkbeam","pageBackgroundStyle":"ascii","destinations":{"spotify":"https://open.spotify.com/track/1"}}' "${BASE_URL}/admin/preview"
rg --quiet 'queue|scheduled' dist/server/entry.mjs dist/server/chunks 2>/dev/null

echo "Built Worker smoke test passed at ${BASE_URL}"
