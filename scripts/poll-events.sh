#!/usr/bin/env bash
# Polls GitHub for events that the GHA event-triggered workflows would
# react to (issue opened, PR opened/ready, /dispatch-engineer comment,
# /resolve-conflicts comment) and dispatches the corresponding local
# event driver under scripts/local/.
#
# Every 60s: new issues → issue-review; non-draft PRs → pr-review;
#   slash commands; bot PR human reviews → address-comments.
# When main advances: update every clean same-repository PR branch.
# Every 5min: same-repository PR merge conflicts → resolve-conflicts.
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
CONFLICT_LEASE_DIR="$STATE_DIR/conflict-dispatches"
LOG_DIR="${LOG_DIR:-$REPO_ROOT/logs}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-60}"
CONFLICT_RETRY_SECONDS="${CONFLICT_RETRY_SECONDS:-7200}"
MAIN_SYNC_RETRY_SECONDS="${MAIN_SYNC_RETRY_SECONDS:-600}"
# Cap on concurrent event drivers. 3 matches the README's collision
# analysis ("3 concurrent claude --print sessions = MEDIUM risk"). Raise
# only if the Max plan can absorb it.
MAX_CONCURRENT="${POLL_EVENTS_MAX_CONCURRENT:-3}"
EVENT_SLOT_ROOT="${POLL_EVENTS_SLOT_ROOT:-/tmp/fhir-place-poll-events-slots}"

export PATH="$HOME/Library/pnpm:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export GITHUB_TOKEN="${GITHUB_TOKEN:-$(security find-generic-password -s github-pat-fhir-place -a "$USER" -w 2>/dev/null || true)}"
export GH_TOKEN="$GITHUB_TOKEN"

if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "missing GITHUB_TOKEN" >&2
  exit 2
fi

mkdir -p "$LOG_DIR" "$STATE_DIR" "$CONFLICT_LEASE_DIR" "$EVENT_SLOT_ROOT"
LOG_FILE="$LOG_DIR/poll-events.log"
exec > >(tee -a "$LOG_FILE") 2>&1

write_json_atomically() {
  local destination="$1"
  local json="$2"
  local directory temporary
  directory=$(dirname "$destination")
  mkdir -p "$directory"
  temporary=$(mktemp "$directory/.poll-events.XXXXXX") || return 1
  if ! printf '%s\n' "$json" > "$temporary"; then
    rm -f "$temporary"
    return 1
  fi
  mv "$temporary" "$destination"
}

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

# Recover slots left by a killed daemon. A live child owns a PID file; every
# other directory is stale because the single-instance poller is already held.
for slot in "$EVENT_SLOT_ROOT"/*; do
  [[ -d "$slot" ]] || continue
  slot_pid=$(cat "$slot/pid" 2>/dev/null || true)
  if [[ -z "$slot_pid" ]] || ! kill -0 "$slot_pid" 2>/dev/null; then
    rm -rf "$slot"
  fi
done

# Bootstrap watermarks: first run defaults each stream to "now minus
# 10 minutes" so we don't replay history. Subsequent runs read the
# file.
if [[ ! -s "$STATE_FILE" ]] || ! jq -e 'type == "object"' "$STATE_FILE" >/dev/null 2>&1; then
  TEN_MIN_AGO=$(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
                || date -u --date='10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
  INITIAL_STATE=$(jq -n --arg t "$TEN_MIN_AGO" '{
    issues_opened: $t,
    prs_ready: $t,
    comments: $t,
    reviews: $t,
    last_main_sha: "",
    main_sync_retry_after_epoch: 0
  }')
  if ! write_json_atomically "$STATE_FILE" "$INITIAL_STATE"; then
    echo "unable to initialize $STATE_FILE; refusing to poll without durable state" >&2
    exit 2
  fi
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

is_writable_main_pr() {
  local pr="$1"
  gh api "repos/$REPO/pulls/$pr" \
    --jq ".head.repo.full_name == \"$REPO\" and .base.ref == \"main\"" \
    2>/dev/null | grep -q '^true$'
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
  # Backpressure: reserve one of a fixed number of atomic directory slots.
  # This survives event drivers exec'ing into the generic runner and avoids
  # relying on process command-line spelling.
  local slot child_pid slot_number candidate candidate_pid
  while :; do
    slot=""
    for slot_number in $(seq 1 "$MAX_CONCURRENT"); do
      candidate="$EVENT_SLOT_ROOT/$slot_number"
      if mkdir "$candidate" 2>/dev/null; then
        slot="$candidate"
        break
      fi
      candidate_pid=$(cat "$candidate/pid" 2>/dev/null || true)
      if [[ -n "$candidate_pid" ]] && ! kill -0 "$candidate_pid" 2>/dev/null; then
        rm -rf "$candidate"
        if mkdir "$candidate" 2>/dev/null; then
          slot="$candidate"
          break
        fi
      fi
    done
    [[ -n "$slot" ]] && break
    echo "→ concurrency cap reached ($MAX_CONCURRENT/$MAX_CONCURRENT); waiting 2s"
    sleep 2
  done

  (
    trap 'rm -rf "$slot"' EXIT INT TERM
    "$script" "$@"
  ) >/dev/null 2>&1 &
  child_pid=$!
  printf '%s\n' "$child_pid" > "$slot/pid" 2>/dev/null || true
  echo "→ dispatched: $script $*"
}

dispatch_conflict_once() {
  local num="$1"
  local head="$2"
  local head_sha="$3"
  local base_sha="$4"
  local lease_file="$CONFLICT_LEASE_DIR/$num.json"
  local now_epoch previous_head_sha previous_base_sha previous_epoch lease
  now_epoch=$(date -u +%s)
  previous_head_sha=""
  previous_base_sha=""
  previous_epoch=0

  if [[ -s "$lease_file" ]] && jq -e 'type == "object"' "$lease_file" >/dev/null 2>&1; then
    previous_head_sha=$(jq -r '.head_sha // ""' "$lease_file")
    previous_base_sha=$(jq -r '.base_sha // ""' "$lease_file")
    previous_epoch=$(jq -r '.dispatched_at_epoch // 0' "$lease_file")
  fi

  if [[ "$previous_head_sha" == "$head_sha" ]] &&
     [[ "$previous_base_sha" == "$base_sha" ]] &&
     (( now_epoch - previous_epoch < CONFLICT_RETRY_SECONDS )); then
    echo "PR #$num conflict already dispatched for head=$head_sha base=$base_sha — skip"
    return 0
  fi

  lease=$(jq -n \
    --arg head "$head" \
    --arg head_sha "$head_sha" \
    --arg base_sha "$base_sha" \
    --argjson dispatched_at_epoch "$now_epoch" \
    '{head: $head, head_sha: $head_sha, base_sha: $base_sha, dispatched_at_epoch: $dispatched_at_epoch}')
  if ! write_json_atomically "$lease_file" "$lease"; then
    echo "unable to persist conflict lease for PR #$num; refusing duplicate-prone dispatch" >&2
    return 1
  fi

  echo "PR #$num ($head) conflicts with main → auto resolve-conflicts"
  dispatch_async "$REPO_ROOT/scripts/local/event-resolve-conflicts.sh" "$num"
}

sync_open_prs_with_main() {
  local main_sha="$1"
  local pulls row num head head_sha behind mergeable update_output
  local attempt updated_head updated_behind update_confirmed
  local had_error=0

  pulls=$(gh api --paginate --slurp \
    "repos/$REPO/pulls?state=open&base=main&per_page=100" 2>/dev/null | \
    jq "add | [.[] | select(.head.repo.full_name == \"$REPO\") | {number, head: .head.ref, head_sha: .head.sha}]") || return 1

  while read -r row; do
    num=$(echo "$row" | jq -r '.number')
    head=$(echo "$row" | jq -r '.head')
    head_sha=$(echo "$row" | jq -r '.head_sha')
    behind=$(gh api "repos/$REPO/compare/${main_sha}...${head_sha}" --jq '.behind_by' 2>/dev/null || echo unknown)

    if [[ "$behind" == "0" ]]; then
      continue
    fi
    if [[ "$behind" == "unknown" ]]; then
      echo "PR #$num: unable to compare $head with main; will retry"
      had_error=1
      continue
    fi

    mergeable=$(gh api "repos/$REPO/pulls/$num" --jq '.mergeable' 2>/dev/null || echo unknown)
    case "$mergeable" in
      true)
        if update_output=$(gh api -X PUT "repos/$REPO/pulls/$num/update-branch" \
          -H "Accept: application/vnd.github+json" \
          -f expected_head_sha="$head_sha" 2>&1); then
          update_confirmed=false
          for attempt in 1 2 3 4 5; do
            sleep 2
            updated_head=$(gh api "repos/$REPO/pulls/$num" --jq '.head.sha' 2>/dev/null || echo unknown)
            updated_behind=$(gh api "repos/$REPO/compare/${main_sha}...${updated_head}" --jq '.behind_by' 2>/dev/null || echo unknown)
            if [[ "$updated_behind" == "0" ]]; then
              update_confirmed=true
              break
            fi
          done
          if [[ "$update_confirmed" == true ]]; then
            echo "PR #$num ($head) updated with main"
          else
            echo "PR #$num: update accepted but not confirmed; will retry"
            had_error=1
          fi
        else
          echo "PR #$num: update-branch failed; will retry: $update_output"
          had_error=1
        fi
        ;;
      false)
        dispatch_conflict_once "$num" "$head" "$head_sha" "$main_sha" || had_error=1
        ;;
      *)
        echo "PR #$num: GitHub mergeability is pending; will retry"
        had_error=1
        ;;
    esac
  done < <(echo "$pulls" | jq -c '.[]')

  return "$had_error"
}

poll_once() {
  local now_iso
  now_iso=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  if [[ -f "$PAUSE_FILE" ]]; then
    return
  fi

  local prev
  prev=$(cat "$STATE_FILE")

  # Whenever main advances, bring every same-repository PR forward while the
  # merge is still clean. Genuine conflicts go to the isolated agent resolver.
  # The PAT-backed update-branch call emits normal synchronize events, so CI
  # reruns on the new head commit.
  local last_main_sha current_main_sha retry_after_epoch now_epoch next_retry_epoch
  last_main_sha=$(echo "$prev" | jq -r '.last_main_sha // ""')
  retry_after_epoch=$(echo "$prev" | jq -r '.main_sync_retry_after_epoch // 0')
  now_epoch=$(date -u +%s)
  current_main_sha=$(gh api "repos/$REPO/git/ref/heads/main" --jq '.object.sha' 2>/dev/null || echo "")
  if [[ -n "$current_main_sha" ]] &&
     { [[ "$current_main_sha" != "$last_main_sha" ]] || (( now_epoch >= retry_after_epoch && retry_after_epoch > 0 )); }; then
    echo "main sync ${last_main_sha:-<initial>} → $current_main_sha; syncing open PRs"
    if sync_open_prs_with_main "$current_main_sha"; then
      next_retry_epoch=0
    else
      next_retry_epoch=$((now_epoch + MAIN_SYNC_RETRY_SECONDS))
      echo "open-PR sync incomplete; retry scheduled in ${MAIN_SYNC_RETRY_SECONDS}s"
    fi
    prev=$(echo "$prev" | jq \
      --arg sha "$current_main_sha" \
      --argjson retry "$next_retry_epoch" \
      '.last_main_sha = $sha | .main_sync_retry_after_epoch = $retry')
  fi

  local issues_since prs_since comments_since reviews_since
  issues_since=$(echo "$prev" | jq -r '.issues_opened')
  prs_since=$(echo "$prev" | jq -r '.prs_ready')
  comments_since=$(echo "$prev" | jq -r '.comments')
  reviews_since=$(echo "$prev" | jq -r '.reviews // .prs_ready')

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
    local cid body assoc user url issue_url num
    cid=$(echo "$row" | jq -r '.id')
    body=$(echo "$row" | jq -r '.body')
    assoc=$(echo "$row" | jq -r '.author_association')
    user=$(echo "$row" | jq -r '.user')
    url=$(echo "$row" | jq -r '.html_url')
    issue_url=$(echo "$row" | jq -r '.issue_url')
    num=$(basename "$issue_url")

    # Staging conflict marker — posted by github-actions[bot], bypass collaborator gate.
    if [[ "$user" == "github-actions[bot]" ]] &&
       echo "$body" | grep -q '<!-- staging-stack-agent-dispatch '; then
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
        if ! is_writable_main_pr "$num"; then
          echo "/resolve-conflicts rejected for PR #$num (fork or non-main base)"
          mark_handled "$cid"
          continue
        fi
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

  # --- 4. Bot PR reviews → auto-address-comments ---
  # Fetch bot/* PRs updated since last poll. For each, check if a human
  # review was submitted since the reviews watermark; if so, dispatch the
  # address-comments agent. The agent handles idempotency (it checks what's
  # actually unresolved), so firing on any new review is safe.
  local bot_prs_updated
  bot_prs_updated=$(gh api "repos/$REPO/pulls?state=open&sort=updated&direction=desc&per_page=30" \
    --jq "[.[] | select(.draft == false and (.head.ref | startswith(\"bot/\")) and .updated_at > \"$reviews_since\") | {number, head: .head.ref}]" \
    2>/dev/null || echo '[]')
  echo "$bot_prs_updated" | jq -c '.[]' | while read -r row; do
    local num head
    num=$(echo "$row" | jq -r '.number')
    head=$(echo "$row" | jq -r '.head')
    local new_reviews
    new_reviews=$(gh api "repos/$REPO/pulls/$num/reviews" \
      --jq "[.[] | select(.submitted_at > \"$reviews_since\" and .user.type != \"Bot\" and (.state == \"CHANGES_REQUESTED\" or (.state == \"COMMENTED\" and (.body | length) > 0)))] | length" \
      2>/dev/null || echo '0')
    if [[ "$new_reviews" -gt 0 ]]; then
      echo "bot PR #$num ($head) got new human review → auto address-comments"
      dispatch_async "$REPO_ROOT/scripts/local/event-address-comments.sh" "$num"
    fi
  done

  # --- 5. Conflicting PRs → auto-resolve-conflicts (every 5th poll ≈5 min) ---
  # Checking merge status on every open PR every 60s is too many API calls.
  # Run this check every 5th iteration (~5 min). GitHub computes mergeStateStatus
  # lazily, so UNKNOWN means "not yet computed" — skip those gracefully.
  # Covers all same-repository PRs targeting main, including drafts. Fork PRs
  # are excluded because the local PAT must never write to an untrusted repo.
  if (( POLL_ITER % 5 == 0 )); then
    local conflicting_prs scan_main_sha
    scan_main_sha=$(gh api "repos/$REPO/git/ref/heads/main" --jq '.object.sha' 2>/dev/null || echo unknown)
    conflicting_prs=$(gh pr list --repo "$REPO" --state open --limit 100 \
      --json number,baseRefName,headRefName,headRefOid,headRepositoryOwner,headRepository,mergeStateStatus \
      --jq "[.[] | select(.baseRefName == \"main\" and .headRepositoryOwner.login == \"${REPO%/*}\" and .headRepository.name == \"${REPO#*/}\") | {number, head: .headRefName, head_sha: .headRefOid, mergeable: .mergeStateStatus}]" \
      2>/dev/null || echo '[]')
    echo "$conflicting_prs" | jq -c '.[]' | while read -r row; do
      local num head head_sha mergeable
      num=$(echo "$row" | jq -r '.number')
      head=$(echo "$row" | jq -r '.head')
      head_sha=$(echo "$row" | jq -r '.head_sha')
      mergeable=$(echo "$row" | jq -r '.mergeable')
      [[ "$mergeable" != "DIRTY" ]] && continue
      [[ "$scan_main_sha" != unknown ]] && dispatch_conflict_once "$num" "$head" "$head_sha" "$scan_main_sha"
    done
  fi

  # Update watermarks to `now`. Slightly racy (a comment posted between
  # `now_iso` capture and the GH query won't be picked up until the next
  # poll), which is fine at 60s cadence.
  prev=$(echo "$prev" | jq \
    --arg issues "$now_iso" \
    --arg prs "$now_iso" \
    --arg comments "$now_iso" \
    --arg reviews "$now_iso" \
    '.issues_opened = $issues |
     .prs_ready = $prs |
     .comments = $comments |
     .reviews = $reviews')
  if ! write_json_atomically "$STATE_FILE" "$prev"; then
    echo "unable to persist poll state; keeping previous state for safe retry" >&2
    return 1
  fi
}

POLL_ITER=0
echo "=== poll-events daemon started (interval=${POLL_INTERVAL_SECONDS}s) ==="
while true; do
  if ! poll_once; then
    echo "::warning::poll iteration failed; will retry"
  fi
  (( POLL_ITER++ )) || true
  sleep "$POLL_INTERVAL_SECONDS"
done
