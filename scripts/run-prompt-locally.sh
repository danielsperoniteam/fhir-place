#!/usr/bin/env bash
# Generic local prompt runner. Invokes `claude --print` headlessly with a
# prompt file from docs/prompts/, falling back to the saved OAuth session
# (Claude Max subscription) rather than ANTHROPIC_API_KEY.
#
# Usage:
#   scripts/run-prompt-locally.sh <prompt-file> [--allowedTools T,U,V] [--max-turns N] [--extra-arg ...]
#
# Required env:
#   GITHUB_TOKEN — fine-grained PAT with the perms the prompt needs.
#                  (We never set ANTHROPIC_API_KEY on purpose.)
#
# Optional env:
#   REPO_ROOT — defaults to $HOME/src/fhir-place
#   PAUSE_FILE — defaults to $HOME/.fhir-place-pause (touch to disable all
#                local runners at once)
#   LOG_DIR — defaults to $REPO_ROOT/logs
#   LOCK_NAME — defaults to the prompt's basename; used to namespace the
#               single-run lock so two different prompts can run at the
#               same time but two copies of the same prompt cannot
#   RUN_IN_CLEAN_WORKTREE — set to true for jobs that must run even when the
#               human checkout is dirty. The runner creates and removes a
#               detached control worktree at origin/main.
#
# Design choices:
#   - launchd-friendly: explicit PATH, exec >/2 redirect for tee-to-log,
#     atomic mkdir lock with stale-PID recovery.
#   - No ANTHROPIC_API_KEY in env so `claude` uses the OAuth session from
#     `claude login`. Bill against the Max subscription, not API tokens.
#   - Logs auto-trim to ~14 days.
#
# See scripts/local/*.sh for per-prompt drivers that call this.

set -Eeuo pipefail

PROMPT_FILE="${1:-}"
if [[ -z "$PROMPT_FILE" ]]; then
  echo "usage: $0 <prompt-file> [--for <target>] [--allowedTools ...] [--max-turns N] [extra-arg ...]" >&2
  exit 2
fi
shift

# Optional --for <target>: prepended as a one-line prologue before the
# prompt body, telling claude what specific issue/PR this run is for.
# Used by event-triggered drivers (issue-review, pr-review,
# dispatch-engineer-on-issue, pr-resolve-conflicts) to scope the run.
TARGET=""
SKIP_DIRTY_CHECK=false
CLAUDE_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --for)
      TARGET="$2"
      shift 2
      ;;
    --skip-dirty-check)
      SKIP_DIRTY_CHECK=true
      shift
      ;;
    *)
      CLAUDE_ARGS+=("$1")
      shift
      ;;
  esac
done

REPO_ROOT="${REPO_ROOT:-$HOME/src/fhir-place}"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs}"
PAUSE_FILE="${PAUSE_FILE:-$HOME/.fhir-place-pause}"

# Path: launchd does not inherit shell PATH. Cover Apple Silicon, Intel,
# npm global, pnpm self-install, and ~/.local/bin.
export PATH="$HOME/Library/pnpm:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Pause file is the global kill switch — every local runner respects it.
if [[ -f "$PAUSE_FILE" ]]; then
  echo "pause file present at $PAUSE_FILE — skipping run for $PROMPT_FILE"
  exit 0
fi

# GitHub PAT from macOS keychain. Same keychain entry the engineer-dispatch
# driver uses, so a single one-time setup covers every prompt.
export GITHUB_TOKEN="${GITHUB_TOKEN:-$(security find-generic-password -s github-pat-fhir-place -a "$USER" -w 2>/dev/null || true)}"
export GH_TOKEN="$GITHUB_TOKEN"

if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "missing GITHUB_TOKEN (try: security add-generic-password -s github-pat-fhir-place -a \"$USER\" -w '<your-PAT>')" >&2
  exit 2
fi

PROMPT_BASENAME="$(basename "$PROMPT_FILE" .md)"
# When a target is set (event-triggered run), namespace the lock and log
# by target too so two event runs against different PRs/issues don't
# block each other.
TARGET_SLUG="$(echo "$TARGET" | tr -c 'A-Za-z0-9' '-' | sed 's/-\+/-/g; s/^-//; s/-$//')"
LOCK_NAME="${LOCK_NAME:-${PROMPT_BASENAME}${TARGET_SLUG:+-$TARGET_SLUG}}"
LOCK_DIR="/tmp/fhir-place-${LOCK_NAME}.lock"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/${PROMPT_BASENAME}${TARGET_SLUG:+-$TARGET_SLUG}-${RUN_ID}.log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== run $RUN_ID :: $PROMPT_FILE ==="

# Trim before any early exit, including dirty-checkout and auth failures.
find "$LOG_DIR" -name "${PROMPT_BASENAME}-*.log" -mtime +14 -delete 2>/dev/null || true

# Single-run lock per prompt. Atomic on POSIX. Stale-lock recovery checks
# whether the recorded PID is still alive.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  STALE_PID="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ -n "$STALE_PID" ]] && ! kill -0 "$STALE_PID" 2>/dev/null; then
    echo "stale lock from pid $STALE_PID — clearing"
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR"
  else
    echo "another run is in flight (pid ${STALE_PID:-unknown}) — skipping"
    exit 0
  fi
fi
echo $$ > "$LOCK_DIR/pid"
PRIMARY_REPO_ROOT="$REPO_ROOT"
CLEAN_RUNNER_ROOT=""
WORKTREE_NAMESPACE="$RUN_ID-$$"
export WORKTREE_NAMESPACE
cleanup() {
  while IFS= read -r task_worktree; do
    case "$task_worktree" in
      *-"$WORKTREE_NAMESPACE")
        git -C "$PRIMARY_REPO_ROOT" worktree remove --force "$task_worktree" 2>/dev/null || true
        ;;
    esac
  done < <(git -C "$PRIMARY_REPO_ROOT" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p')
  if [[ -n "$CLEAN_RUNNER_ROOT" ]]; then
    git -C "$PRIMARY_REPO_ROOT" worktree remove --force "$CLEAN_RUNNER_ROOT" 2>/dev/null || true
  fi
  rm -rf "$LOCK_DIR"
}
trap cleanup EXIT

cd "$PRIMARY_REPO_ROOT"
git fetch origin --prune --tags --quiet
git worktree prune

if [[ "${RUN_IN_CLEAN_WORKTREE:-false}" == "true" ]]; then
  CLEAN_RUNNER_ROOT="$(dirname "$PRIMARY_REPO_ROOT")/.fhir-place-runner-${LOCK_NAME}-${WORKTREE_NAMESPACE}"
  git worktree add --detach "$CLEAN_RUNNER_ROOT" origin/main
  REPO_ROOT="$CLEAN_RUNNER_ROOT"
  cd "$REPO_ROOT"
  echo "clean control worktree: $REPO_ROOT"
elif [[ "$SKIP_DIRTY_CHECK" != "true" ]] && { ! git diff --quiet || ! git diff --cached --quiet; }; then
  # General jobs still protect the human checkout. Conflict jobs opt into the
  # clean control worktree above and never operate from this dirty tree.
  # Pass --skip-dirty-check for prompts that never touch the tree.
  echo "dirty working tree at $REPO_ROOT — skipping"
  exit 0
fi

git branch --format '%(if:equals=[gone])%(upstream:track)%(then)%(refname:short)%(end)' \
  | grep -v '^$' | grep -E '^(bot|claude|codex)/' | xargs git branch -D 2>/dev/null || true

# Find the prompt file. Accept either an absolute path, a repo-relative
# path, or a bare basename (looked up under docs/prompts/).
RESOLVED_PROMPT=""
if [[ -f "$PROMPT_FILE" ]]; then
  RESOLVED_PROMPT="$PROMPT_FILE"
elif [[ -f "$REPO_ROOT/$PROMPT_FILE" ]]; then
  RESOLVED_PROMPT="$REPO_ROOT/$PROMPT_FILE"
elif [[ -f "$REPO_ROOT/docs/prompts/$PROMPT_FILE" ]]; then
  RESOLVED_PROMPT="$REPO_ROOT/docs/prompts/$PROMPT_FILE"
elif [[ -f "$REPO_ROOT/docs/prompts/${PROMPT_FILE}.md" ]]; then
  RESOLVED_PROMPT="$REPO_ROOT/docs/prompts/${PROMPT_FILE}.md"
else
  echo "prompt file not found: $PROMPT_FILE" >&2
  exit 2
fi

# Worktree-parent so prompts that create worktrees under $(dirname $REPO_ROOT)
# (engineer-dispatch convention) can edit them.
WORKTREE_PARENT="$(dirname "$REPO_ROOT")"

# claude refuses to read ANTHROPIC_API_KEY if it isn't set — that's the
# OAuth fallback path. The launchd plist for this script should not set
# the API key either. To double-check, explicitly unset here.
unset ANTHROPIC_API_KEY

# Auth preflight — verify the Claude OAuth session is alive before committing
# to a full run. Exits early with a clear message rather than burning a run
# on a silent auth failure.
AUTH_CHECK=$(claude --print "Reply with the single word: ok" 2>&1 || true)
AUTH_CHECK=$(echo "$AUTH_CHECK" | tr -d '[:space:]')
if ! echo "$AUTH_CHECK" | grep -qi "^ok"; then
  echo "ERROR: claude auth check failed — run 'claude login' to refresh the OAuth session" >&2
  exit 2
fi

echo "prompt: $RESOLVED_PROMPT"
[[ -n "$TARGET" ]] && echo "target: $TARGET"
echo "claude args: ${CLAUDE_ARGS[*]:-(none)}"

# Compose stdin: optional prologue line (when --for was set) + the
# prompt file. The prologue is what tells claude "execute for #N";
# the prompt body has the per-prompt instructions.
build_stdin() {
  if [[ -n "$TARGET" ]]; then
    echo "Execute the instructions in the prompt below for $TARGET. Do not modify the prompt file itself."
    echo
  fi
  cat "$RESOLVED_PROMPT"
}

set +e
build_stdin | claude \
  --print \
  --add-dir "$WORKTREE_PARENT" \
  --dangerously-skip-permissions \
  "${CLAUDE_ARGS[@]}"
RC=$?
set -e

echo "=== run $RUN_ID complete (rc=$RC) ==="
exit "$RC"
