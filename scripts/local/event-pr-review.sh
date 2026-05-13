#!/usr/bin/env bash
# Local driver for the pr-review prompt. Fires when poll-events.sh
# spots a non-draft PR without a pr-review:bot marker. Argument: the
# PR number.

set -Eeuo pipefail

PR="${1:-}"
if [[ -z "$PR" ]]; then
  echo "usage: $0 <pr-number>" >&2
  exit 2
fi

exec "$(dirname "$0")/../run-agent-prompt-locally.sh" pr-review \
  --for "PR #$PR" \
  --max-turns 40 \
  --allowedTools "Read,Grep,Glob,Agent,mcp__github__*,Bash(gh pr review:*)"
