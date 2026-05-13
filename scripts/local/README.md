# Local agent automation

This directory contains shell drivers that run the SDLC prompts locally
on your machine (via `claude --print` with the OAuth session from
`claude login`) rather than on GitHub Actions (which uses the paid
`ANTHROPIC_API_KEY`). Same prompts, same agents, same safety rules —
just billed against the Claude Max subscription.

## Pieces

- [`../run-agent-prompt-locally.sh`](../run-agent-prompt-locally.sh) —
  the provider-aware runner. Handles lock, log, pause file, dirty-tree
  refusal, iMessage notification on failure, and `--add-dir` for the
  worktree parent. Defaults to Claude, but supports
  `AGENT_PROVIDER=codex`, `AGENT_PROVIDER=random`, and
  `AGENT_PROVIDER=codex-cloud`.
- [`../run-prompt-locally.sh`](../run-prompt-locally.sh) — the legacy
  Claude-only runner. Keep as a fallback while the provider-aware path
  bakes in.
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
- `hourly-uat-validation.sh` — walks each open PR's "UAT on live
  staging" checklist against `/staging/`, sets `uat: passed` /
  `uat: failed` labels. Runs at :15.

Event-triggered prompts are dispatched by the polling daemon at
[`../poll-events.sh`](../poll-events.sh). It polls GitHub every
60s and fires the per-event drivers in this directory:

- `event-issue-review.sh <issue-number>` — new issue opened
- `event-pr-review.sh <pr-number>` — non-draft PR without a bot review
- `event-dispatch-engineer.sh <issue-number>` — `/dispatch-engineer` comment
- `event-resolve-conflicts.sh <pr-number>` — `/resolve-conflicts` comment
- `pr-cross-review.sh <pr-number>` — advisory second-pass review so Codex
  can review Claude work, or Claude can review Codex work, without posting
  a blocking GitHub review.

The poll daemon has its own launchd plist:
`scripts/launchd/com.fhir-place.poll-events.plist`. Install it the
same way as the cron plists; it runs as `KeepAlive: true` so it
restarts if it crashes.

## One-time setup

1. **Repo lives at `~/src/fhir-place`.** Other paths require setting
   `REPO_ROOT` in the launchd plist or your shell.

2. **Log in to Claude and Codex.** Run `claude login` once for Claude
   local runs and `codex login` once for Codex local/cloud submission.
   `AGENT_PROVIDER=claude` remains the default for existing launchd jobs.

3. **Stash a GitHub PAT in the keychain.** Create a fine-grained PAT
   at <https://github.com/settings/personal-access-tokens> with the
   permissions each prompt needs (typically: repo read/write, issues
   read/write, pull requests read/write). Save it as:

   ```bash
   security add-generic-password \
     -U \
     -s github-pat-fhir-place \
     -a "$USER" \
     -w '<your-PAT>'
   ```

   The runner reads this in via `security find-generic-password`
   automatically.

4. **Configure Codex Cloud environment by code.** In the Codex cloud
   environment settings, set:

   - setup command: `scripts/codex-cloud-setup.sh`
   - maintenance command: `scripts/codex-cloud-maintenance.sh`
   - required non-secret environment variables for the task class

   Environment variables are available for the full Codex Cloud task.
   Secrets are only available during setup and are removed before the
   agent phase. So do not put a GitHub PAT in a setup-only secret if the
   prompt expects to run `gh` during the agent phase. Prefer Codex's
   GitHub integration for PR creation/review flows; only use a scoped
   `GH_TOKEN` / `GITHUB_TOKEN` environment variable for cloud prompts that
   truly need GitHub CLI mutation.

5. **Install the launchd plists.** For each driver you want on a
   schedule:

   ```bash
   cp scripts/launchd/com.fhir-place.daily-pm-triage.plist ~/Library/LaunchAgents/
   sed -i '' "s#__HOME__#$HOME#g" ~/Library/LaunchAgents/com.fhir-place.daily-pm-triage.plist
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.fhir-place.daily-pm-triage.plist
   ```

   Repeat for `daily-qa-pass`, `daily-doc-sync`, `hourly-engineer-dispatch`,
   `hourly-uat-validation`, and `poll-events` as desired.
   `poll-events` is the daemon that handles event-triggered prompts
   (new issue, new PR, slash commands) — install it the same way as
   the cron plists; its plist sets `KeepAlive: true` so it restarts if
   it crashes.

6. **Disable the corresponding GHA workflow.** Once a local driver is
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

Provider smoke tests:

```bash
AGENT_PROVIDER=claude ~/src/fhir-place/scripts/local/event-issue-review.sh 491
AGENT_PROVIDER=codex ~/src/fhir-place/scripts/local/pr-cross-review.sh 468
CODEX_CLOUD_ENV=<env-id> ~/src/fhir-place/scripts/codex-cloud-submit.sh pr-cross-review --for "PR #468 cross-review by codex"
```

If you get "missing GITHUB_TOKEN", the keychain step didn't take. If
you get "claude: command not found", install Claude and log in. If you
get "codex: command not found", install Codex and run `codex login`. If
cloud submission says `CODEX_CLOUD_ENV` is missing, set it to the target
Codex Cloud environment id.

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
`Local Codex` = `codex exec` here, on Daniel's Mac, against the ChatGPT
Codex subscription. Select with `AGENT_PROVIDER=codex`.
`Codex Cloud` = `codex cloud exec` against a named cloud environment.
Select with `AGENT_PROVIDER=codex-cloud` and `CODEX_CLOUD_ENV=<env-id>`.
`Hosted Claude` = `anthropics/claude-code-action@v1` on GHA against
`ANTHROPIC_API_KEY` — pay-per-token.
`Hosted Codex` = ChatGPT Codex GitHub app — covered by the Codex
subscription.
`No AI` = deterministic script (Node / shell / labeler), no LLM.

| Transition | Triggered by | Workflow / driver | AI runner | Notes |
| --- | --- | --- | --- | --- |
| New issue → triaged (labels, dedupe, priority) | `poll-events.sh` (local, every 60s) **+** `issues: opened` (GHA) | `scripts/local/event-issue-review.sh` (local) **+** `.github/workflows/issue-review.yml` (GHA, still on) | Local Claude by default; Local Codex pilot-safe | Disable GHA copy once the daemon proves out. |
| Stale backlog → triaged overnight | cron daily | `scripts/local/daily-pm-triage.sh` (local) **+** `daily-pm-triage.yml` (GHA, still on) | Local Claude by default; Local Codex after dry runs | GHA copy will turn off once the local run is stable. |
| Ready issue → bot branch + draft PR | cron twice daily (09:00, 14:00 ET) | `scripts/local/engineer-dispatch.sh` (local) **+** `hourly-engineer-dispatch.yml` (GHA, still on, daily) | Local Claude by default; Codex Cloud only after prompt-specific bake-in | Heaviest workload. Keep Claude as default until Codex has passed small scoped issues and cross-review. |
| `/dispatch-engineer` comment on issue | `poll-events.sh` (local, every 60s) **+** `issue_comment: created` (GHA) | `scripts/local/event-dispatch-engineer.sh` (local) **+** `.github/workflows/dispatch-engineer-on-issue.yml` (GHA, still on) | Local Claude by default | Collaborator-gated; eyes reaction marks dispatched. |
| PR opened / ready_for_review → automated review | `poll-events.sh` (local, every 60s) **+** `pull_request` (GHA) | `scripts/local/event-pr-review.sh` (local) **+** `.github/workflows/pr-review.yml` (GHA, still on) **+** Codex auto-review (GitHub app) | Local Claude or Local/Cloud Codex + Hosted Codex | Use `pr-cross-review.sh` for a second-pass review by the other provider. |
| PR labeled `uat: requested` → `/staging/` deploy | `push` to `staging` after stack workflow lands the PR | `.github/workflows/pages.yml` | No AI | Deterministic build + deploy. |
| Staged PR → UAT walked, `uat: passed` / `uat: failed` | cron hourly | `scripts/local/hourly-uat-validation.sh` (local) — GHA schedule currently commented out | Local Claude by default; Local/Cloud Codex pilot-safe | GHA copy is manual-only, local is the primary. |
| `/resolve-conflicts` comment on PR | `poll-events.sh` (local, every 60s) **+** `issue_comment: created` (GHA) | `scripts/local/event-resolve-conflicts.sh` (local) **+** `.github/workflows/pr-resolve-conflicts.yml` (GHA, still on) | Local Claude by default | Collaborator-gated; eyes reaction marks dispatched. |
| PR approved + `uat: passed` → stacked onto `staging` | `pull_request_review`, `pull_request`, `push` (GHA) | `.github/workflows/stack-approved-prs.yml` | No AI | Deterministic stacker (Model B). |
| `staging` green → PR mergeable to `main` | reviewer action | (manual) | No AI | Gate is human + CI checks. |
| Merge to `main` → Pages deploy | `push: main` (GHA) | `.github/workflows/pages.yml` | No AI | Deterministic. |
| Daily exploratory QA against real FHIR | cron daily | `scripts/local/daily-qa-pass.sh` (local) **+** `daily-qa-pass.yml` (GHA, still on) | Local Claude by default; Local Codex pilot-safe | Heaviest single workload; boots its own dev server. |
| Daily docs freshness check | cron daily | `scripts/local/daily-doc-sync.sh` (local) | Local Claude or Local/Cloud Codex | No GHA equivalent — local is the only runner. |
| Nightly live-site Playwright | cron daily | `.github/workflows/live-site-monitor.yml` | No AI | Fixed suite, deterministic. |
| Nightly integration | cron daily | `.github/workflows/integration.yml` | No AI | Real-FHIR Playwright suite. |
| Issue / PR / label / project state changes | `issues`, `pull_request`, `push` (GHA) | `.github/workflows/project-sync.yml` | No AI | Pure script. |
| Label vocab changes on main | `push: main` (paths) | `.github/workflows/sync-labels.yml` | No AI | Pure script. |
| Workflow failure | `workflow_run: failure` (GHA) | `.github/workflows/on-failure-issue.yml` | No AI | Files an issue on red runs. |

**Cost-shifting summary.** Local Claude rows run on the Claude Max
subscription. Local Codex and Codex Cloud rows run on the ChatGPT Codex
subscription as long as Codex is logged in with the ChatGPT account and
auto top-up / API-key fallback are not enabled. Hosted Claude workflows
use `ANTHROPIC_API_KEY` and are API-billed. The GHA twins of local rows
are still enabled for belt-and-suspenders during the bake-in window; flip
them off (rename `.yml.disabled` or `if: false`) once each local driver
has 5–10 clean runs. Deterministic "No AI" workflows do not spend tokens.

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
new issue → engineer-dispatch (09:00, 14:00 ET) → opens bot/* PR with CI running
                                                            │
                          ┌─────────────────────────────────┴─────────────────────────────────┐
                          ▼                                                                   ▼
                    CI succeeds                                                          CI fails
                          │                                                                   │
                          ▼                                                                   ▼
            human reviews → comments               flake-handler retries up to 2× (auto)
                    │                                                                         │
        ┌───────────┼───────────┐                          ┌─────────────┴──────────────┐
        ▼           ▼           ▼                          ▼                            ▼
   approves   requests        merge                  retry passes                  3rd failure
   + uat:     changes         conflict               (PR moves on)                       │
   passed         │              │                                                       ▼
        │        ▼              ▼                                            pr-fixup-dispatch (09:30, 14:30)
        ▼  /address-comments  /resolve-conflicts                                  picks up red-CI PR,
   auto-merge   (agent          (agent thinks                                 dispatches engineer subagent
   via native   addresses       through real                                       to existing branch
   GitHub      threads,         conflict, pushes                                          │
   setting    pushes, replies   resolution)                                               ▼
              inline)                                                       engineer either fixes or
                                                                            self-applies needs-human
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

uat-validation fires at  :15  of every hour (local launchd only)

DST notes:
- launchd `StartCalendarInterval` is local clock time — 07:00 ET year-round.
- GHA `cron` is UTC, so GHA fires shift an hour with DST. Rows above show
  EST first / EDT in parens.
```

### Repeating slots (every hour, every day, ET)

```
:00  ★ engineer-dispatch (local) — but ONLY at 09:00 and 14:00 (twice daily)
:15  ★ uat-validation    (local) — every hour
:30  - (nothing scheduled)
:45  - (nothing scheduled)
```

## Collision analysis

The runner uses a per-prompt lockfile (`/tmp/fhir-place-<name>.lock`),
so two copies of the **same** prompt cannot stomp on each other. The
risks below are **different** prompts firing close together.

### Concrete overlap windows (ET)

With engineer-dispatch on a twice-daily schedule (09:00 + 14:00), the
sharp QA-pass collision is gone. UAT-validation still fires every
hour at `:15`, so its overlaps are the only ones to watch.

| Time | Routines that may overlap | Risk |
| --- | --- | --- |
| 05:15 | qa-pass (~15 min in) + uat-validation | Low. UAT walks `/staging/`, not localhost. Both hit GitHub API. |
| 06:15 | doc-sync + uat-validation | Low. |
| 07:15 | pm-triage + uat-validation | Low. |
| 09:00 + 09:15 | engineer-dispatch (start) → uat-validation 15 min later | Low. Different surfaces; UAT runs read-only against `/staging/`. |
| 14:00 + 14:15 | engineer-dispatch (start) → uat-validation 15 min later | Low. Same as 09:00. |

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
   Combined ceiling across all five routines is well under that.
4. **Mac CPU under load (MEDIUM).** Two Playwright runs concurrently
   (QA + engineer screenshots) on an M-series Mac is OK; Playwright +
   `pnpm build` + e2e on top of that may bottleneck. **Mitigation:**
   same as #1 — don't run engineer-dispatch during QA window.
5. **Same `~/src/fhir-place` checkout (LOW).** The runner refuses to
   start when the working tree is dirty, and engineer-dispatch creates
   its own `wt-*` worktrees. Nothing mutates the primary checkout from
   inside a routine.
6. **iMessage failure notifications (LOW).** If three routines fail in
   the same window, you get three notifications. Annoying, not harmful.

### Current schedule (this PR)

```
05:00  qa-pass            (heavy, owns :5173, ~30–60 min)
06:00  doc-sync           (light)
07:00  pm-triage          (medium)
09:00  engineer-dispatch  ← morning fire (twice daily, not hourly)
14:00  engineer-dispatch  ← afternoon fire (twice daily, not hourly)
xx:15  uat-validation     (hourly)
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
