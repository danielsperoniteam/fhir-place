# Acceptance — `add-demo-writeup`

PR 10 partial — accepted when **all** of the following hold:

## Docs

- [ ] `apps/workbench/docs/architecture.md` exists, is no longer a
      placeholder, and describes every component that shipped through
      PR 6, with in-repo paths.
- [ ] `apps/workbench/docs/safety.md` exists, is no longer a
      placeholder, lists every currently-enforced safety layer, and
      anchors each layer to the file or test that enforces it.
- [ ] `apps/workbench/docs/limitations.md` exists, is no longer a
      placeholder, and clearly distinguishes:
      - Phase A icebox,
      - Not yet shipped (PR 7 / 8 / 9 dependencies),
      - Known incompletenesses of what is shipped.
- [ ] `apps/workbench/docs/demo-script.md` exists and provides a
      copy-pasteable walkthrough.
- [ ] `apps/workbench/docs/post.md` exists. It names what is shipped
      (PRs 1–6) and what is not (PR 7 / 8 / 9). It does not position
      the workbench as a clinical chatbot.

## In-app and README parity

- [ ] `apps/workbench/README.md` "Status" section reflects PRs 1–6
      shipped and links to `docs/demo-script.md`.
- [ ] `apps/workbench/src/pages/HomePage.tsx` in-app status blurb
      reflects PRs 1–6 shipped (no longer the PR-2-era language).
- [ ] `apps/workbench/TASKS.md` "Done" section lists PR 3 / 4 / 5 / 6
      in addition to PR 1 / 2.

## Validation

- [ ] From a clean checkout: `pnpm install`,
      `pnpm --filter @fhir-place/workbench db:setup`,
      `pnpm --filter @fhir-place/workbench typecheck`,
      `pnpm --filter @fhir-place/workbench test:run`, and
      `pnpm --filter @fhir-place/workbench build` all exit 0.
- [ ] No new automated tests are required (docs + UI text only); the
      existing 138-test workbench suite continues to pass.

## Honesty

- [ ] No doc claims a feature exists that isn't in `main`. In
      particular, `apps/workbench/docs/evals.md` is *not* introduced by
      this change.
- [ ] The synthetic-only / not-for-clinical-use language is preserved
      on every surface that touches FHIR data.
- [ ] The "deferred" task list in `tasks.md` names the PR 7 / 8 / 9
      dependencies explicitly so closing #79 fully remains a tracked
      follow-up.

## Out of scope

- [ ] No marketing site, hosted multi-tenant deployment, paid product
      positioning, or clinical claim is introduced.
- [ ] Issue #79 is **not** closed by this change. The remaining PR 10
      items unblock once PRs 7 / 8 / 9 land.
