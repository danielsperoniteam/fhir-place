# Proposal — `add-demo-writeup`

## Summary

PR 10 of Phase A — the partial slice that does not depend on PRs 7–9.

Packages the project as a credible portfolio/demo artifact for the work
that has actually shipped (PRs 1–6): the app skeleton, the FHIR
DataConnection, patient search and the resource viewer, the typed
patient-scoped FHIR tool registry, the structured `AgentAnswer` schema,
and the patient-summary agent loop.

The demo write-up emphasises **safety**, **FHIR grounding**, and
**stated limitations**. The two Phase A pillars that are still open —
**auditability** (PR 7) and **measurable evals** (PR 8) — are documented
as named gaps, not as completed work. The failure gallery (PR 9) is
similarly noted but not built.

## Motivation

Issue #79 (PR 10) explicitly *depends on* #78 (PR 9), which depends on
#77 (PR 8), which depends on #76 (PR 7). None of those are implemented
yet. Doing nothing until they land leaves PRs 1–6 undocumented at the
project level — `docs/architecture.md`, `docs/safety.md`, and
`docs/limitations.md` are still PR 1 placeholders even though five more
PRs have shipped on top of them. A reviewer landing on the repo today
gets stale guidance.

This change closes the gap for PRs 1–6 without faking the rest:

- The completed docs describe what is actually in the code, with file
  paths.
- The demo script walks a reviewer through the live behaviour the code
  supports today.
- The technical post draft is honest about what is and isn't shipped.
- The "deferred" sections name PR 7 / 8 / 9 as upstream work, not as
  excuses, so PR 10's *final* completion (the bits that need them)
  stays a real follow-up rather than a missing checkbox no one
  remembers.

## Scope

In:

- New `apps/workbench/docs/demo-script.md` — step-by-step demo a reviewer
  can run locally in ~10 minutes.
- New `apps/workbench/docs/post.md` — technical post draft scoped to
  PRs 1–6.
- Rewrite `apps/workbench/docs/architecture.md` — replace the PR-1
  placeholder with a real component-by-component description of what
  shipped through PR 6, including the frontend / API / DB boundary, the
  agent loop, and the FHIR-native choices that carry into PRs 7–9.
- Rewrite `apps/workbench/docs/safety.md` — keep the existing structure
  but anchor each safety layer to the file or test that enforces it.
- Rewrite `apps/workbench/docs/limitations.md` — split into "what is
  *intentionally* out of scope (Phase A icebox)" and "what is *not yet
  shipped* (PR 7 / 8 / 9 dependencies)".
- Update `apps/workbench/README.md` "Status" section: PRs 1–6 shipped,
  PRs 7 / 8 / 9 / 10 still in flight.
- Update `apps/workbench/src/pages/HomePage.tsx` — the in-app status
  blurb still says "currently shipped: app skeleton (PR 1) and FHIR
  DataConnection (PR 2)". Bring it in line with the rest.
- Update `apps/workbench/TASKS.md` — mark PRs 3 / 4 / 5 / 6 as Done and
  move the PR 10 card to a "PR 10 (partial)" section so the remaining
  PR 7–9 work is visible.
- README local-setup is validated by re-running `pnpm install`,
  `pnpm --filter @fhir-place/workbench db:setup`, `typecheck`,
  `test:run`, and `build` from a clean checkout. Outcome documented in
  the demo script.

Out (deferred to the follow-up PR 10 task that closes #79 fully):

- `apps/workbench/docs/evals.md` — needs the eval harness from PR 8
  before it can describe anything other than vapor.
- The failure-gallery walkthrough section of the demo script — needs the
  gallery from PR 9.
- New screenshots of an agent run with a captured tool timeline — needs
  the audit log from PR 7 to reproducibly capture the same run twice.
  The existing `screenshots/` PNGs (PR 3 era) are kept as-is.

## Architecture decisions

- **Don't write `docs/evals.md` yet.** A doc that says "evals will be
  here" rots into a worse signal than no doc. PR 8 owns this file.
- **Don't fabricate a "Phase A: shipped" claim.** The README, the docs,
  and the in-app blurb all flag the same partial state, in the same
  language. A reviewer should never be able to tell which surface they
  read first.
- **Anchor every safety claim to a file path.** A safety doc that
  describes the *intent* without naming the code that enforces it can
  drift silently. Each layer in `docs/safety.md` carries the test or
  source file that backs it; if that file moves, the doc has to.
- **Demo script targets a fresh checkout.** The script assumes nothing
  beyond `pnpm 10` and `node 22`; every command is copy-pasteable. It
  uses the public HAPI sandbox so a reviewer doesn't have to stand up
  Docker to evaluate the project.
- **Technical post is a draft, not a publication.** It lives in the
  repo so downstream PRs can edit it as PRs 7–9 land; it is not
  self-promoting marketing, and the "limitations" section is the load-
  bearing part.

## Safety

- The synthetic-only / not-for-clinical-use banner stays exactly where
  it is — the docs reinforce it but do not weaken it.
- The completed `docs/safety.md` strengthens the existing language: it
  names the file enforcing each layer and points at the test that would
  catch a regression, so a future contributor who deletes a check has a
  visible blast radius.
- Nothing in this change runs the agent against a real model, sends
  prompts to Anthropic, or touches a real PHI server. The demo script
  is wired against the public HAPI sandbox or a local Docker HAPI; the
  workbench refuses to start the agent without an `ANTHROPIC_API_KEY`
  the developer chooses to provide.

## Non-goals

- Marketing site or hosted multi-tenant deployment.
- Paid product positioning.
- Any clinical claim.
- Closing issue #79. PR 10 stays open until PRs 7 / 8 / 9 land and the
  deferred items above are filled in.
