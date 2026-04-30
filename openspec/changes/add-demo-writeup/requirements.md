# Requirements — `add-demo-writeup`

## Functional

- F1. `apps/workbench/docs/architecture.md` describes every component
  shipped through PR 6: UI shell, FHIR DataConnection, patient search +
  resource viewer, typed FHIR tool registry, `AgentAnswer` schema +
  renderer, patient-summary agent loop. Each section names the file or
  directory the component lives in.
- F2. `apps/workbench/docs/safety.md` lists every safety layer the
  project currently enforces and, for each, names the file (or test)
  that enforces it.
- F3. `apps/workbench/docs/limitations.md` distinguishes:
      - Phase A icebox (intentionally out of scope, will not be added),
      - Not yet shipped (PR 7 / 8 / 9 dependencies tracked on GitHub),
      - Known incompletenesses of what *is* shipped.
- F4. `apps/workbench/docs/demo-script.md` provides a copy-pasteable,
  ~10-minute walkthrough that a reviewer with `pnpm 10` and `node 22`
  can run from a fresh checkout against the public HAPI sandbox.
- F5. `apps/workbench/docs/post.md` is a technical post draft. It
  describes the project, the safety model, and the FHIR-grounding
  approach. It explicitly names what is shipped (PRs 1–6) and what is
  not (PR 7 / 8 / 9). It does not position the workbench as a clinical
  chatbot.
- F6. `apps/workbench/README.md` "Status" section reflects PRs 1–6
  shipped. It points at `docs/demo-script.md`.
- F7. `apps/workbench/src/pages/HomePage.tsx` in-app status blurb
  reflects PRs 1–6 shipped, not the PR-2-era language it has today.
- F8. `apps/workbench/TASKS.md` "Done" section lists PRs 3 / 4 / 5 / 6
  in addition to PRs 1 / 2.

## Non-functional

- N1. No doc claims a feature exists that isn't in `main`. In particular
  `docs/evals.md` is *not* added in this change; PR 8 owns it.
- N2. Each safety layer in `docs/safety.md` carries an in-repo path so
  the doc breaks visibly if the underlying enforcement is removed.
- N3. The synthetic-only / not-for-clinical-use language is preserved
  on every surface that touches FHIR data and is reinforced — never
  softened — by the new docs.
- N4. The demo script's commands match the README's commands; the two
  do not drift.
- N5. The technical post draft is honest about the gaps. The
  "limitations" / "not yet shipped" sections are not buried.
- N6. The new docs are colocated with the existing workbench docs
  (`apps/workbench/docs/`), not at the repo root. Top-level
  `docs/agent-loop.md` stays where it is for now.

## Validation

- V1. From a clean checkout: `pnpm install` succeeds.
- V2. `pnpm --filter @fhir-place/workbench db:setup` succeeds.
- V3. `pnpm --filter @fhir-place/workbench typecheck` exits 0.
- V4. `pnpm --filter @fhir-place/workbench test:run` exits 0.
- V5. `pnpm --filter @fhir-place/workbench build` produces a Vite bundle.
- V6. The Vite dev server (`pnpm --filter @fhir-place/workbench dev`)
      and the Hono API (`pnpm --filter @fhir-place/workbench server`)
      both start cleanly on a fresh checkout.

## Tests

This change is documentation + UI text. No new automated tests are
added; the existing 138-test workbench suite continues to pass and is
the regression boundary for the code surfaces the docs describe.

## Documentation

- D1. New: `apps/workbench/docs/demo-script.md`,
      `apps/workbench/docs/post.md`,
      `openspec/changes/add-demo-writeup/{proposal,requirements,tasks,acceptance}.md`.
- D2. Rewritten: `apps/workbench/docs/architecture.md`,
      `apps/workbench/docs/safety.md`,
      `apps/workbench/docs/limitations.md`.
- D3. Updated: `apps/workbench/README.md`,
      `apps/workbench/TASKS.md`,
      `apps/workbench/src/pages/HomePage.tsx`.
