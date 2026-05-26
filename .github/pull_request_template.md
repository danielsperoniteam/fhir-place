## Summary
-

## Issue
Closes #

## Why this change

Pick one of the two blocks below and delete the other. This is the
section a reviewer should be able to read and answer "should we ship
this?" without opening the diff.

<!-- ===== BUG FIX ===== Use this when the change makes broken
behavior correct. Delete this whole block if the PR is not a bug fix. -->

### Bug being fixed

One sentence describing what is currently wrong (symptom, not cause).

### Reproduce on `main`

Every step concrete enough that someone who has never seen this code can
paste/click and observe the bug:

1. <preconditions — server picked, route, mode (mock vs live), viewport
   when relevant>
2. <action — exact click / keystroke / curl / URL>
3. <observe — the actual broken behavior, verbatim>

### Expected behavior

What should happen instead.

### Root cause

One sentence on why it broke (file + reason). If the diff is the
explanation, write "see diff" — do not pad.

<!-- ===== FEATURE / NON-BUG ===== Use this when the change adds,
removes, or alters behavior on purpose (feature, refactor, infra,
docs, dep bump). Delete this whole block if the PR is a bug fix. -->

### Customer / user problem this solves

Restate the problem in the voice of the person it hurts (developer
evaluating fhir-place, clinical informaticist, on-call, future maintainer).
Two or three sentences. If the linked issue already states it well, paste
the relevant paragraph here verbatim and link the issue — don't make the
reviewer click through.

### Why now / why this approach

One or two sentences. If a different approach was considered and rejected,
name it. (Pure infra / CI / dep bumps may write "N/A — internal hygiene, no
user-facing problem.")

## Changes
-

## Test results
-

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
