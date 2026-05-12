#!/usr/bin/env bash
# Local driver for the issue-review prompt. Fires when poll-events.sh
# spots a newly-opened issue. Argument: the issue number.

set -Eeuo pipefail

ISSUE="${1:-}"
if [[ -z "$ISSUE" ]]; then
  echo "usage: $0 <issue-number>" >&2
  exit 2
fi

exec "$(dirname "$0")/../run-prompt-locally.sh" issue-review \
  --for "issue #$ISSUE" \
  --max-turns 60 \
  --allowedTools "Read,Grep,Glob,Agent,mcp__github__*"
