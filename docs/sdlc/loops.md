# Loops and triggers

Five recurring loops + two event-driven workflows make up the operating
schedule. All are GitHub Actions; their YAML lives under
[`.github/workflows/`](../../.github/workflows/) and the prompt each one
runs lives under [`docs/prompts/`](../prompts/).

The **idiom** every loop uses: the workflow doesn't embed the agent's
instructions — it tells Claude to read the markdown prompt file and
execute it. That keeps the prompt version-controlled, reviewable, and
diff-able.

```yaml
prompt: |
  Read the file at docs/prompts/<name>.md and execute the
  instructions in it. Do not modify the file.
```

## Cadence at a glance

```
00:00 UTC ─┐
           │ (quiet)
05:00 UTC ─┼─ Daily QA pass            (workflow_dispatch enabled, cron: 0 5 * * *)
06:30 UTC ─┼─ Live site monitor        (cron: 30 6 * * *)  → files bot bugs
07:00 UTC ─┼─ Daily PM triage          (cron: 0 7 * * *)   → labels new bugs from above
           │
:05 every  ┼─ Hourly engineer dispatch (cron commented out — manual for now)
:15 every  ┼─ Hourly UAT validation    (cron commented out — manual for now)
           │
on demand: ─── Daily doc sync          (workflow_dispatch only)
on push:   ─── Pages deploy            (push to main or staging)
on push:   ─── Promote staging         (push to staging → opens/updates promotion PR)
on push:   ─── Sync staging            (push to main → merges main back into staging)
on /resolve-conflicts: ─ PR conflict resolver
```

The morning sequence is intentional: QA pass at 05:00 and live-monitor
at 06:30 file new bot-issues, then PM triage at 07:00 picks them up,
labels them, and they become eligible for engineer dispatch.

## The five recurring loops

### 1. Daily PM triage — backlog hygiene

- **Workflow:** [`daily-pm-triage.yml`](../../.github/workflows/daily-pm-triage.yml)
- **Prompt:** [`daily-pm-triage.md`](../prompts/daily-pm-triage.md)
- **Cadence:** `cron: "0 7 * * *"` (07:00 UTC daily)
- **Concurrency group:** `daily-pm-triage` (`cancel-in-progress: false`)
- **Permissions:** `issues: write`, `contents: read`, `pull-requests: read`
- **Touches source?** No.

What it does, in order:

1. Untriaged open issues — infer missing `type:` / `area:` / `priority:`
   labels from title + body using the heuristics in the prompt; otherwise
   add `status: needs-triage`.
2. Title-convention violations — strip safe `[work]`/`[demo]`/`[bot]`
   prefixes; reword `[workbench]`/`[cql]`/`[mcp]` inline.
3. Bot-filed duplicates — close all but the oldest with
   `state_reason=duplicate, duplicate_of=<canonical>`.
4. Closed-out epics — close epics whose sub-issues are all closed and
   that have had no human activity in 30+ days.
5. Stale `status: blocked` — re-check the blocker; un-block if closed,
   touch the timestamp otherwise.
6. Long-open issues without priority signal → `status: needs-triage`.
7. Replace the body of the rolling `PM triage — daily report` issue
   wholesale with the day's structured rollup.

Hard rules: never delete issues or labels; never edit issue bodies;
never override a human-set priority; never close anything outside the
three categories above.

### 2. Hourly engineer dispatch — backlog drain

- **Workflow:** [`hourly-engineer-dispatch.yml`](../../.github/workflows/hourly-engineer-dispatch.yml)
- **Prompt:** [`hourly-engineer-dispatch.md`](../prompts/hourly-engineer-dispatch.md)
- **Cadence:** `cron: "5 * * * *"` — currently commented out, manual via
  `workflow_dispatch` until 5–10 successful manual runs are observed.
- **Concurrency group:** `hourly-engineer-dispatch` (`cancel-in-progress: false`)
- **Permissions:** `contents: write`, `issues: write`, `pull-requests: write`
- **Touches source?** Yes — but only via the `engineer` subagent, never
  the orchestrator itself.

Sequence per run:

1. **Release stale claims.** Find any `status: in-progress` issue whose
   `bot/issue-<N>-*` branch has been quiet 2+ hours with no open PR;
   strip the label and comment.
2. **Flag stale bot PRs.** Any `bot/*` PR with no human review in 7+
   days gets a `@codeowner` mention and the linked issue gets
   `status: needs-human`.
3. **Compute the ready queue.** A "ready" issue has exactly one `type:`,
   ≥1 `area:`, exactly one `priority:`; no `status: blocked /
   needs-triage / in-progress / needs-human`; no assignees; all listed
   blockers closed. Sort by priority then created_at; take the top 3.
4. **Claim and dispatch — sequentially, never in parallel.** For each
   issue: add `status: in-progress` (the lock), comment the picked-up
   notice, invoke the `engineer` subagent in worktree isolation,
   reconcile on return.
5. **Update the rolling tracking issue** (`Engineer dispatch — hourly
   report`) by replacing its body wholesale.

Hard caps per run: 3 tickets, 200 GitHub API calls, 90 minutes
wall-clock (workflow `timeout-minutes`). The `--max-turns 300` on the
Claude action is a defense against pathological loops — the real bound
is the workflow timeout.

### 3. Hourly UAT validation — pre-merge gate

- **Workflow:** [`hourly-uat-validation.yml`](../../.github/workflows/hourly-uat-validation.yml)
- **Prompt:** [`hourly-uat-validation.md`](../prompts/hourly-uat-validation.md)
- **Cadence:** `cron: "15 * * * *"` — currently commented out, manual via
  `workflow_dispatch`. Offset from engineer-dispatch (`:05` vs `:15`)
  so the two never share a runner.
- **Concurrency group:** `hourly-uat-validation`
- **Permissions:** `contents: read`, `issues: write`,
  `pull-requests: write`. **No source edits, no branches, no PRs.**

Sequence per run:

1. Confirm staging is reachable (`curl` against the live `/staging/`
   URL); if not, log "Staging unreachable" on the tracking issue and
   exit cleanly.
2. List all open non-draft PRs. For each, decide whether its head SHA
   is reachable from `origin/staging` via
   `git merge-base --is-ancestor`. Only on-staging PRs get walked.
3. Dedupe via the `<!-- uat-validation:run sha=... -->` marker comment:
   if the most recent marker is < 50 minutes old **and** matches the
   current head SHA, skip the PR silently.
4. For each survivor (cap 8): spawn the `qa-engineer` subagent with
   the PR context, walk each UAT checklist item against the live
   staging URL, capture pass/fail and console errors. Post the
   structured comment.
5. Spawn the `health-tech-pm` subagent for at most 15 minutes of free
   walking on the live build; file at most 3 improvement-idea issues.
6. Replace the body of `UAT validation — hourly report` wholesale.

Hard caps: 8 PRs, 5 out-of-scope bugs filed, 3 PM ideas, 200 API calls,
45 minutes wall-clock.

### 4. Daily QA pass — exploratory bug-hunting

- **Workflow:** [`daily-qa-pass.yml`](../../.github/workflows/daily-qa-pass.yml)
- **Prompt:** [`daily-qa-pass.md`](../prompts/daily-qa-pass.md)
- **Cadence:** `cron: "0 5 * * *"` (05:00 UTC daily)
- **Concurrency group:** `daily-qa-pass`
- **Permissions:** `issues: write`, others read.

Different from the live-site monitor: the workflow boots
`pnpm --filter @fhir-place/demo dev` in the background with
`VITE_USE_MOCK=false` and `VITE_FHIR_BASE_URL=https://r4.smarthealthit.org`
— a real FHIR sandbox, not MSW. Then Claude walks the routes from
[`docs/qa-agent.md`](../qa-agent.md) at 1280×800, dedupes via search
on `origin: bot-filed`, and files distinct bugs (cap 10 per run).

### 5. Daily doc sync — keep docs honest

- **Workflow:** not currently scheduled in `.github/workflows/`; the
  prompt is invoked manually.
- **Prompt:** [`daily-doc-sync.md`](../prompts/daily-doc-sync.md)

Eight surgical checks: unit-test count in the README; `check-readme-goal-task`
gate; exported components vs. documented components for `react-fhir`;
roadmap rows for closed issues; `TOP_RESOURCE_TYPES`; packages table;
Node version requirement; missing app READMEs. If anything has drifted,
the agent opens a `docs/auto-sync-<date>` branch with a small commit and
a PR targeting `main`. Markdown-only, so CI is fast.

## The three event-driven workflows

### Promote staging — automated promotion PR

- **Workflow:** [`promote-staging.yml`](../../.github/workflows/promote-staging.yml)
- **Trigger:** `push` to `staging`.
- **Concurrency group:** `promote-staging` (`cancel-in-progress: true`)
- **Permissions:** `contents: read`, `pull-requests: write`, `issues: read`
- **Agent involvement:** none — deterministic `github-script`.

When code lands on `staging`, this workflow opens (or updates) a single
long-lived PR targeting `main`. The PR body aggregates UAT steps from
every PR merged into staging since the last promotion, giving a reviewer
a single checklist to validate against the deployed `/staging/` URL.

The PR is assigned to `@danielsperoni`. Items flagged with
`status: needs-human` are called out at the top of the body. Once
someone independently confirms the UAT steps pass and no regressions
exist, they approve and merge — which triggers Pages to rebuild `/`.

**Automatic conflict resolution:** after creating/updating the PR, the
workflow checks mergeable state. If conflicts exist, it invokes Claude
with the same `pr-resolve-conflicts.md` prompt to attempt resolution.
If resolution fails, it labels the PR `status: needs-human`, posts an
escalation comment mentioning `@danielsperoni`, and requests review.
The `/resolve-conflicts` command remains available for manual retries.

If the PR already exists (from a prior staging push), only the body is
updated. When it's merged, the next staging push creates a fresh one.

### Sync staging — reverse sync after direct-to-main merges

- **Workflow:** [`sync-staging.yml`](../../.github/workflows/sync-staging.yml)
- **Trigger:** `push` to `main` (skipped if the commit message contains
  "promote staging to main" to avoid infinite loops).
- **Concurrency group:** `sync-staging` (`cancel-in-progress: true`)
- **Permissions:** `contents: write`
- **Agent involvement:** none — deterministic git merge.

When a PR merges directly to `main` (skipping the staging UAT loop),
this workflow merges main back into staging so it doesn't fall behind.
Uses the admin bypass on the staging ruleset to push directly.

If the merge has conflicts it cannot resolve, it escalates to
`@danielsperoni` by commenting on the open promotion PR or filing a new
issue with `status: needs-human`.

### Live site monitor — nightly regression

- **Workflow:** [`live-site-monitor.yml`](../../.github/workflows/live-site-monitor.yml)
- **Cadence:** `cron: "30 6 * * *"` (06:30 UTC nightly)
- **Agent involvement:** none — this is a deterministic Playwright
  suite (`playwright.live.config.ts`) running against the deployed
  Pages URL. The agent layer is the **filing** step: a `github-script`
  parses Playwright's JSON, dedupes by title against open
  `origin: bot-filed` issues, and either creates a new issue or
  comments "Failed again in <run>" on the existing one.

This is why daily-PM-triage runs at 07:00 — its first input each
morning is whatever live-site-monitor filed at 06:30.

### PR conflict resolver — `/resolve-conflicts`

- **Workflow:** [`pr-resolve-conflicts.yml`](../../.github/workflows/pr-resolve-conflicts.yml)
- **Prompt:** [`pr-resolve-conflicts.md`](../prompts/pr-resolve-conflicts.md)
- **Trigger:** an `issue_comment` of `/resolve-conflicts` on a PR, posted
  by a user with `OWNER` / `MEMBER` / `COLLABORATOR` association.
- **Concurrency group:** `pr-resolve-conflicts-${{ pr_number }}`

Acknowledges the request, checks out the PR head with full history,
runs `git merge origin/<base_ref>`, resolves hand-authored conflicts
inline, regenerates `pnpm-lock.yaml` if needed, runs
`typecheck`/`test:run`/`demo typecheck` to verify the build, commits
with a structured "Resolved files:" message, and pushes. Never
force-pushes; never targets a branch other than the PR head.

The "needs-human" exit is taken whenever a conflict is in a binary
file, generated file, or a lock-file hunk that differs semantically.

## Pages deploy — the deploy lane

- **Workflow:** [`pages.yml`](../../.github/workflows/pages.yml)
- **Trigger:** `push` to `main` or `staging`.

Builds `apps/demo` and `apps/goals-tasks` from **both** branches in
parallel and ships them as a single Pages artifact:

```
/                  ← apps/demo from main
/goals/            ← apps/goals-tasks from main
/staging/          ← apps/demo from staging        (if branch exists)
/staging/goals/    ← apps/goals-tasks from staging (if branch exists)
```

Both branches are always rebuilt, so a push to `main` doesn't wipe
`/staging/` and vice-versa. A root `404.html` script at the artifact's
root inspects the URL prefix and inlines the right sub-app's
`index.html` so the SPA router can take over without losing the URL bar.

This is what makes the staging UAT loop possible: the moment a human
merges a PR into `staging`, Pages rebuilds and the QA agent's next
hourly run can walk the live changes.

## Concurrency, idempotency, and the kill switch

- Every loop sets a `concurrency.group` so only one of itself runs at a
  time globally.
- Every loop sets `cancel-in-progress: false` because cancelling a
  half-written comment is worse than queueing.
- Every loop maintains a single rolling tracking issue and replaces its
  body on each run (instead of appending), so the audit trail stays
  skim-readable.
- The kill switch is a label: add `status: agent-paused` to the
  loop's tracking issue and the next run posts "Paused — skipping run"
  and exits.

## Cron is off by default for new loops

The two hourly loops were merged with their `schedule:` blocks
commented out — manual `workflow_dispatch` only — until 5–10 successful
hand-runs have been observed. Enabling the cron is a separate, small,
human-authored PR. The same staged rollout applies to any future loop.
