#!/usr/bin/env bash
# Polls GitHub for events that the GHA event-triggered workflows would
# react to (issue opened, PR opened/ready, /dispatch-engineer comment,
# /resolve-conflicts comment) and dispatches the corresponding local
# event driver under scripts/local/.
#
# Runs as a long-lived launchd job. State lives in
# ~/.fhir-place-state/poll-events.json (last-poll timestamp per event
# stream). Dedup leverages either the prompt's own comment-marker
# convention (e.g. `<!-- issue-review:pm -->`) or an emoji reaction we
# add to the triggering comment.
#
# Pause: respects ~/.fhir-place-pause (same kill switch as the cron
# drivers). Touch it to silence everything.
#
# Auth: GitHub PAT from macOS keychain (same as the cron drivers). No
# ANTHROPIC_API_KEY — each dispatched driver runs claude with OAuth.

set -Eeuo pipefail

REPO_ROOT="${REPO_ROOT:-$HOME/src/fhir-place}"
REPO="${REPO:-danielsperoniteam/fhir-place}"
PAUSE_FILE="${PAUSE_FILE:-$HOME/.fhir-place-pause}"
STATE_DIR="${STATE_DIR:-$HOME/.fhir-place-state}"
STATE_FILE="$STATE_DIR/poll-events.json"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-60}"
PHONE="${PHONE:-+15082827897}"
# Cap on concurrent event drivers. 3 matches the README's collision
# analysis ("3 concurrent claude --print sessions = MEDIUM risk"). Raise
# only if the Max plan can absorb it.
MAX_CONCURRENT="${POLL_EVENTS_MAX_CONCURRENT:-3}"

export PATH="$HOME/Library/pnpm:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$(security find-generic-password -s github-pat-fhir-place -a "$USER" -w 2>/dev/null || true)}"
export GH_TOKEN="$GITHUB_TOKEN"

if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "missing GITHUB_TOKEN" >&2
  exit 2
fi

mkdir -p "$LOG_DIR" "$STATE_DIR"
LOG_FILE="$LOG_DIR/poll-events.log"
exec > >(tee -a "$LOG_FILE") 2>&1

# Single-instance lock — only one poll daemon at a time.
LOCK_DIR="/tmp/fhir-place-poll-events.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  STALE_PID="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ -n "$STALE_PID" ]] && ! kill -0 "$STALE_PID" 2>/dev/null; then
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR"
  else
    echo "another poll-events daemon is running (pid ${STALE_PID:-?})"
    exit 0
  fi
fi
echo $$ > "$LOCK_DIR/pid"
trap 'rm -rf "$LOCK_DIR"' EXIT

# Bootstrap watermarks: first run defaults each stream to "now minus
# 10 minutes" so we don't replay history. Subsequent runs read the
# file.
if [[ ! -f "$STATE_FILE" ]]; then
  TEN_MIN_AGO=$(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
                || date -u --date='10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
  jq -n --arg t "$TEN_MIN_AGO" '{
    issues_opened: $t,
    prs_ready: $t,
    comments: $t
  }' > "$STATE_FILE"
  echo "Initialized state at $STATE_FILE (watermarks = $TEN_MIN_AGO)"
fi

# A collaborator's repo association — used to gate slash commands so
# random commenters can't trigger expensive runs.
is_collaborator() {
  local assoc="$1"
  case "$assoc" in
    OWNER|MEMBER|COLLABORATOR) return 0 ;;
    *) return 1 ;;
  esac
}

# Mark a comment as handled by adding a checkmark reaction. Idempotent;
# if we've already reacted, GitHub returns the same reaction.
mark_handled() {
  local comment_id="$1"
  gh api -X POST "repos/$REPO/issues/comments/$comment_id/reactions" \
    -f content=eyes >/dev/null 2>&1 || true
}

# Check if a comment already has our eyes reaction (= we already
# handled this slash command).
already_handled() {
  local comment_id="$1"
  local me
  me=$(gh api user --jq '.login' 2>/dev/null || echo "")
  gh api "repos/$REPO/issues/comments/$comment_id/reactions" \
    --jq "[.[] | select(.content == \"eyes\" and .user.login == \"$me\")] | length" \
    2>/dev/null | grep -q '^[1-9]'
}

# Has the issue-review prompt already left its marker on this issue?
issue_already_reviewed() {
  local issue="$1"
  gh api "repos/$REPO/issues/$issue/comments" \
    --jq '[.[] | select(.body | contains("<!-- issue-review:"))] | length' \
    2>/dev/null | grep -q '^[1-9]'
}

# Has the pr-review prompt already left its review on this PR?
pr_already_reviewed() {
  local pr="$1"
  gh api "repos/$REPO/pulls/$pr/reviews" \
    --jq '[.[] | select(.body | contains("<!-- pr-review:bot -->"))] | length' \
    2>/dev/null | grep -q '^[1-9]'
}

dispatch_async() {
  # Fire-and-forget the driver. The driver's own lock prevents
  # double-runs; we just want the poll loop to stay responsive.
  local script="$1"
  shift
  # Backpressure: never run more than MAX_CONCURRENT event drivers at
  # once. Count by command pattern because we detach with ( ... & ),
  # which hides the child from the parent shell's job table.
  while :; do
    local count
    count=$(pgrep -f "$REPO_ROOT/scripts/local/event-" 2>/dev/null | wc -l | tr -d ' ')
    [[ "$count" -lt "$MAX_CONCURRENT" ]] && break
    echo "→ concurrency cap reached ($count/$MAX_CONCURRENT); waiting 2s"
    sleep 2
  done
  ( "$script" "$@" & ) >/dev/null 2>&1
  echo "→ dispatched: $script $*"
}

poll_once() {
  local now_iso
  now_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  if [[ -f "$PAUSE_FILE" ]]; then
    return
  fi

  local prev
  prev=$(cat "$STATE_FILE")

  local issues_since prs_since comments_since
  issues_since=$(echo "$prev" | jq -r '.issues_opened')
  prs_since=$(echo "$prev" | jq -r '.prs_ready')
  comments_since=$(echo "$prev" | jq -r '.comments')

  # --- 1. New issues opened → fire issue-review ---
  local new_issues
  new_issues=$(gh api "repos/$REPO/issues?since=$issues_since&state=open&sort=created&direction=asc&per_page=20" \
    --jq '[.[] | select(.pull_request == null) | {number, created_at, user: .user.login}]' \
    2>/dev/null || echo '[]')
  echo "$new_issues" | jq -c '.[]' | while read -r row; do
    local num user created_at
    num=$(echo "$row" | jq -r '.number')
    user=$(echo "$row" | jq -r '.user')
    created_at=$(echo "$row" | jq -r '.created_at')
    # GitHub's /issues `since=` parameter filters by updated_at, not
    # created_at — so an old issue with a fresh label change comes back
    # looking like "new." Gate explicitly on created_at to avoid
    # re-reviewing stale issues every time someone re-labels them.
    if [[ ! "$created_at" > "$issues_since" ]]; then
      continue
    fi
    if issue_already_reviewed "$num"; then
      echo "skip issue-review #$num (already reviewed)"
      continue
    fi
    echo "issue #$num opened by $user → issue-review"
    dispatch_async "$REPO_ROOT/scripts/local/event-issue-review.sh" "$num"
  done

  # --- 2. PRs with non-draft state, no bot review yet → pr-review ---
  # Cheap heuristic: list open PRs updated since last poll, draft=false,
  # then skip those already-reviewed.
  local prs
  prs=$(gh api "repos/$REPO/pulls?state=open&sort=updated&direction=desc&per_page=30" \
    --jq "[.[] | select(.draft == false and .updated_at > \"$prs_since\") | {number, head_user: .user.login, updated_at}]" \
    2>/dev/null || echo '[]')
  echo "$prs" | jq -c '.[]' | while read -r row; do
    local num
    num=$(echo "$row" | jq -r '.number')
    if pr_already_reviewed "$num"; then
      continue
    fi
    echo "PR #$num non-draft, no bot review → pr-review"
    dispatch_async "$REPO_ROOT/scripts/local/event-pr-review.sh" "$num"
  done

  # --- 3. Slash commands in issue / PR comments ---
  # We poll the comments endpoint with a since= filter, filter by body
  # contents, gate on author_association, then react to mark handled.
  local comments
  comments=$(gh api "repos/$REPO/issues/comments?since=$comments_since&sort=created&direction=asc&per_page=30" \
    --jq '[.[] | {id, body, author_association, user: .user.login, html_url, issue_url}]' \
    2>/dev/null || echo '[]')
  echo "$comments" | jq -c '.[]' | while read -r row; do
    local cid body assoc url issue_url num
    cid=$(echo "$row" | jq -r '.id')
    body=$(echo "$row" | jq -r '.body')
    assoc=$(echo "$row" | jq -r '.author_association')
    url=$(echo "$row" | jq -r '.html_url')
    issue_url=$(echo "$row" | jq -r '.issue_url')
    num=$(basename "$issue_url")

    # Staging conflict marker — posted by github-actions[bot], bypass collaborator gate.
    if echo "$body" | grep -q '<!-- staging-stack-agent-dispatch '; then
      if echo "$url" | grep -q '/pull/'; then
        if already_handled "$cid"; then continue; fi
        local sha
        sha=$(echo "$body" | grep -o 'sha=[^ >]*' | cut -d= -f2 | head -1)
        echo "staging-conflict marker on PR #$num (comment $cid sha=$sha) → local resolver"
        mark_handled "$cid"
        dispatch_async "$REPO_ROOT/scripts/local/event-staging-conflict.sh" "$num" "$sha"
      fi
      continue
    fi

    if ! is_collaborator "$assoc"; then
      continue
    fi

    if echo "$body" | grep -qE '(^|[[:space:]])/dispatch-engineer([[:space:]]|$)'; then
      # /dispatch-engineer is issue-only per the workflow's docs.
      if echo "$url" | grep -q '/issues/'; then
        if already_handled "$cid"; then continue; fi
        echo "/dispatch-engineer on issue #$num (comment $cid) → engineer dispatch"
        mark_handled "$cid"
        dispatch_async "$REPO_ROOT/scripts/local/event-dispatch-engineer.sh" "$num"
      fi
    fi

    if echo "$body" | grep -qE '(^|[[:space:]])/resolve-conflicts([[:space:]]|$)'; then
      # /resolve-conflicts is PR-only.
      if echo "$url" | grep -q '/pull/'; then
        if already_handled "$cid"; then continue; fi
        echo "/resolve-conflicts on PR #$num (comment $cid) → conflict resolver"
        mark_handled "$cid"
        dispatch_async "$REPO_ROOT/scripts/local/event-resolve-conflicts.sh" "$num"
      fi
    fi

    if echo "$body" | grep -qE '(^|[[:space:]])/address-comments([[:space:]]|$)'; then
      # /address-comments is PR-only.
      if echo "$url" | grep -q '/pull/'; then
        if already_handled "$cid"; then continue; fi
        echo "/address-comments on PR #$num (comment $cid) → review-comment addresser"
        mark_handled "$cid"
        dispatch_async "$REPO_ROOT/scripts/local/event-address-comments.sh" "$num"
      fi
    fi
  done

  # Update watermarks to `now`. Slightly racy (a comment posted between
  # `now_iso` capture and the GH query won't be picked up until the next
  # poll), which is fine at 60s cadence.
  jq -n --arg issues "$now_iso" --arg prs "$now_iso" --arg comments "$now_iso" '{
    issues_opened: $issues,
    prs_ready: $prs,
    comments: $comments
  }' > "$STATE_FILE"
}

echo "=== poll-events daemon started (interval=${POLL_INTERVAL_SECONDS}s) ==="
while true; do
  if ! poll_once; then
    echo "::warning::poll iteration failed; will retry"
  fi
  sleep "$POLL_INTERVAL_SECONDS"
done
