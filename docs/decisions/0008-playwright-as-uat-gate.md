# 0008 Playwright integration tests as the UAT merge gate

## Status

Accepted

## Context

In ADR 0007 we identified five SDLC failures rooted in the staging stack +
hourly UAT agent pipeline. The pattern held: label-management bugs silently
stacked correctly but labeled nothing, and the UAT walker produced
`uat: unable` on nearly every PR because the staging stack itself kept
breaking under conflict pressure from 20+ in-flight bot branches.

By the time this ADR was written, the situation was:

- ~27 open PRs, almost all labeled `uat: unable`
- Seven APPROVED PRs sitting unmerged because `uat: complete` never landed
- The staging stack silently skipped conflicting PRs instead of resolving
  them, so the `uat: requested` label never appeared
- The hourly UAT walker was disabled (moved to launchd) and producing no
  useful output
- The whole label lifecycle (`unable → requested → complete`) was moving
  zero PRs to merge

The staging UAT pipeline was designed for throughput we don't have yet.
At this team size it generates more friction than signal.

## Decision

**Playwright integration tests shipped in the same PR are the merge gate.**
CI green + CODEOWNER approval = mergeable. No `uat: complete` required.

Concretely:

1. **`uat-policy.json`** moves to `"stackedPrUatDefault": "skip"`. The
   staging stack still runs on APPROVED PRs, but newly stacked PRs get
   `uat: skip` instead of `uat: requested`, so the hourly UAT walker
   ignores them and the label lifecycle stays quiet.

2. **Engineer agent PR template** replaces the "UAT on live staging"
   section with a "Test coverage" section: the agent lists the Playwright
   test files and `test.step` or `expect` descriptions that directly
   assert the acceptance criteria. These run in CI before review.

3. **The test-update gate in the engineer agent is the new UAT**. If a
   user-facing change ships without a `*.spec.ts` update, the agent exits
   `needs-human` — same behavior as today but now it's load-bearing, not
   belt-and-suspenders.

4. **`CLAUDE.md`** clarifies that CI green + CODEOWNER review = mergeable.
   The `uat:` label is no longer part of the merge gate.

5. **Nothing is deleted.** The staging branch, `stack-approved-prs.yml`,
   `hourly-uat-validation.yml`, `hourly-uat-validation.md`, and the full
   `uat:` label vocabulary remain. The toggle to re-enable is
   `uat-policy.json`.

## What we keep for future re-entry

| Artifact | Why preserved |
| --- | --- |
| `staging` branch + `stack-approved-prs.yml` | Re-enable by setting `stackedPrUatDefault: "request"` |
| `hourly-uat-validation.yml` + `.md` prompt | Re-enable by un-commenting the cron and removing `if: false` |
| `uat:` label vocabulary (`sync-labels.mjs`) | Required by re-entry; cost to maintain is zero |
| `scripts/staging/transition-uat-label.mjs` | The label-transition logic is tested (ADR 0007 Layer 2); keep it |

## Re-entry criteria

Bring the staging UAT walk back when any of these are true:

- Sustained PR rate > 5 merged per week (staging pre-validation starts
  paying for itself)
- Live-site monitor or daily QA pass surfaces repeated regressions that
  Playwright tests missed (coverage gap, not process gap)
- Team adds a dedicated QA reviewer who can act on `uat: needs-changes`
  within the same day it's set

Re-entry path: flip `uat-policy.json` to `"request"`, un-comment the
`hourly-uat-validation.yml` cron, merge the open APPROVED backlog first
so the staging stack starts clean.

## What the "UAT" section in PRs becomes

Old:
> **UAT on live staging** — steps a human or agent can follow against
> the staging URL after the preview-deploy workflow pushes your branch.

New:
> **Test coverage** — list the Playwright spec files and the specific
> `test` / `expect` calls that assert the acceptance criteria. If the
> change is not user-visible, write `N/A — no user-visible change`.

The PR description still documents what was verified; it just points at
the test suite instead of a manual staging walk.

## What we are not doing

- We are not deleting the staging stack or the UAT workflow. Reversibility
  matters more than cleanliness here.
- We are not removing the `uat:` labels from existing PRs. Let them decay
  naturally as those PRs merge or close.
- We are not changing the daily QA pass or live-site monitor — those run
  post-merge and stay as-is.
- We are not changing the screenshot requirement in `CLAUDE.md`. Screenshots
  in PR bodies are still mandatory for user-visible changes.

## Consequences

Positive:

- PRs merge when CI is green. No `uat: complete` to wait for.
- The backlog of APPROVED PRs can clear immediately.
- Playwright tests run in CI in < 2 minutes; the staging UAT walk took 45
  minutes and frequently failed mid-run.
- Fewer moving parts. The label lifecycle was the most common failure mode
  per ADR 0007.

Negative:

- We lose opportunistic bug discovery from the UAT walker's staging walk.
  The daily QA pass partially fills this gap.
- PR test coverage quality depends on the engineer agent writing meaningful
  Playwright assertions, not just no-op smoke tests. The human reviewer
  owns that check.
- If coverage gaps let regressions through, we find out post-merge via the
  live-site monitor, not pre-merge.

## Follow-ups

- Merge the seven APPROVED + `uat: complete`/`uat: skip` PRs that are
  already waiting (no process change needed — just merge them).
- Consider closing or converting to draft the stale bot PRs that have had
  no human review in 14+ days. Filed separately.
