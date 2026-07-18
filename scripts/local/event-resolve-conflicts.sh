#!/usr/bin/env bash
# Local driver for the pr-resolve-conflicts prompt. Fires when
# poll-events.sh spots a `/resolve-conflicts` comment on a PR from a
# repo collaborator. Argument: the PR number.

set -Eeuo pipefail

PR="${1:-}"
if [[ ! "$PR" =~ ^[0-9]+$ ]]; then
  echo "usage: $0 <pr-number>" >&2
  exit 2
fi

REPO_ROOT="${REPO_ROOT:-$HOME/src/fhir-place}"
RESOLVE_RUN_SLUG="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RESOLVE_WORKTREE="$(dirname "$REPO_ROOT")/wt-pr-$PR.$RESOLVE_RUN_SLUG"
RESOLVE_TEMP_BRANCH="codex/resolve-pr-$PR-$RESOLVE_RUN_SLUG"
export RESOLVE_RUN_SLUG RESOLVE_WORKTREE RESOLVE_TEMP_BRANCH

cleanup_conflict_worktrees() {
  # Exact per-invocation ownership matters: a duplicate driver may exit after
  # the inner per-PR lock rejects it while another resolver is still active.
  # Never glob across every worktree for the PR.
  if git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null | \
     grep -Fxq "worktree $RESOLVE_WORKTREE"; then
    git -C "$REPO_ROOT" worktree remove --force "$RESOLVE_WORKTREE" 2>/dev/null || true
  fi
  git -C "$REPO_ROOT" branch -D -- "$RESOLVE_TEMP_BRANCH" >/dev/null 2>&1 || true
}

trap cleanup_conflict_worktrees EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

set +e
"$(dirname "$0")/../run-prompt-locally.sh" pr-resolve-conflicts \
  --for "PR #$PR" \
  --allow-dirty-primary \
  --max-turns 100 \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob,mcp__github__*"
RC=$?
set -e
exit "$RC"
