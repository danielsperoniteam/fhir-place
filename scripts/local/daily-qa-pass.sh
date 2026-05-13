#!/usr/bin/env bash
# Local driver for the daily QA pass prompt. Replaces the GHA
# `daily-qa-pass.yml` workflow for local execution.
#
# Heavier than the other drivers: boots the demo dev server pointed at
# the SMART Health IT R4 sandbox (VITE_USE_MOCK=false — same env the GHA
# workflow uses) before invoking the prompt, then tears it down on exit.
# The QA prompt's Step 1 is `curl -fsS http://localhost:5173` and it bails
# if the server isn't there, so a wrapper that just delegates would
# always exit before running any QA.
#
# Refuses to run if :5173 is already in use — a pre-existing dev server
# is likely VITE_USE_MOCK=true, which would walk the agent through a
# mocked app and file false bugs.
#
# See scripts/run-prompt-locally.sh for the shared runner.

set -Eeuo pipefail

REPO_ROOT="${REPO_ROOT:-$HOME/src/fhir-place}"
export PATH="$HOME/Library/pnpm:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

cd "$REPO_ROOT"

# Refuse to run if something else owns :5173 — see header comment.
if curl -fsS http://localhost:5173 > /dev/null 2>&1; then
  echo "port 5173 already in use; refusing to run QA pass against an unknown server" >&2
  echo "stop the existing dev server and re-run, or invoke the prompt manually" >&2
  exit 2
fi

mkdir -p "$REPO_ROOT/logs" apps/demo
DEV_LOG="$REPO_ROOT/logs/qa-dev-$(date -u +%Y%m%dT%H%M%SZ).log"

# Start the dev server in its own process group so cleanup can take down
# the whole tree (pnpm spawns vite as a child).
set -m
(
  cd apps/demo
  exec env VITE_USE_MOCK=false VITE_FHIR_BASE_URL=https://r4.smarthealthit.org \
    pnpm dev > "$DEV_LOG" 2>&1
) &
DEV_PID=$!
set +m

cleanup() {
  if [[ -n "${DEV_PID:-}" ]] && kill -0 "$DEV_PID" 2>/dev/null; then
    pkill -P "$DEV_PID" 2>/dev/null || true
    kill "$DEV_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

for i in $(seq 1 90); do
  if curl -fsS http://localhost:5173 > /dev/null 2>&1; then
    echo "dev server up after ${i}s (pid $DEV_PID, log $DEV_LOG)"
    break
  fi
  if (( i == 90 )); then
    echo "dev server failed to start within 90s — tailing $DEV_LOG:" >&2
    tail -n 100 "$DEV_LOG" >&2 || true
    exit 1
  fi
  sleep 1
done

"$REPO_ROOT/scripts/run-agent-prompt-locally.sh" daily-qa-pass \
  --max-turns 200 \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob,Agent,mcp__github__*"
