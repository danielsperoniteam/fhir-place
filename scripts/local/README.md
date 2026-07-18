# Local agent automation

This directory contains shell drivers that run the SDLC prompts locally
on your machine (via `claude --print` with the OAuth session from
`claude login`) rather than on GitHub Actions (which uses the paid
`ANTHROPIC_API_KEY`). Same prompts, same agents, same safety rules —
just billed against the Claude Max subscription.

## Pieces

- [`../run-prompt-locally.sh`](../run-prompt-locally.sh) — the shared
  runner. Handles lock, log, pause file, dirty-tree refusal, and `--add-dir`
  for the worktree parent.
  Never sets `ANTHROPIC_API_KEY`, so `claude` falls back to OAuth.
- `engineer-dispatch.sh` — picks up to 3 ready issues per run, hands
  each to the engineer subagent in a worktree. Runs **twice daily** at
  09:00 and 14:00 ET while we get comfortable with the local drivers
  (it will go back to hourly once the cadence proves out).
- `daily-pm-triage.sh` — labels new issues, closes duplicates,
  re-checks blocked items. Runs 07:00 ET.
- `daily-qa-pass.sh` — exploratory Playwright walk of the demo, files
  bot bugs. Runs 05:00 ET.
- `daily-doc-sync.sh` — keeps the in-repo doc-sync wiki + redacted
  prompts in sync. Runs 06:00 ET.

Event-triggered prompts are dispatched by the polling daemon at
[`../poll-events.sh`](../poll-events.sh). It polls GitHub every
60s and fires the per-event drivers in this directory:

- `event-issue-review.sh <issue-number>` — new issue opened
- `event-pr-review.sh <pr-number>` — non-draft PR without a bot review
- `event-dispatch-engineer.sh <issue-number>` — `/dispatch-engineer` comment
- `event-resolve-conflicts.sh <pr-number>` — `/resolve-conflicts` comment

The poll daemon has its own launchd plist:
`scripts/launchd/com.fhir-place.poll-events.plist`. Install it the
same way as the cron plists; it runs as `KeepAlive: true` so it
restarts if it crashes.

## One-time setup

1. **Repo lives at `~/src/fhir-place`.** Other paths require setting
   `REPO_ROOT` in the launchd plist or your shell.

2. **Log in to Claude.** Run `claude login` once. The OAuth session
   gets stored in `~/.config/claude` (or platform equivalent). Without
   this, the drivers will exit early because `claude --print` can't
   authenticate.

3. **Stash a GitHub PAT in the keychain.** Create a fine-grained PAT
   at <https://github.com/settings/personal-access-tokens> with the
   permissions each prompt needs (typically: repo read/write, issues
   read/write, pull requests read/write). Save it as:

   ```bash
   security add-generic-password \
     -s github-pat-fhir-place \
     -a "$USER" \
     -w '<your-PAT>'
   ```

   The runner reads this in via `security find-generic-password`
   automatically.

4. **Install the launchd plists.** For each driver you want on a
   schedule:

   ```bash
   cp scripts/launchd/com.fhir-place.daily-pm-triage.plist ~/Library/LaunchAgents/
   sed -i '' "s#__HOME__#$HOME#g" ~/Library/LaunchAgents/com.fhir-place.daily-pm-triage.plist
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.fhir-place.daily-pm-triage.plist
   ```

   Repeat for `daily-qa-pass`, `daily-doc-sync`, `hourly-engineer-dispatch`,
   and `poll-events` as desired.
   `poll-events` is the daemon that handles event-triggered prompts
   (new issue, new PR, slash commands) — install it the same way as
   the cron plists; its plist sets `KeepAlive: true` so it restarts if
   it crashes.

5. **Disable the corresponding GHA workflow.** Once a local driver is
   stable, rename its GHA counterpart (`mv foo.yml foo.yml.disabled`)
   or add `if: false` at the job level. Keeping the YAML around makes
   it easy to flip back to GHA-only if the local machine is down.

## Pause switch

Touch `~/.fhir-place-pause` to skip every local runner on its next
trigger. Remove the file to resume. The pause file is also respected
by the existing `dispatch-engineer.sh` shim.

## Smoke test

```bash
# Run a driver by hand to verify it works without waiting for the cron
~/src/fhir-place/scripts/local/daily-pm-triage.sh
# tail the log it just wrote
ls -t ~/src/fhir-place/logs/daily-pm-triage-*.log | head -1 | xargs tail -50
```

If you get "missing GITHUB_TOKEN", the keychain step didn't take. If
you get "claude: command not found", install via `npm i -g claude` and
log in.

## Tradeoffs vs GHA

| | local (this directory) | GHA |
|---|---|---|
| Billing | Claude Max subscription | per-token API spend |
| Always-on | needs your machine awake | always |
| Logs | `$REPO_ROOT/logs/*.log` | Actions tab |
| Trigger | launchd cron + `poll-events.sh` daemon | GitHub events directly |
| Security | runs as you, with your secrets in keychain | runs in sandboxed runner with repo secrets |

The pattern is: cron-fired routines run via launchd; event-fired
routines (new-issue, new-PR, slash commands) run via the
`poll-events.sh` daemon, which queries GitHub on a 60s loop. Latency
is ~30s average for event-fired prompts vs. ~5s for GHA webhooks —
acceptable for these flows.

## SDLC transitions: trigger and where AI runs

Each row is a state transition in the issue/PR lifecycle. "Trigger"
is how the action fires; "AI runner" is where any LLM work executes
(and therefore what bills it).

`Local Claude` = `claude --print` here, on Daniel's Mac, against the
Claude Max OAuth session — subscription-billed.
`Hosted Claude` = `anthropics/claude-code-action@v1` on GHA against
`ANTHROPIC_API_KEY` — pay-per-token.
`Hosted Codex` = ChatGPT Codex GitHub app — covered by the Codex
subscription.
`No AI` = deterministic script (Node / shell / labeler), no LLM.

| Transition | Triggered by | Workflow / driver | AI runner | Notes |
| --- | --- | --- | --- | --- |
| New issue → triaged (labels, dedupe, priority) | `poll-events.sh` (local, every 60s) | `scripts/local/event-issue-review.sh` | Local Claude | The hosted agent job is disabled. |
| Stale backlog → triaged overnight | launchd daily | `scripts/local/daily-pm-triage.sh` | Local Claude | The hosted agent job is disabled. |
| Ready issue → bot branch + PR | launchd twice daily (09:00, 14:00 ET) | `scripts/local/engineer-dispatch.sh` | Local Claude | Heaviest workload; the hosted agent job is disabled. |
| `/dispatch-engineer` comment on issue | `poll-events.sh` (local, every 60s) | `scripts/local/event-dispatch-engineer.sh` | Local Claude | Collaborator-gated; eyes reaction marks dispatched. |
| PR opened / ready_for_review → automated review | `poll-events.sh` (local, every 60s) plus Codex auto-review | `scripts/local/event-pr-review.sh` plus Codex GitHub app | Local Claude plus Hosted Codex | The GitHub Actions Claude job is disabled. |
| Reviewer requests one hosted preview | `preview: staging` label or manual workflow dispatch | `.github/workflows/preview-pr-on-staging.yml` + `.github/workflows/pages.yml` | No AI | Deterministic `main + one PR`; comments the deployed SHA after Pages succeeds. |
| `/resolve-conflicts` comment on PR, or same-repository PR blocked by merge conflicts | `poll-events.sh` (local, every 60s; conflict scan every 5 minutes) | `scripts/local/event-resolve-conflicts.sh` | Local Claude | Collaborator-gated on manual command. Automatic runs use a clean control worktree and a durable `(base SHA, head SHA)` marker with two-hour backoff. The hosted workflow remains disabled. |
| PR becomes mergeable to `main` | required CI + CODEOWNER approval | protected PR flow | No AI | Hosted preview is optional evidence, not a separate merge path. |
| Merge to `main` → Pages deploy | `push: main` (GHA) | `.github/workflows/pages.yml` | No AI | Deterministic. |
| Daily exploratory QA against real FHIR | launchd daily | `scripts/local/daily-qa-pass.sh` | Local Claude | Heaviest single workload; the hosted agent job is disabled. |
| Daily docs freshness check | cron daily | `scripts/local/daily-doc-sync.sh` (local) | Local Claude (subscription) | No GHA equivalent — local is the only runner. |
| Nightly live-site Playwright | cron daily | `.github/workflows/live-site-monitor.yml` | No AI | Fixed suite, deterministic. |
| Nightly integration | cron daily | `.github/workflows/integration.yml` | No AI | Real-FHIR Playwright suite. |
| Issue / PR / label / project state changes | `issues`, `pull_request`, `push` (GHA) | `.github/workflows/project-sync.yml` | No AI | Pure script. |
| Label vocab changes on main | `push: main` (paths) | `.github/workflows/sync-labels.yml` | No AI | Pure script. |
| Workflow failure | `workflow_run: failure` (GHA) | `.github/workflows/on-failure-issue.yml` | No AI | Files an issue on red runs. |

**Cost-shifting summary.** Every "Local Claude" row above runs on the Max
subscription through launchd or `poll-events.sh`. Check each workflow before
assuming a hosted twin is live; conflict resolution and PR fixup jobs are
explicitly disabled in Actions. Deterministic GitHub workflows do not spend
model tokens.

## SDLC feedback-loop closes (this PR)

The gap analysis on PR #479 named four missing transitions in the
feedback loop after a bot PR was opened. This PR closes all four:

| Gap | How it's closed |
| --- | --- |
| **1. Address review comments** | New `/address-comments` slash command. Maintainer comments `/address-comments` on a PR → the dispatcher reads every unresolved review thread, applies the smallest fix, pushes one commit, replies inline. Mirrors `/resolve-conflicts` exactly. Workflow: `.github/workflows/address-comments.yml`. Prompt: `docs/prompts/address-comments.md`. Local driver: `scripts/local/event-address-comments.sh` (dispatched by `poll-events.sh`). |
| **2. Feature branch behind main** | Already covered by GitHub's native repo settings — `allow_auto_merge: true` and `allow_update_branch: true` are enabled, so the "Update branch" hint shows and the Auto-merge button is available. No custom workflow needed; using the platform lever instead. Real conflicts (where merging isn't a fast-forward) still go through `/resolve-conflicts`, which dispatches the agent. |
| **3. Random CI failures on PR branches** | New `.github/workflows/pr-ci-flake-handler.yml`. Listens for `workflow_run.failure` on PR branches (skips `main` / `staging` — those are `on-failure-issue.yml`'s turf). Two retries before escalating; on the 3rd consecutive failure on the same commit, it stops retrying and posts a comment that hands off to `pr-fixup-dispatch`. No label applied — the dispatcher picks up red-CI PRs from its own queue filter. |
| **4. Engineer dispatcher PR mode** | New `pr-fixup-dispatch` prompt + workflow + local driver + plist. Sibling of `hourly-engineer-dispatch` but operates on **existing** bot PRs (red CI or unresolved review threads) and pushes to the existing branch. Runs at **09:30 + 14:30 ET** — staggered 30 min after the issue-mode dispatcher (09:00 / 14:00) so the engineer subagent doesn't get rate-limited running both at once. |

### How they layer

```
issue -> engineer dispatch -> bot PR to main -> CI + review -> human merge
                                      |              |
                                      |              +-> requested comments -> address-comments
                                      +-> red CI -> bounded retry -> PR fixup
                                      +-> merge conflict -> resolve on the PR branch against main
                                      +-> optional hosted preview -> main + this PR on staging
```

Agents own the genuinely-hard decisions (real conflicts, real bugs,
ambiguous review comments). Deterministic infra owns the rest (retries,
fast-forward updates, label flow).

## Schedule calendar

When does each cron-fired routine run? All times shown in **ET** because
launchd uses local time and Daniel works in `America/New_York`. GHA
schedules are converted from their UTC `cron` lines.

### 24-hour view (ET)

```
hour    local launchd                       GHA cron (still on)
────    ─────────────────────────────────   ─────────────────────────────────
EST 00          -                           qa-pass + integration  (00:00 EST / 01:00 EDT)
EST 01          -                           live-site-monitor      (01:30 EST / 02:30 EDT)
EST 02          -                           pm-triage              (02:00 EST / 03:00 EDT)
   03           -                                    -
   04           -                                    -
   05    qa-pass            (05:00)                  -
   06    doc-sync           (06:00)                  -
   07    pm-triage          (07:00)                  -
   08           -                                    -
   09    engineer-dispatch  (09:00)                  -
EST 10          -                           engineer-dispatch      (10:05 EST / 11:05 EDT)
   11           -                                    -
   12           -                                    -
   13           -                                    -
   14    engineer-dispatch  (14:00)                  -
   15 … 23      -                                    -

DST notes:
- launchd `StartCalendarInterval` is local clock time — 07:00 ET year-round.
- GHA `cron` is UTC, so GHA fires shift an hour with DST. Rows above show
  EST first / EDT in parens.
```

## Collision analysis

The runner uses a per-prompt lockfile (`/tmp/fhir-place-<name>.lock`),
so two copies of the **same** prompt cannot stomp on each other. The
risks below are **different** prompts firing close together.

### Concrete overlap windows (ET)

With engineer-dispatch on a twice-daily schedule (09:00 + 14:00), the
sharp QA-pass collision is gone. Hosted preview deployment is event-driven
and does not consume the local Claude session.

### Cross-routine hazards

1. **Port 5173 (HIGH).** The QA pass owns it for the run's duration
   (~30–60 min). If engineer-dispatch fires during that window and
   picks a ticket that needs screenshots, the subagent's
   `pnpm --filter @fhir-place/demo dev` will fail to bind. **Mitigation:**
   either move engineer-dispatch off `:05` during the 05:00 QA window,
   or have the engineer subagent fall back to a random free port for
   screenshots.
2. **Claude Max rate limits (MEDIUM).** Three concurrent `claude --print`
   sessions during overlap windows count against the same Max account.
   Hitting the limit silently degrades the output of whichever session
   gets throttled. **Mitigation:** stagger by ≥10 min within an hour.
3. **GitHub PAT rate limit (LOW).** Fine-grained PAT gets 5000 req/hr.
   Combined ceiling across the active routines is well under that.
4. **Mac CPU under load (MEDIUM).** Two Playwright runs concurrently
   (QA + engineer screenshots) on an M-series Mac is OK; Playwright +
   `pnpm build` + e2e on top of that may bottleneck. **Mitigation:**
   same as #1 — don't run engineer-dispatch during QA window.
5. **Same `~/src/fhir-place` checkout (LOW).** The runner refuses to
   start when the working tree is dirty, and engineer-dispatch creates
   its own `wt-*` worktrees. Nothing mutates the primary checkout from
   inside a routine.
6. **Concurrent failures (LOW).** If three routines fail in the same window,
   each logs independently to `logs/`. Check logs to diagnose.

### Current schedule (this PR)

```
05:00  qa-pass            (heavy, owns :5173, ~30–60 min)
06:00  doc-sync           (light)
07:00  pm-triage          (medium)
09:00  engineer-dispatch  ← morning fire (twice daily, not hourly)
14:00  engineer-dispatch  ← afternoon fire (twice daily, not hourly)
```

Twice-daily engineer-dispatch is the temporary cadence — both fires
land well after QA-pass is done, so the `:5173` contention is gone.
We'll move back to hourly once we trust the local cadence (the prompt
file is still named `hourly-engineer-dispatch.md` so the rename is a
no-op).

### When we eventually flip back to hourly

The plist's `StartCalendarInterval` array goes back to a single
`<dict><key>Minute</key><integer>30</integer></dict>` entry. `:30`
(not `:05`) avoids the residual qa-pass overlap window if the prompt
ever picks a screenshot-requiring ticket and we're still inside
QA-pass's run. If even that feels risky, add a guard at the top of
`scripts/local/engineer-dispatch.sh`:

```bash
# Skip engineer-dispatch during the QA-pass window — they fight for :5173.
hour=$(date +%H)
if [[ "$hour" == "05" ]] && curl -fsS http://localhost:5173 > /dev/null 2>&1; then
  echo "qa-pass is running — skipping this engineer-dispatch fire"
  exit 0
fi
```
