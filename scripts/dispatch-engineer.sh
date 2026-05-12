#!/usr/bin/env bash
# Local engineer-dispatch driver. Mirrors the GH Actions workflow at
# .github/workflows/hourly-engineer-dispatch.yml but invokes claude headlessly.
# Designed to be fired by launchd; safe to run by hand for testing.
#
# Auth: this driver intentionally does NOT export ANTHROPIC_API_KEY. With no
# API key in the env, `claude` falls back to its saved OAuth login session and
# bills against the Claude Max subscription instead of paid API tokens. Run
# `claude login` once on this machine before installing the launchd job.
# The GHA workflow keeps using the API key — it has no logged-in user.
#
# See docs/decisions/0003-agent-safety-rules.md for the safety model.
# The engineer subagent (.claude/agents/engineer.md) enforces all hard rules;
# this script just wraps env, locking, logging, and notification.

set -Eeuo pipefail

REPO_ROOT="${REPO_ROOT:-$HOME/src/fhir-place}"
LOG_DIR="$REPO_ROOT/logs"
LOCK_DIR="/tmp/fhir-place-dispatch.lock"
PAUSE_FILE="$HOME/.fhir-place-pause"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/engineer-dispatch-$RUN_ID.log"
PHONE="+15082827897"

# launchd does not inherit shell PATH. Cover Apple Silicon, Intel, npm
# global, pnpm self-install, and ~/.local/bin.
export PATH="$HOME/Library/pnpm:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# GitHub PAT from macOS keychain (one-time setup in scripts/dispatch-engineer.README).
# No ANTHROPIC_API_KEY here on purpose — see auth note in the header comment.
export GITHUB_TOKEN="$(security find-generic-password -s github-pat-fhir-place -a "$USER" -w 2>/dev/null || true)"
export GH_TOKEN="$GITHUB_TOKEN"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== run $RUN_ID ==="

[[ -z "$GITHUB_TOKEN" ]] && { echo "missing GITHUB_TOKEN"; exit 2; }

if [[ -f "$PAUSE_FILE" ]]; then
  echo "pause file present at $PAUSE_FILE — skipping"; exit 0
fi

# Single-run lock via mkdir (atomic on POSIX). Stale lock recovery checks
# whether the recorded PID is still alive.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  STALE_PID="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ -n "$STALE_PID" ]] && ! kill -0 "$STALE_PID" 2>/dev/null; then
    echo "stale lock from pid $STALE_PID — clearing"
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR"
  else
    echo "another dispatch is running (pid ${STALE_PID:-unknown})"; exit 0
  fi
fi
echo $$ > "$LOCK_DIR/pid"
trap 'rm -rf "$LOCK_DIR"' EXIT

cd "$REPO_ROOT"

# Refuse to run with a dirty primary checkout — likely Daniel mid-edit.
# The engineer subagent works in worktrees, never the primary checkout.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "dirty working tree at $REPO_ROOT — skipping"; exit 0
fi

git fetch origin --prune --tags --quiet
git worktree prune

# Tool allow-list. Defense in depth: engineer subagent has its own hard
# rules; this just bounds what a prompt-injected dispatcher can call.
ALLOWED="Read,Edit,Write,Bash,Grep,Glob,Agent,mcp__github__*"

# Worktrees live at $(dirname $REPO_ROOT)/wt-<N> per engineer.md.
# claude restricts file ops to cwd by default, so widen the scope.
WORKTREE_PARENT="$(dirname "$REPO_ROOT")"

set +e
claude \
  --print \
  --add-dir "$WORKTREE_PARENT" \
  --allowedTools "$ALLOWED" \
  --dangerously-skip-permissions \
  <<'PROMPT'
Read the file at docs/prompts/hourly-engineer-dispatch.md and execute
the instructions in it. Do not modify the prompt file itself. The MCP
github tools are configured and the engineer subagent at
.claude/agents/engineer.md is available for dispatch.
PROMPT
RC=$?
set -e

if [[ $RC -ne 0 ]]; then
  osascript -e "tell application \"Messages\" to send \"engineer-dispatch failed rc=$RC run=$RUN_ID — see $LOG_FILE\" to participant \"$PHONE\" of (service 1 whose service type is iMessage)" || true
fi

# Trim old logs (~14 days).
find "$LOG_DIR" -name 'engineer-dispatch-*.log' -mtime +14 -delete 2>/dev/null || true

echo "=== run $RUN_ID complete (rc=$RC) ==="
exit "$RC"
