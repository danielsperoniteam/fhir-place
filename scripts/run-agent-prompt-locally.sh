#!/usr/bin/env bash
# Provider-aware local prompt runner. This is the shared shell harness for
# prompts that can run under either Claude Code or Codex CLI.
#
# Usage:
#   AGENT_PROVIDER=claude scripts/run-agent-prompt-locally.sh <prompt> [args...]
#   AGENT_PROVIDER=codex  scripts/run-agent-prompt-locally.sh <prompt> [args...]
#   AGENT_PROVIDER=random scripts/run-agent-prompt-locally.sh <prompt> [args...]
#   AGENT_PROVIDER=codex-cloud CODEX_CLOUD_ENV=<env-id> scripts/run-agent-prompt-locally.sh <prompt> [args...]
#
# Defaults to Claude for backward compatibility with the existing launchd
# jobs. Set AGENT_PROVIDER=random only after a prompt has been proven safe
# under both local providers. codex-cloud is explicit only.

set -Eeuo pipefail

PROMPT_FILE="${1:-}"
if [[ -z "$PROMPT_FILE" ]]; then
  echo "usage: $0 <prompt-file> [--for <target>] [--allowedTools ...] [--max-turns N] [extra-arg ...]" >&2
  exit 2
fi
shift

TARGET=""
CLAUDE_ARGS=()
MAX_TURNS=""
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
    --allowedTools|--disallowedTools)
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

export PATH="$HOME/Library/pnpm:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

if [[ -f "$PAUSE_FILE" ]]; then
  echo "pause file present at $PAUSE_FILE — skipping run for $PROMPT_FILE"
  exit 0
fi

choose_provider() {
  case "$REQUESTED_PROVIDER" in
    claude|codex|codex-cloud)
      echo "$REQUESTED_PROVIDER"
      ;;
    random)
      if ! command -v codex >/dev/null 2>&1; then
        echo "claude"
      elif ! command -v claude >/dev/null 2>&1; then
        echo "codex"
      elif (( RANDOM % 2 == 0 )); then
        echo "codex"
      else
        echo "claude"
      fi
      ;;
    *)
      echo "unknown AGENT_PROVIDER=$REQUESTED_PROVIDER (expected claude, codex, codex-cloud, or random)" >&2
      exit 2
      ;;
  esac
}

PROVIDER="$(choose_provider)"

if [[ "$PROVIDER" != "codex-cloud" ]]; then
  export GITHUB_TOKEN="${GITHUB_TOKEN:-$(security find-generic-password -s github-pat-fhir-place -a "$USER" -w 2>/dev/null || true)}"
  export GH_TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"

  if [[ -z "$GITHUB_TOKEN" ]]; then
    echo "missing GITHUB_TOKEN (try: security add-generic-password -U -s github-pat-fhir-place -a \"$USER\" -w '<your-PAT>')" >&2
    exit 2
  fi
fi

PROVIDER_BIN="$PROVIDER"
if [[ "$PROVIDER" == "codex-cloud" ]]; then
  PROVIDER_BIN="codex"
fi

if ! command -v "$PROVIDER_BIN" >/dev/null 2>&1; then
  echo "selected provider '$PROVIDER' is not on PATH" >&2
  exit 2
fi

PROMPT_BASENAME="$(basename "$PROMPT_FILE" .md)"
TARGET_SLUG="$(echo "$TARGET" | tr -c 'A-Za-z0-9' '-' | sed 's/-\+/-/g; s/^-//; s/-$//')"
LOCK_NAME="${LOCK_NAME:-${PROVIDER}-${PROMPT_BASENAME}${TARGET_SLUG:+-$TARGET_SLUG}}"
LOCK_DIR="/tmp/fhir-place-${LOCK_NAME}.lock"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/${PROVIDER}-${PROMPT_BASENAME}${TARGET_SLUG:+-$TARGET_SLUG}-${RUN_ID}.log"

mkdir -p "$LOG_DIR"
exec >> "$LOG_FILE" 2>&1
echo "=== run $RUN_ID :: provider=$PROVIDER prompt=$PROMPT_FILE ==="

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

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "dirty working tree at $REPO_ROOT — skipping"
  exit 0
fi

git fetch origin --prune --tags --quiet
git worktree prune

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

WORKTREE_PARENT="$(dirname "$REPO_ROOT")"

echo "resolved prompt: $RESOLVED_PROMPT"
[[ -n "$TARGET" ]] && echo "target: $TARGET"
[[ -n "$MAX_TURNS" ]] && echo "max turns: $MAX_TURNS"
echo "requested provider: $REQUESTED_PROVIDER"
echo "selected provider: $PROVIDER"

build_stdin() {
  if [[ "$PROVIDER" == "codex" || "$PROVIDER" == "codex-cloud" ]]; then
    echo "You are running this automation under Codex CLI, not Claude Code."
    echo "Translate Claude-specific prompt references to the equivalent Codex capabilities:"
    echo "- If the prompt mentions mcp__github__ tools, use available GitHub tools or the gh CLI with GITHUB_TOKEN/GH_TOKEN from the environment."
    echo "- If the prompt mentions the Agent tool or .claude/agents, use the corresponding .codex/agents role guidance when available, or perform the bounded task yourself."
    echo "- This is headless automation. Do not ask the user questions; stop with a needs-human / needs-triage note when the safe answer is unclear."
    echo "- Preserve the prompt's safety rules, branch rules, markers, and output conventions."
    if [[ "$PROVIDER" == "codex-cloud" ]]; then
      echo "- You are running in Codex Cloud. Do not assume local macOS keychain, launchd, or local filesystem state exists."
      echo "- If a required credential or external integration is unavailable, stop and report the missing environment variable or integration instead of improvising."
    fi
    echo
  fi

  if [[ -n "$TARGET" ]]; then
    echo "Execute the instructions in the prompt below for $TARGET. Do not modify the prompt file itself."
    echo
  fi

  cat "$RESOLVED_PROMPT"
}

run_claude() {
  unset ANTHROPIC_API_KEY
  build_stdin | claude \
    --print \
    --add-dir "$WORKTREE_PARENT" \
    --dangerously-skip-permissions \
    "${CLAUDE_ARGS[@]}"
}

run_codex() {
  local codex_sandbox="${CODEX_SANDBOX:-workspace-write}"
  local codex_args=(
    exec
    -C "$REPO_ROOT"
    --add-dir "$WORKTREE_PARENT"
    --sandbox "$codex_sandbox"
    --ask-for-approval never
    -c shell_environment_policy.inherit=all
  )

  if [[ -n "${CODEX_PROFILE:-}" ]]; then
    codex_args+=(--profile "$CODEX_PROFILE")
  fi
  if [[ -n "${CODEX_MODEL:-}" ]]; then
    codex_args+=(--model "$CODEX_MODEL")
  fi

  build_stdin | codex "${codex_args[@]}" -
}

run_codex_cloud() {
  if [[ -z "${CODEX_CLOUD_ENV:-}" ]]; then
    echo "AGENT_PROVIDER=codex-cloud requires CODEX_CLOUD_ENV=<env-id>" >&2
    echo "Use the id from your Codex cloud environment or automation configuration." >&2
    exit 2
  fi

  local branch="${CODEX_CLOUD_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
  local prompt_text
  prompt_text="$(build_stdin)"

  echo "submitting Codex Cloud task"
  echo "cloud env: $CODEX_CLOUD_ENV"
  echo "cloud branch: $branch"

  codex cloud exec \
    --env "$CODEX_CLOUD_ENV" \
    --branch "$branch" \
    --attempts "${CODEX_CLOUD_ATTEMPTS:-1}" \
    "$prompt_text"
}

set +e
case "$PROVIDER" in
  claude) run_claude ;;
  codex) run_codex ;;
  codex-cloud) run_codex_cloud ;;
esac
RC=$?
set -e

if [[ $RC -ne 0 ]]; then
  osascript -e "tell application \"Messages\" to send \"$PROVIDER $PROMPT_BASENAME failed rc=$RC run=$RUN_ID — see $LOG_FILE\" to participant \"$PHONE\" of (service 1 whose service type is iMessage)" 2>/dev/null || true
fi

find "$LOG_DIR" -name "${PROVIDER}-${PROMPT_BASENAME}-*.log" -mtime +14 -delete 2>/dev/null || true

echo "=== run $RUN_ID complete (provider=$PROVIDER rc=$RC) ==="
exit "$RC"
