<!--
Default base is `staging`, not `main`. Humans (or the engineer subagent)
merge into staging first, walk the UAT steps below against the live staging
URL, then promote staging -> main as a separate, batched fast-forward.

The exception is a `staging -> main` promotion PR itself, which targets `main`
and can leave the UAT section pointing at the prior signoff.
-->

## Summary
-

## Issue
Closes #

## Changes
-

## Test results
-

## UAT on live staging

After this PR is merged into `staging`, Pages redeploys at
<https://danielsperoniteam.github.io/fhir-place/staging/>. Walk these steps
against that URL before promoting `staging` -> `main`:

1. <route> — <action> — <expected observable result>
2.

<!-- Each step must name the route, the action, and the expected result. No
"verify it works" placeholders — write as if the reviewer has never seen
this change. If you cannot articulate the steps, the change is not ready. -->

## Acceptance / manual QA
- [ ] Acceptance criteria updated (if applicable)
- [ ] `manual-qa` label added when any acceptance item is not fully automated
- [ ] Linked/created manual QA issue(s):

## Screenshots / recordings

**Required** for any PR that changes anything user-visible — this includes
the demo apps **and** library components in `packages/react-fhir/**` (rendered
in Storybook or in a demo route). Pure infra / CI / docs / private-internal
refactors may write "N/A — no user-visible change" instead.

Convention:

- Commit screenshots under `screenshots/pr-<branch-slug>/` in the same PR.
- Reference each one inline below using the raw GitHub URL so it renders
  in the PR description:
  `![before](https://raw.githubusercontent.com/danielsperoniteam/fhir-place/<branch>/screenshots/pr-<slug>/<file>.png)`
- For state changes, include both **before** and **after**. For new flows,
  include the entry point and one or two intermediate steps.
- Mobile (375x812) screenshots are required when the change affects a
  responsive layout or anything below `md` breakpoint.
- A short Loom / asciinema for multi-step interactions is welcome — link
  it; do not commit binary recordings.

-

## Risks
-

## Follow-ups
-
