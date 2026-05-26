# scripts/

Operational tooling for the fhir-place repo. Most things you touch from here run automation on Daniel's Mac (under the Claude Max OAuth session) rather than in GitHub Actions (paid API tokens). The shared safety rules live in `docs/decisions/0003-agent-safety-rules.md`.

## Where to look

| Path | What's there |
|---|---|
| [`local/README.md`](local/README.md) | **The canonical doc.** Every local driver, one-time setup, launchd install, smoke test, pause switch, schedule calendar, collision analysis, GHA-vs-local tradeoffs, SDLC transition table. Start here. |
| `local/*.sh` | The drivers themselves. Cron-fired (`engineer-dispatch`, `daily-pm-triage`, `daily-qa-pass`, `daily-doc-sync`, `hourly-uat-validation`, `pr-fixup-dispatch`) and event-fired (`event-issue-review`, `event-pr-review`, `event-dispatch-engineer`, `event-resolve-conflicts`, `event-address-comments`). |
| `launchd/com.fhir-place.*.plist` | macOS launchd plists for each cron driver plus the always-on `poll-events` daemon. Install pattern is in `local/README.md` § One-time setup. |
| `run-prompt-locally.sh` | Shared wrapper used by every driver. Handles lock, log, pause file, dirty-tree refusal, and `--add-dir` for worktree parent. Never sets `ANTHROPIC_API_KEY` so `claude` falls back to OAuth. |
| `poll-events.sh` | Long-lived daemon (60s loop) that watches GitHub for new issues, non-draft PRs, and slash commands (`/dispatch-engineer`, `/resolve-conflicts`, `/address-comments`), then fires the matching `event-*.sh` driver. State lives at `~/.fhir-place-state/poll-events.json`. |
| `dispatch-engineer.sh` + `dispatch-engineer.README` | **Legacy.** Pre-#479 monolithic driver. Still functional, but the new pattern in `local/` is preferred for any new work. |
| `check-readme-goal-task.mjs` | One-off checker run from CI. |
| `discover-test-patients.mjs` | One-off helper for the demo's seed data. |
| `sync-labels.mjs` | Pure script invoked by `.github/workflows/sync-labels.yml` to keep label vocab in sync with `.github/labels.yml`. |

## Quick orientation

Everything cron-fired runs via launchd plists in `launchd/` that exec a shell in `local/`. Everything event-fired runs through the `poll-events.sh` daemon, which polls GitHub every 60s and dispatches the matching `event-*.sh` driver. Both paths share `run-prompt-locally.sh` as the wrapper.

The pause switch is the same everywhere — `touch ~/.fhir-place-pause` skips every local runner on its next trigger.

## Pause

```
touch ~/.fhir-place-pause   # silence everything
rm ~/.fhir-place-pause      # resume
```
