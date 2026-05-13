#!/usr/bin/env bash
# Local driver for the address-comments prompt. Fires when
# poll-events.sh spots a `/address-comments` comment on a PR from a
# repo collaborator. Argument: the PR number.

set -Eeuo pipefail

PR="${1:-}"
if [[ -z "$PR" ]]; then
  echo "usage: $0 <pr-number>" >&2
  exit 2
fi

exec "$(dirname "$0")/../run-agent-prompt-locally.sh" address-comments \
  --for "PR #$PR" \
  --max-turns 200 \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob,Agent,mcp__github__*"
