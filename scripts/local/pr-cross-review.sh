#!/usr/bin/env bash
# Advisory second-pass PR review. Intended for Claude/Codex cross-review:
# run one provider's normal implementation/review, then run the other
# provider here to catch misses without posting a blocking review.

set -Eeuo pipefail

PR="${1:-}"
if [[ -z "$PR" ]]; then
  echo "usage: $0 <pr-number>" >&2
  exit 2
fi

PROVIDER="${AGENT_PROVIDER:-${AI_PROVIDER:-codex}}"

exec "$(dirname "$0")/../run-agent-prompt-locally.sh" pr-cross-review \
  --for "PR #$PR cross-review by $PROVIDER" \
  --max-turns 80 \
  --allowedTools "Read,Grep,Glob,mcp__github__*,Bash(gh pr view:*),Bash(gh pr diff:*),Bash(gh pr comment:*)"
