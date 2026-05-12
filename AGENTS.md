# Codex Notes

## Where work lives

- **Project board:** <https://github.com/orgs/danielsperoniteam/projects/1>
- Two-week sprints. Pull from the current sprint sorted by Priority (P0 first).
- Issues are still the source of truth; the board is the lens.
- See `README.md` § Sprint board for the current focus and what's deferred.

## General

- Keep context small; read only files relevant to the active issue.
- Before implementation, summarize a short plan (2–4 bullet points).
- Prefer existing patterns over new abstractions.
- Treat GitHub issue acceptance criteria as the source of truth.
- After changes, report: files changed, tests run, risks, and follow-ups.

## E2E test maintenance

- Every user-facing change needs a test update in the same PR.
- New page or route → new spec in `apps/demo/e2e/`.
- New component on an existing page → add assertions to the relevant spec.
- Visual/layout change → run `playwright test --update-snapshots`, review
  the diff, and commit the updated PNGs.
- Bug fix → add a regression test asserting the broken state no longer occurs.
- Use `data-testid` selectors; avoid CSS class names and positional selectors.
- See `apps/demo/e2e/README.md` for the full test map and update rules.

## Screenshots on PRs

- **Every PR that changes anything user-visible** — demo apps under
  `apps/**` *and* library components under `packages/react-fhir/**` —
  must include screenshots in the PR body. Pure infra / CI / docs / private
  internal refactors may write "N/A — no user-visible change" instead, but
  must not skip the section silently.
- Commit the PNGs under `screenshots/pr-<branch-slug>/` in the same PR.
- Reference each one inline using the raw URL pattern so it renders in the
  PR description:
  `![desktop](https://raw.githubusercontent.com/danielsperoniteam/fhir-place/<branch>/screenshots/pr-<slug>/<file>.png)`
- Include before/after frames for state changes. Mobile (375x812) is
  required when the change touches a responsive layout.
- This is **separate** from the e2e snapshot baselines under
  `apps/demo/e2e/__screenshots__/` — those still require human review of the
  diff before they're overwritten.

## QA agent

When asked to do a QA pass on the demo app:

1. Ensure the dev server is running: `pnpm --filter @fhir-place/demo dev`.
2. Run the full e2e suite first: `pnpm --filter @fhir-place/demo e2e`.
   If any test fails, that is already a filed bug — do not re-file it.
3. For exploratory coverage beyond the suite, follow `docs/qa-agent.md`.
4. File each new bug as a GitHub issue using the `agent-work-item` template
   with concrete reproduction steps, expected vs. actual behavior, and the
   URL/route where the defect occurs.
5. Do not fix bugs during the same QA pass — file first, fix in a separate PR.

## Staging-first deploys

- Branch off `origin/main` (so the PR diff against main is clean —
  no in-flight work from other tickets).
- Open every PR with `base: main`. Then **promote your branch to
  `staging` yourself** so UAT can run *before* the human merges to main:
  ```bash
  git fetch origin staging
  git checkout -B staging-promote origin/staging
  git merge --no-ff --no-edit bot/issue-<N>-<slug>
  git push origin staging-promote:staging
  ```
  The push to `staging` must be fast-forward or a no-ff merge commit —
  never `--force`. If the merge conflicts, abort, leave staging alone,
  and note on the PR that staging promotion needs a human.
- Every PR body must include a **UAT on live staging** section with
  concrete steps a human or downstream agent can run against
  `https://danielsperoniteam.github.io/fhir-place/staging/` once your
  staging push lands and Pages redeploys. If you cannot articulate
  those steps, the change is not ready.
- The Pages workflow rebuilds both branches on every push; staging's
  build going green is part of "done."

## Safety rules (see docs/decisions/0003-agent-safety-rules.md)

- Small, issue-scoped changes only.
- Never delete production data, modify secrets, or force-push `main` or `staging`.
- All code changes go through a PR; do not merge without human review.
