# 0007 Testing and Hardening SDLC Infrastructure

## Status
Accepted

## Context
The SDLC pipeline is itself code: 22 workflows under `.github/workflows/`,
a handful of bash blocks embedded in YAML, and prompt files in
`docs/prompts/` that drive Claude routines. It has no static checks, no
unit tests, no smoke tests, and several silent-failure idioms
(`2>/dev/null || true`, missing `permissions:` blocks, missing env vars).
When the pipeline breaks, we find out hours later by manually grepping
the GitHub events API.

Five distinct failures landed on one day. All share the same shape: a
permissions or environment gap that produces a 4xx, output redirected to
`/dev/null`, the rest of the workflow continuing happily, and PR labels
in the wrong state until a human notices.

1. `stack-approved-prs.yml` was missing `pull-requests: write`. Every
   `gh pr edit` returned 403; output was swallowed by `2>/dev/null ||
   true`. PRs stacked onto staging but labels never flipped. Fixed in
   #545.[^1]
2. The same workflow was missing `GH_TOKEN` on the rebuild step.
   Identical silent-failure pattern. Fixed in #517.
3. `pull_request_review` runs the workflow from the PR's head ref. PRs
   that predate a workflow change carry the old version of the file.
   Approving such a PR fired the broken workflow even after the fix
   merged to `main`.
4. The stack workflow unconditionally strips `uat: complete` /
   `uat: needs-changes` and re-adds `uat: requested` on every rebuild.
   A PR walked at 03:23 ("complete") got reset to "requested" at 10:12
   when another PR landed. PRs can't stabilize at `uat: complete` in a
   busy approval flow. Not yet fixed.
5. `docs/prompts/hourly-uat-validation.md` uses `mcp__github__*` tools
   for every PR/issue write. The MCP server is only configured inside
   the workflow runner. After we moved the walker to a local launchd
   schedule, it began bailing each hour ("can't run cleanly without
   MCP"). Cron is alive, producing no work.

Common root: the machinery that builds and validates code has no
machinery built and validating it. The blast radius is wide:
`dispatch-engineer-on-issue.yml`, `on-failure-issue.yml`,
`hourly-engineer-dispatch.yml`, `pr-review.yml`, and
`stack-approved-prs.yml` all manipulate labels or `staging`. A silent
failure in any of them produces work that looks correct from the
outside.

## Decision

Treat SDLC infrastructure as production code. Apply three layers of
hardening; pick the cheapest layer that catches a given class of bug.

### Layer 1: static checks on every PR

- **`actionlint`** as a required CI step. Catches the YAML-shape bugs
  (missing keys, unknown actions, wrong event filters).
- **`shellcheck`** on the embedded bash inside workflows
  (`actionlint` shells out to `shellcheck` already; turn the strict
  flags on).
- A small repo-local lint that scans workflow files for known
  silent-failure idioms: `2>/dev/null || true`, calls to
  `gh pr edit` / `gh issue edit` / `gh api` without a matching
  `permissions:` block declaring the right scope, and bash steps
  without `set -euo pipefail`.

### Layer 2: unit tests on extracted logic

The label-transition logic in `stack-approved-prs.yml` and the
on-staging precondition check in `hourly-uat-validation.yml` are the
two pieces that hide bugs today. Both are pure functions hiding inside
bash. Extract them to scripts under `scripts/sdlc/` with a Vitest unit
suite. Bug #4 (label clobber) becomes a failing test, then a passing
one.

### Layer 3: end-to-end smoke against a test-PR fixture

A nightly workflow that:

1. Opens a throwaway PR against a sacrificial branch in this repo.
2. Approves it via a bot identity.
3. Asserts the expected label transitions land within N seconds and
   that `staging` includes the PR's head.
4. Closes the PR, cleans up.

This is the only layer that catches the "PR-ref carries a stale
workflow" class of bug, since the failure is structural to GitHub's
event model and only visible end-to-end.

### What we are not doing in this ADR

- **No state machine in code.** Labels are still the state. The
  walker-clobber bug (bug #4) is a race; the fix is "preserve
  `uat: complete` and `uat: needs-changes` across rebuilds," not
  "move state out of labels." A proper state machine is its own
  decision with its own ADR if labels prove insufficient.
- **No prompt-engine abstraction for the MCP-vs-`gh` coupling.**
  The fix for bug #5 is to pick one: either configure MCP in the
  local launchd plist, or rewrite the prompt to use `gh` everywhere.
  Both are small; one of them ships, in a follow-up issue.
- **No "test every workflow" mandate.** Cover the five workflows
  that touch labels or `staging`. The other 17 are read-only or
  diagnostic; they fail loudly enough.

## Consequences

Positive:

- Three of the five bugs above (#1, #2, #4) would have been caught by
  layer 1 or 2 before merge. Bug #3 is caught by layer 3. Bug #5 is
  caught by an environment-parity test in the local-walker harness.
- Engineers and agents stop relying on "is staging green?" as the
  pipeline test. The pipeline tests itself.
- Future workflow changes get a fast feedback loop. Iteration speed
  on the SDLC machinery goes up, not down.

Negative:

- More CI minutes. Layer 1 is cheap; layer 3 (a real PR cycle) costs
  on the order of a minute per nightly run.
- More scripts to maintain. The pure-function extracts under
  `scripts/sdlc/` are real code with real test coverage; they grow
  with the workflows.
- Workflow iteration is slower in absolute terms: a change to
  `stack-approved-prs.yml` now needs a unit-test update and an
  `actionlint` pass. That's the trade.
- The smoke fixture is a new piece of moving infrastructure
  (sacrificial branch, bot identity, cleanup logic). It can break in
  its own ways. The runbook for the smoke test is itself a follow-up.

Out of scope / future:

- Labels-as-state-machine vs. state-in-code is a real question.
  Layer 2 hides it for now (the transition logic is testable wherever
  the state lives), but a future ADR may move state into a small JSON
  blob on the PR or into a side table.
- A reusable lint for the silent-failure idiom may want to live as a
  published action so other repos can adopt it. Out of scope here.

## Follow-ups

Filed as separate issues; see the PR description for the linked set.
Each issue is sized to one PR and labelled `type: tech-debt` (mostly),
`area: infra`, with a `human-review-needed:` level per
`docs/sdlc/gaps.md`.

[^1]: Receipts. PRs #545 and #517 carry the post-mortems for bugs #1
    and #2. Bug #3 is visible in the timeline of any PR opened before
    #545 that received an approval after it merged: the workflow run
    was attached to the PR's head SHA, not main. Bug #4 is reproducible
    today: walk any PR to `uat: complete`, then push to a sibling PR,
    then re-check the first PR's labels. Bug #5 is visible in the
    local launchd `~/Library/Logs/uat-walker.log` from 06:15Z onward.
