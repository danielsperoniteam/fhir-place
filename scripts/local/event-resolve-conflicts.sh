#!/usr/bin/env bash
# Local driver for the pr-resolve-conflicts prompt. Fires when
# poll-events.sh spots a `/resolve-conflicts` comment on a PR from a
# repo collaborator. Argument: the PR number.

set -Eeuo pipefail

PR="${1:-}"
if [[ -z "$PR" ]]; then
  echo "usage: $0 <pr-number>" >&2
  exit 2
fi

exec "$(dirname "$0")/../run-prompt-locally.sh" pr-resolve-conflicts \
  --for "PR #$PR" \
  --max-turns 100 \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob,mcp__github__*"
