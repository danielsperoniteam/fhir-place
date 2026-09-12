# Branch protection

## Main

`main` is the only integration branch and production source of truth.

| Rule | Setting |
| --- | --- |
| Deletion | blocked |
| Force push | blocked |
| Pull request | required |
| Approval | one CODEOWNER approval; stale approvals are not dismissed on push |
| Status checks | `test` and `e2e`; strict up-to-date checking is currently off |
| Merge queue | enabled, squash, all green, up to five entries |

Only Daniel is a bypass actor. Automation and agents must not use a bypass to
merge or push code to main.

## Staging

Staging is a disposable deployment artifact, not a review base, integration
branch, promotion source, or audit log.

The designated preview workflow is its only writer. It reconstructs staging
from main plus zero or one selected PR and pushes with
`--force-with-lease`. Humans and general-purpose agents do not push to it.

As of 2026-07-16, GitHub reports no repository ruleset targeting staging.
Workflow ownership is therefore enforced by repository instructions and the
single-writer scan, not by GitHub branch protection. If a staging ruleset is
added, it must permit the GitHub Actions identity used by
`preview-pr-on-staging.yml` to force-with-lease while blocking normal direct
pushes and deletion. Staging history is intentionally not preserved.

## PR rules

- Every PR targets main.
- Every branch starts from current main.
- Conflict resolution updates the PR branch against main.
- Staging is never merged into main.
- A hosted preview is evidence attached to the PR, not a separate approval or
  merge path.

## Verifying the live rulesets

The settings in GitHub are authoritative. Before changing this document or
the preview workflow, inspect the live rulesets:

```bash
gh api repos/danielsperoniteam/fhir-place/rulesets/15901122
gh api repos/danielsperoniteam/fhir-place/rulesets --paginate
```

Branch-protection changes are SDLC changes and require human review.
