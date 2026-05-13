#!/usr/bin/env bash
# Local driver for the dispatch-engineer-on-issue prompt. Fires when
# poll-events.sh spots a `/dispatch-engineer` comment on an issue from a
# repo collaborator. Argument: the issue number.

set -Eeuo pipefail

ISSUE="${1:-}"
if [[ -z "$ISSUE" ]]; then
  echo "usage: $0 <issue-number>" >&2
  exit 2
fi

exec "$(dirname "$0")/../run-agent-prompt-locally.sh" dispatch-engineer-on-issue \
  --for "issue #$ISSUE" \
  --max-turns 200 \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob,Agent,mcp__github__*"
