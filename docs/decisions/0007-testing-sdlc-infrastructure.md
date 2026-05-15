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
   MCP"). Cron is alive, producing no work. Resolution: migrate the
   prompt to `gh` (see Decision below); `scripts/sync-labels.mjs` and
   `scripts/staging/transition-uat-label.mjs` are the prior art.

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

First shipped slice: `stack-approved-prs.yml` delegates UAT label
transitioning to `scripts/staging/transition-uat-label.mjs`, covered by
`node:test` via `pnpm test:scripts`. The script preserves
`uat: complete`, `uat: needs-changes`, and `uat: skip` across staging
rebuilds. Only PRs without a durable UAT state are moved into
`uat: requested`.

The default transition is configurable in
`scripts/staging/uat-policy.json`. Normal mode is:

```json
{
  "stackedPrUatDefault": "request"
}
```

For a short "ship fast, do not queue UAT cards by default" period,
change that value to `"skip"`. In that mode, stacked PRs without a
durable UAT state get `uat: skip` instead of `uat: requested`.

### Layer 3: end-to-end smoke against a test-PR fixture

Two variants:

**3a. Local sim (per-PR, cheap).** A script that drives the SDLC
state transitions sequentially via `gh` against a sacrificial PR, then
invokes the extracted `scripts/sdlc/` and `scripts/staging/` modules
in the order the workflow would. No webhook wait, no run minutes,
cleans its own fixtures. Runs on every PR touching
`.github/workflows/`. Catches state-machine bugs in seconds.

**3b. Nightly fixture (real event delivery).** Opens a throwaway PR,
approves via a bot identity, asserts label transitions and `staging`
inclusion within N seconds, cleans up. Only layer that catches bug #3
(stale workflow on PR ref); 3a does not.

Tradeoff: 3a is fast and free; 3b is slow, costs minutes, adds moving
parts. Ship 3a first; treat 3b as a nightly safety net.
**Judgment call:** if 3a holds and bug #3 stays rare, drop 3b.

### What we are not doing in this ADR

- **No state machine in code.** Labels are still the state. The
  walker-clobber bug (bug #4) is a race; the fix is "preserve
  `uat: complete` and `uat: needs-changes` across rebuilds," not
  "move state out of labels." A proper state machine is its own
  decision with its own ADR if labels prove insufficient.
- **No prompt-engine abstraction for the MCP-vs-`gh` coupling.**
  Decision: `gh` everywhere. `scripts/sync-labels.mjs` and
  `scripts/staging/transition-uat-label.mjs` already follow this
  pattern and have worked well. Bug #5 closes by migrating
  `hourly-uat-validation.md` and any remaining `mcp__github__*` call
  sites in `docs/prompts/` to `gh`. Tracked in #575.
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
- The layer-2 extracts under `scripts/sdlc/` and the custom
  permission/silent-failure lint from layer 1 are runtime-agnostic by
  construction. They run the same under GitHub Actions, local
  launchd, a webhook-driven server, or a cloud instance. That falls
  out of the design rather than being a separate goal, but it matters
  for where the runtime is heading (see "Out of scope / future").

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
- **Runtime is going to shift.** Today the SDLC automation runs in two
  places: GitHub Actions for some workflows, and macOS launchd locally
  for engineer dispatch, pr-fixup, and the UAT walker (moved off GHA
  this week so the local Claude Max OAuth subscription bills instead
  of an API key). Directionally we expect: GitHub webhooks delivered
  to a server we own, initially still on the local machine driving
  tmux, eventually on cloud instances. The hardening here is
  deliberately friendly to that path. Tests assert behavior of the
  extracted scripts, not the surrounding runner; scripts are
  invokable from cron, launchd, a GHA step, or a webhook handler
  without modification. Concrete principle: **prompts and scripts
  must be invokable as standalone executables.** They cannot assume a
  surrounding GHA environment with `mcp__github__*` tools wired up,
  cannot assume `GITHUB_TOKEN` is auto-injected, and cannot assume a
  specific working directory. Bug #5 is the cautionary example: a
  prompt written against `mcp__github__*` that bailed silently the
  moment its runtime changed. New prompts and scripts should use
  `gh` (or an equivalent runtime-agnostic client) and read their
  config from explicit env vars or flags.
- **Multi-runtime, multi-model.** We use both Codex (OpenAI) and
  Claude as agent runtimes and will continue to. Prompts and the
  scripts that invoke them should not assume one model or one CLI.
  Where a script shells out to an agent, the binary and any
  model-specific flags belong in env vars or a config file, not
  hardcoded.

## GitHub-side configuration as code

Future direction. Layers 1-3 ship first.

Pipeline behavior also lives in GitHub's UI: branch protection /
rulesets on `main` and `staging`, the project board, repo settings,
merge queue. Drift there is invisible to everything in this ADR.

Already in repo: `CODEOWNERS` and the label set
(`scripts/sync-labels.mjs`). The rest is UI-configured.

Patterns: (1) Terraform `integrations/github` provider, strongest
drift detection, overkill for one repo; (2) `safe-settings` (GitHub's
Probot-based app, reconciles `.github/settings.yml` on a schedule);
(3) the original Probot Settings app, same shape but stale.

**Judgment call:** option 2. Covers branch protection, labels, and
most repo settings; reads YAML from the repo; one app to install.

Realistic scope: in - branch protection, rulesets, repo settings,
merge queue, label set; maybe - project board fields (ProjectV2 API
works but is awkward); out - project board automations (replace with
workflow adds or accept drift).

Tracked as a follow-up: research first (survey + recommendation),
prototype only if obvious.

## Follow-ups

Filed as separate issues; see the PR description for the linked set.
Each issue is sized to one PR and labelled `type: tech-debt` (mostly),
`area: infra`, with a `human-review-needed:` level per
`docs/sdlc/gaps.md`.

[^1]:
    Receipts. PRs #545 and #517 carry the post-mortems for bugs #1
    and #2. Bug #3 is visible in the timeline of any PR opened before
    #545 that received an approval after it merged: the workflow run
    was attached to the PR's head SHA, not main. Bug #4 is reproducible
    today: walk any PR to `uat: complete`, then push to a sibling PR,
    then re-check the first PR's labels. Bug #5 is visible in the
    local launchd `~/Library/Logs/uat-walker.log` from 06:15Z onward.
