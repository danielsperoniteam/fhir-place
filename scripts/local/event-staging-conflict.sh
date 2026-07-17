#!/usr/bin/env bash
# Local driver for staging-stack-resolve-conflicts. Fires when
# poll-events.sh spots a staging-stack-agent-dispatch marker comment on a PR.
# Arguments: <pr-number> <head-sha>

set -Eeuo pipefail

PR="${1:-}"
SHA="${2:-}"
if [[ -z "$PR" || -z "$SHA" ]]; then
  echo "usage: $0 <pr-number> <head-sha>" >&2
  exit 2
fi

exec "$(dirname "$0")/../run-prompt-locally.sh" staging-stack-resolve-conflicts \
  --for "PR #$PR sha=$SHA" \
  --max-turns 200 \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob"
