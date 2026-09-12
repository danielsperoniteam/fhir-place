# 0009 Main-first delivery with single-PR staging previews

## Status

Accepted

## Context

The repository has accumulated three incompatible delivery models:

1. Agents open PRs against `staging`, then promote staging to `main`.
2. PRs target `main`, while every approved PR is merged together on
   `staging` for UAT.
3. PRs target `main`, and Playwright CI plus CODEOWNER approval is the
   merge gate without mandatory staging UAT.

The third model is already the intended merge policy from ADR 0008. The
remaining multi-PR staging stack adds failure modes without adding a useful
gate. On 2026-07-16, `staging` had 24 commits absent from `main` and was
missing 17 commits already on `main`. A rebuild workflow reported success
after encountering a merge conflict and deferring the push, so the green run
did not mean that staging had changed.

Local and CI validation cover most changes, but they cannot validate every
deployment concern. GitHub Pages base paths, hosted-origin behavior, CORS,
and the deployed bundle sometimes require a real hosted preview.

## Decision

`main` is the only integration branch and source of truth.

- Every work branch starts from `origin/main`.
- Every PR targets `main`.
- CI green plus CODEOWNER approval is the normal merge gate.
- User-visible changes include Playwright coverage and screenshots in the
  same PR.
- `staging` is an ephemeral preview artifact containing `main` plus zero or
  one explicitly selected PR.
- The canonical selection is the one open PR carrying `preview: staging`.
  A manual preview dispatch moves that label to the requested PR. More than
  one selected PR fails closed by resetting staging to main.
- Staging is never merged into `main`.
- Engineers and agents never push directly to `staging`. Only the designated
  preview workflow may reset it with `--force-with-lease`.
- A staging merge conflict fails the preview workflow. Conflict resolution
  belongs on the PR branch against `main`, never in a staging-only commit.
- When no preview is active, `staging` equals `main`.

Hosted preview validation is optional by default. A reviewer should request
it when deployment behavior is part of the risk, including Pages routing,
hosted-origin or CORS behavior, authentication redirects, live FHIR server
interactions, or a multi-step user flow that benefits from human inspection.
Docs, tests, internal refactors, and low-risk infrastructure normally rely on
local checks and CI.

## Preview workflow contract

The workflow accepts a PR number or an explicit reset action. It also reacts
to changes in the canonical `preview: staging` selection.

For a preview it must:

1. Fetch the open PR and verify its base is `main`.
2. Start from the current `origin/main`.
3. Merge exactly that PR head.
4. Verify the fetched PR head still matches the SHA whose checks passed.
5. Fail on a merge conflict, build failure, push failure, or Pages deployment
   failure.
6. Push `staging` with `--force-with-lease`.
7. Record the PR number, PR head SHA, and main SHA in the staging artifact.
8. Dispatch `pages.yml` from trusted `main`, pinned to the exact staging SHA.
9. Comment the deployed SHA and URL on the PR after Pages succeeds.

Pages builds main and the selected PR on separate runners with read-only
repository access and without persisted credentials. A third job combines
only their inert artifacts, so PR code cannot modify the production build.
Only the separate deploy job has `pages: write` and OIDC permission. A push
made by the preview workflow does not rely on another push-triggered workflow
being created by `GITHUB_TOKEN`.

On a push to `main`, the workflow rebuilds the active preview against the new
main head. When the previewed PR closes, or when reset is requested, the
workflow resets staging to main.

Invalid selections and failed required checks remove the selector label,
reset staging to main, redeploy that reset, and then fail. A Pages failure
also triggers a trusted recovery deployment of main before the controller
reports failure. Retargeting the selected PR away from main removes the
selection and performs the same reset.

A successful workflow run means the requested staging commit was pushed and
the corresponding Pages deployment succeeded. Deferring work and exiting
zero is not allowed.

## Consequences

Positive:

- PRs do not conflict merely because unrelated approved PRs share staging.
- The preview URL has one attributable change, so UAT results are meaningful.
- Staging drift is removed on every run.
- Conflict fixes land on the branch that will actually merge to main.
- Local conflict automation and hosted preview automation have separate jobs.

Negative:

- Only one PR can own the shared preview URL at a time.
- Requesting a second preview replaces the first one.
- Cross-PR integration testing requires an explicit temporary integration PR
  or a future per-PR preview system.

## Superseded decisions

This ADR supersedes the multi-PR staging-stack and staging-promotion portions
of ADRs 0007 and 0008. ADR 0008 remains authoritative for the Playwright and
CODEOWNER merge gate. The multi-PR stack, staging conflict resolver, hourly
UAT workflow, local UAT driver, and UAT label-transition code are retired.

## Operational migration

After this change merges:

1. Run the label-sync workflow so `preview: staging` exists.
2. Unload the retired local UAT job. Removing its repository plist does not
   stop an already-loaded LaunchAgent:

   ```bash
   launchctl bootout "gui/$(id -u)" \
     "$HOME/Library/LaunchAgents/com.fhir-place.hourly-uat-validation.plist"
   ```

3. Remove that copied plist from `~/Library/LaunchAgents/` after it is
   unloaded.
4. Run `Preview one PR on staging` with `action=reset` once. Confirm
   `origin/staging` equals `origin/main` and Pages redeploys `/staging/`.
