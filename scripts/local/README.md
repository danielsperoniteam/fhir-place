# Local agent automation

This directory contains shell drivers that run the SDLC prompts locally
on your machine (via `claude --print` with the OAuth session from
`claude login`) rather than on GitHub Actions (which uses the paid
`ANTHROPIC_API_KEY`). Same prompts, same agents, same safety rules —
just billed against the Claude Max subscription.

## Pieces

- [`../run-prompt-locally.sh`](../run-prompt-locally.sh) — the shared
  runner. Handles lock, log, pause file, dirty-tree refusal, iMessage
  notification on failure, and `--add-dir` for the worktree parent.
  Never sets `ANTHROPIC_API_KEY`, so `claude` falls back to OAuth.
- `engineer-dispatch.sh` — picks up to 3 ready issues per run, hands
  each to the engineer subagent in a worktree. Runs hourly.
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
   `hourly-uat-validation` as desired.

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

The pattern is: when a workflow is steady and predictable (the cron
ones), local runs are cheap. When a workflow needs to respond to
real-time GitHub events (slash commands, new PRs), GHA is more
responsive — until the poll daemon ships.
