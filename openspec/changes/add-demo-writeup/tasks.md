# Tasks — `add-demo-writeup`

PR 10 partial — the slice that does not depend on PRs 7 / 8 / 9.

- [x] Add `openspec/changes/add-demo-writeup/{proposal,requirements,tasks,acceptance}.md`.
- [x] Validate README local setup from a clean checkout: `pnpm install`,
      `pnpm --filter @fhir-place/workbench db:setup`, `typecheck`,
      `test:run`, `build` all green.
- [x] Add `apps/workbench/docs/demo-script.md` — copy-pasteable
      walkthrough against the public HAPI sandbox.
- [x] Rewrite `apps/workbench/docs/architecture.md` — describe
      everything shipped through PR 6, with file paths.
- [x] Rewrite `apps/workbench/docs/safety.md` — anchor each safety layer
      to the file (or test) that enforces it.
- [x] Rewrite `apps/workbench/docs/limitations.md` — split icebox vs.
      not-yet-shipped vs. known incompletenesses.
- [x] Add `apps/workbench/docs/post.md` — technical post draft.
- [x] Update `apps/workbench/README.md` "Status" section to reflect
      PRs 1–6 shipped and link to `docs/demo-script.md`.
- [x] Update `apps/workbench/src/pages/HomePage.tsx` in-app status blurb
      to reflect PRs 1–6.
- [x] Update `apps/workbench/TASKS.md` "Done" section to list
      PR 3 / 4 / 5 / 6, and split the PR 10 card into "shipped now" vs.
      "deferred to upstream PRs 7 / 8 / 9".

## Deferred to follow-up PR 10 work (blocked on PRs 7 / 8 / 9)

- [ ] Add `apps/workbench/docs/evals.md` (depends on PR 8).
- [ ] Add the failure-gallery walkthrough to the demo script (depends
      on PR 9).
- [ ] Add screenshots of an agent run with a captured tool timeline
      (depends on PR 7's audit log so the same run is reproducible).
- [ ] Final validation that closes #79: a reviewer can understand the
      safety model in under five minutes *including* evals and the
      failure gallery.
