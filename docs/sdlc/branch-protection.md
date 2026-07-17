# Branch protection

Both `main` and `staging` are protected by GitHub repository rulesets.
The settings mirror each other — the same quality gate applies to both
branches so that code hitting staging has already passed CI.

## Why a merge queue on staging

Without a merge queue, approving two PRs in quick succession leads to
the second one going stale (its CI ran against the old base). A human
would have to come back, click "Update branch", wait for CI again, then
merge. The merge queue eliminates this: approve multiple PRs, they queue
up, GitHub rebases each against the latest staging head, runs CI, and
merges sequentially — no human round-trips.

## Ruleset: Protect staging

| Rule | Setting | Rationale |
|------|---------|-----------|
| Deletion | blocked | Prevent accidental branch deletion |
| Force push | blocked | Preserve history for audit trail |
| Require PR | 1 approval, dismiss stale reviews on push | Human code review gate |
| Required status checks | `test`, `e2e` (strict) | CI must pass against latest base |
| Merge queue | squash, all-green, 5 max entries, 5 min wait | Batch without conflicts |

**Merge method:** squash — keeps staging history clean and one commit per
feature for easy UAT tracing.

**Strict status checks:** PRs must be up-to-date with staging before
merge. The merge queue handles this automatically.

## Ruleset: Protect main

| Rule | Setting | Rationale |
|------|---------|-----------|
| Deletion | blocked | Never delete main |
| Force push | blocked | History is sacred |
| Require PR | 1 approval, code owner review, dismiss stale | Only a code owner can approve |
| Required status checks | `test`, `e2e` (strict) | Same CI gate as staging |
| Merge queue | squash, all-green, 5 max entries, 5 min wait | Batch promotions cleanly |

**Enforcement:** active (enabled 2026-05-09).

## Bypass actors

**Staging:** The admin repository role (which includes GitHub Actions
workflows running with `contents: write`) is configured as a bypass
actor. This allows the `promote-staging.yml` and `sync-staging.yml`
workflows to push directly to `staging` without opening a separate PR.
Human contributors still go through the PR + merge queue flow.

**Main:** Only `@danielsperoni` (user ID `7095019`) is a bypass actor.
This means only Daniel can merge PRs to main — whether that's a
promotion PR from staging or a fast-track direct-to-main PR. Code owner
review (via CODEOWNERS) is also required, ensuring Daniel must approve
before merging.

## Skipping staging (fast-track to main)

For non-user-visible changes (docs, CI workflows, markdown-only) you
can merge directly to `main` by opening a PR with `base: main`. When
this happens, `sync-staging.yml` fires on the push to `main` and
automatically merges main back into staging so it stays current.

Fast-track is appropriate when:
- All changes are `*.md`, `.github/workflows/`, or other non-deployed files
- The change doesn't need UAT validation on the staging URL
- You're confident the change won't conflict with in-flight staging work

If a PR targeting `main` has merge conflicts, the `/resolve-conflicts`
workflow can resolve the PR head against `main` without pushing directly to
`main`. Bot-authored PRs blocked by conflicts are also eligible for
`pr-fixup-dispatch`, which dispatches the same resolver automatically. The
resolver makes judgment calls for hand-authored conflicts and escalates to
`@danielsperoni` only for binary, generated, semantically ambiguous, or
product-decision conflicts.

## How to modify these rules

Rulesets are managed via the GitHub API or the repo Settings > Rules UI:
- Staging: `gh api repos/danielsperoniteam/fhir-place/rulesets/16171731`
- Main: `gh api repos/danielsperoniteam/fhir-place/rulesets/15901122`

Changes to branch protection are SDLC changes and require human review.
