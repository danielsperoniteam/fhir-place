#!/usr/bin/env bash
# Generic local prompt runner. Invokes a headless agent with a prompt file
# from docs/prompts/. Claude remains the default provider, with Codex available
# via AGENT_PROVIDER=codex or AGENT_PROVIDER=random.
#
# Usage:
#   scripts/run-prompt-locally.sh <prompt-file> [--allowedTools T,U,V] [--max-turns N] [--extra-arg ...]
#   AGENT_PROVIDER=codex scripts/run-prompt-locally.sh <prompt-file> [...]
#   AGENT_PROVIDER=random scripts/run-prompt-locally.sh <prompt-file> [...]
#
# Required env:
#   GITHUB_TOKEN — fine-grained PAT with the perms the prompt needs.
#                  For Claude, we never set ANTHROPIC_API_KEY on purpose.
#
# Optional env:
#   AGENT_PROVIDER — claude (default), codex, or random
#   CODEX_MODEL — optional model override for codex exec
#   CODEX_PROFILE — optional profile from ~/.codex/config.toml
#   CODEX_SANDBOX — codex sandbox mode, defaults to workspace-write
#   REPO_ROOT — defaults to $HOME/src/fhir-place
#   PAUSE_FILE — defaults to $HOME/.fhir-place-pause (touch to disable all
#                local runners at once)
#   LOG_DIR — defaults to $REPO_ROOT/logs
#   LOCK_NAME — defaults to the prompt's basename; used to namespace the
#               single-run lock so two different prompts can run at the
#               same time but two copies of the same prompt cannot
#
# Design choices:
#   - launchd-friendly: explicit PATH, exec >/2 redirect for tee-to-log,
#     atomic mkdir lock with stale-PID recovery.
#   - Locks are prompt/target scoped, not provider scoped. Random provider
#     selection must not allow two agents to work the same target at once.
#   - Claude runs without ANTHROPIC_API_KEY so it uses the OAuth session from
#     `claude login`. Bills against the Max subscription, not API tokens.
#   - Errors notify via iMessage on failure (best-effort; never blocks
#     exit).
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
CLAUDE_ARGS=()
MAX_TURNS=""
ALLOWED_TOOLS=""
DISALLOWED_TOOLS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --for)
      TARGET="$2"
      shift 2
      ;;
    --max-turns)
      MAX_TURNS="$2"
      CLAUDE_ARGS+=("$1" "$2")
      shift 2
      ;;
    --allowedTools)
      ALLOWED_TOOLS="$2"
      CLAUDE_ARGS+=("$1" "$2")
      shift 2
      ;;
    --disallowedTools)
      DISALLOWED_TOOLS="$2"
      CLAUDE_ARGS+=("$1" "$2")
      shift 2
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
PHONE="${PHONE:-+15082827897}"
REQUESTED_PROVIDER="${AGENT_PROVIDER:-${AI_PROVIDER:-claude}}"

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

choose_provider() {
  case "$REQUESTED_PROVIDER" in
    claude|codex)
      echo "$REQUESTED_PROVIDER"
      ;;
    random)
      local candidates=()
      command -v claude >/dev/null 2>&1 && candidates+=("claude")
      command -v codex >/dev/null 2>&1 && candidates+=("codex")

      if [[ ${#candidates[@]} -eq 0 ]]; then
        echo "AGENT_PROVIDER=random found neither claude nor codex on PATH" >&2
        exit 2
      fi

      local index=$((RANDOM % ${#candidates[@]}))
      echo "${candidates[$index]}"
      ;;
    *)
      echo "unknown AGENT_PROVIDER=$REQUESTED_PROVIDER (expected claude, codex, or random)" >&2
      exit 2
      ;;
  esac
}

PROVIDER="$(choose_provider)"

if ! command -v "$PROVIDER" >/dev/null 2>&1; then
  echo "selected provider '$PROVIDER' is not on PATH" >&2
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
LOG_FILE="$LOG_DIR/${PROMPT_BASENAME}${TARGET_SLUG:+-$TARGET_SLUG}-${PROVIDER}-${RUN_ID}.log"

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== run $RUN_ID :: provider=$PROVIDER prompt=$PROMPT_FILE ==="

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
trap 'rm -rf "$LOCK_DIR"' EXIT

cd "$REPO_ROOT"

# Refuse to run with a dirty primary checkout — likely the human is mid-edit.
# Prompts that need to mutate the tree create worktrees of their own.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "dirty working tree at $REPO_ROOT — skipping"
  exit 0
fi

git fetch origin --prune --tags --quiet
git worktree prune
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


if [[ "$PROVIDER" == "claude" ]]; then
  # OAuth fallback path — the launchd plist must not set ANTHROPIC_API_KEY.
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
fi

echo "prompt: $RESOLVED_PROMPT"
[[ -n "$TARGET" ]] && echo "target: $TARGET"
echo "requested provider: $REQUESTED_PROVIDER"
echo "selected provider: $PROVIDER"
[[ -n "$MAX_TURNS" ]] && echo "max turns: $MAX_TURNS"
if [[ "$PROVIDER" == "claude" ]]; then
  echo "claude args: ${CLAUDE_ARGS[*]:-(none)}"
else
  echo "codex sandbox: ${CODEX_SANDBOX:-workspace-write}"
  [[ -n "$ALLOWED_TOOLS" ]] && echo "claude allowedTools intent: $ALLOWED_TOOLS"
  [[ -n "$DISALLOWED_TOOLS" ]] && echo "claude disallowedTools intent: $DISALLOWED_TOOLS"
fi

# Compose stdin: optional prologue line (when --for was set) + the
# prompt file. The prologue is what tells the agent "execute for #N";
# the prompt body has the per-prompt instructions.
build_stdin() {
  if [[ "$PROVIDER" == "codex" ]]; then
    echo "You are running this automation under Codex CLI, not Claude Code."
    echo "Translate Claude-specific prompt references to equivalent Codex behavior:"
    echo "- If the prompt mentions mcp__github__ tools, use available GitHub tools or the gh CLI with GITHUB_TOKEN/GH_TOKEN from the environment."
    echo "- If the prompt mentions the Agent tool or .claude/agents, use the matching .codex/agents/*.toml role guidance when available. If no matching role exists, perform the bounded task yourself."
    echo "- The launchd driver may pass Claude-only tool constraints. Treat them as safety intent, not as literal Codex CLI flags."
    echo "- This is headless automation. Do not ask the user questions. Stop with a needs-human or needs-triage note when the safe answer is unclear."
    echo "- Preserve the prompt's safety rules, branch rules, markers, labels, and output conventions."
    [[ -n "$MAX_TURNS" ]] && echo "- The original max-turns budget was $MAX_TURNS. Keep the run bounded."
    [[ -n "$ALLOWED_TOOLS" ]] && echo "- Original allowed tool intent: $ALLOWED_TOOLS."
    [[ -n "$DISALLOWED_TOOLS" ]] && echo "- Original disallowed tool intent: $DISALLOWED_TOOLS."
    echo
  fi

  if [[ -n "$TARGET" ]]; then
    echo "Execute the instructions in the prompt below for $TARGET. Do not modify the prompt file itself."
    echo
  fi
  cat "$RESOLVED_PROMPT"
}

run_claude() {
  local claude_args=(
    --print
    --add-dir "$WORKTREE_PARENT"
    --dangerously-skip-permissions
  )

  if [[ ${#CLAUDE_ARGS[@]} -gt 0 ]]; then
    claude_args+=("${CLAUDE_ARGS[@]}")
  fi

  # Claude falls back to the local OAuth session only when the API key is not set.
  unset ANTHROPIC_API_KEY
  build_stdin | claude "${claude_args[@]}"
}

run_codex() {
  local codex_sandbox="${CODEX_SANDBOX:-workspace-write}"
  local codex_args=(
    exec
    -C "$REPO_ROOT"
    --add-dir "$WORKTREE_PARENT"
    --sandbox "$codex_sandbox"
    -c 'approval_policy="never"'
    -c 'shell_environment_policy.inherit="all"'
  )

  if [[ -n "${CODEX_PROFILE:-}" ]]; then
    codex_args+=(--profile "$CODEX_PROFILE")
  fi
  if [[ -n "${CODEX_MODEL:-}" ]]; then
    codex_args+=(--model "$CODEX_MODEL")
  fi

  build_stdin | codex "${codex_args[@]}" -
}

set +e
case "$PROVIDER" in
  claude) run_claude ;;
  codex) run_codex ;;
esac
RC=$?
set -e

if [[ $RC -ne 0 ]]; then
  osascript -e "tell application \"Messages\" to send \"$PROVIDER $PROMPT_BASENAME failed rc=$RC run=$RUN_ID - see $LOG_FILE\" to participant \"$PHONE\" of (service 1 whose service type is iMessage)" 2>/dev/null || true
fi

echo "=== run $RUN_ID complete (provider=$PROVIDER rc=$RC) ==="
exit "$RC"
