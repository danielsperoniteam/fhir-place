# Loops and triggers

The SDLC combines scheduled maintenance, event-driven PR automation, local
subscription-backed agents, and deterministic GitHub Actions.

## Cadence at a glance

```text
05:00 UTC      daily QA pass
06:30 UTC      live-site monitor
07:00 UTC      daily PM triage
manual/local   engineer dispatch and PR fixup
PR events      review, CI flake handling, conflict resolution
main/preview   Pages deployment
manual         one-PR staging preview or staging reset
```

The former hourly staging UAT loop is retired. Playwright CI plus CODEOWNER
approval is the merge gate. Hosted staging validation is requested for one PR
at a time when deployment risk warrants it.

## Scheduled loops

### Daily PM triage

- Workflow: [`daily-pm-triage.yml`](../../.github/workflows/daily-pm-triage.yml)
- Prompt: [`daily-pm-triage.md`](../prompts/daily-pm-triage.md)
- Schedule: 07:00 UTC daily
- Writes: issue labels, comments, and the rolling report

It labels untriaged issues, deduplicates bot reports, rechecks blockers, and
maintains the ready queue. It never edits source.

### Engineer dispatch

- Workflow: [`hourly-engineer-dispatch.yml`](../../.github/workflows/hourly-engineer-dispatch.yml)
- Prompt: [`hourly-engineer-dispatch.md`](../prompts/hourly-engineer-dispatch.md)
- Local driver: `scripts/local/engineer-dispatch.sh`
- Writes: one bot branch and one PR to main per selected issue

The dispatcher owns GitHub state and invokes the engineer in an isolated
worktree. The engineer branches from main, runs the validation contract, and
pushes only its assigned branch.

### Daily QA pass

- Workflow: [`daily-qa-pass.yml`](../../.github/workflows/daily-qa-pass.yml)
- Prompt: [`daily-qa-pass.md`](../prompts/daily-qa-pass.md)
- Schedule: 05:00 UTC daily

This is exploratory testing against a local demo using a real public FHIR
sandbox. It files distinct bugs but does not fix them during the same pass.

### Live-site monitor

- Workflow: [`live-site-monitor.yml`](../../.github/workflows/live-site-monitor.yml)
- Schedule: 06:30 UTC daily

This deterministic Playwright suite checks the production Pages URL. It files
or updates bot issues for failures, which PM triage handles next.

### Daily doc sync

- Prompt: [`daily-doc-sync.md`](../prompts/daily-doc-sync.md)
- Local driver: `scripts/local/daily-doc-sync.sh`

This checks documented counts, exports, package tables, roadmaps, and app
READMEs. It opens a small docs PR against main when needed.

## Event-driven workflows

### PR review

- Workflow: [`pr-review.yml`](../../.github/workflows/pr-review.yml)
- Prompt: [`pr-review.md`](../prompts/pr-review.md)

The bot posts an advisory review or requests changes for a concrete blocker.
It never approves. Human CODEOWNER approval remains required.

### PR conflict resolver

- Workflow: [`pr-resolve-conflicts.yml`](../../.github/workflows/pr-resolve-conflicts.yml)
- Prompt: [`pr-resolve-conflicts.md`](../prompts/pr-resolve-conflicts.md)
- Trigger: the local poller detects a same-repository conflict, or a trusted
  collaborator comments `/resolve-conflicts`

The resolver merges the PR base, normally main, into the PR branch, resolves
hand-authored conflicts when intent is clear, verifies the result, and pushes
only the PR branch. It runs from a clean detached control worktree, independent
of the human checkout. Dispatches are deduplicated by base and head SHA with a
two-hour retry window. Binary, generated, or ambiguous conflicts escalate and
receive `status: needs-human`.

### PR fixup and CI flakes

- Workflows: [`pr-fixup-dispatch.yml`](../../.github/workflows/pr-fixup-dispatch.yml)
  and [`pr-ci-flake-handler.yml`](../../.github/workflows/pr-ci-flake-handler.yml)
- Prompt: [`pr-fixup-dispatch.md`](../prompts/pr-fixup-dispatch.md)

Fixup handles real merge conflicts, red CI, and unresolved review threads on
existing PR branches. Flake handling retries bounded transient failures before
handing the PR to fixup.

### Project synchronization

- Workflow: [`project-sync.yml`](../../.github/workflows/project-sync.yml)

Issue and PR events move linked work between Todo, In progress, Ready for
review, and Released. The old Ready for UAT transition is retired.

## Staging preview

- Workflow: [`preview-pr-on-staging.yml`](../../.github/workflows/preview-pr-on-staging.yml)
- Manual inputs: `action=preview` with an open PR number, or `action=reset`
- Automatic triggers: push to main and closure of the active preview PR
- Concurrency group: `staging-preview`, queued rather than cancelled

The workflow is deterministic and contains no agent:

1. Read the active preview marker from staging.
2. Decide whether to preview one PR, rebuild the active preview, reset, or do
   nothing.
3. For a preview, require an open, ready, same-repository PR targeting main
   with green required checks.
4. Start from current main and merge exactly that PR.
5. Fail if the merge conflicts.
6. Push staging with an exact `--force-with-lease` expectation.
7. Dispatch the trusted Pages workflow from main, pinned to that staging SHA.
8. Wait for that Pages run.
9. Comment the deployed evidence on the PR only after Pages succeeds.

Every fail-closed path resets and redeploys main before reporting failure.
Failed required checks also remove the selector label; reapply it after the
checks pass. Retargeting the selected PR away from main removes the selection.

The workflow is the only writer allowed to reset staging. Engineers, QA
agents, and conflict resolvers never push there.

## Pages deploy

- Workflow: [`pages.yml`](../../.github/workflows/pages.yml)
- Trigger: push to main, or an explicit dispatch from the staging preview
  controller with an exact staging SHA

It builds and deploys both branch views in one Pages artifact:

```text
/                  apps/demo from main
/goals/            apps/goals-tasks from main
/staging/          apps/demo from staging
/staging/goals/    apps/goals-tasks from staging
```

Main is production. Staging is either identical to main or contains one
selected PR preview. Main and staging build on separate runners with
read-only repository access and no persisted checkout credentials. A third
job combines only their artifacts. Only the deploy job receives Pages and
OIDC write permissions.

## Concurrency and failure semantics

- Mutating workflows have explicit concurrency groups.
- Preview updates queue instead of cancelling an in-progress push or comment.
- Retry loops are bounded.
- A run that defers required work must fail rather than exit successfully.
- Local agent loops use tracking-issue kill switches and bounded work caps.
- Source-changing agents cannot modify their own workflows or prompts.
