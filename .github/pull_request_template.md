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
<https://samsuffolksperoni.github.io/fhir-place/staging/>. Walk these steps
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
Required for UI/UX changes. Add links to externally hosted recordings or assets committed under the relevant app's `docs/`.
-

## Risks
-

## Follow-ups
-
