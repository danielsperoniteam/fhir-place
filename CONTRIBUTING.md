# Contributing

Thanks for your interest in `fhir-place`. This is a small project; the contribution bar is "ship something that's tested and honest about what it does."

## Prerequisites

- **Node.js ≥ 20** (check with `node -v`)
- **pnpm** — install with `npm i -g pnpm` if you don't have it

## Local setup

```bash
pnpm install
pnpm dev                                               # demo app (MSW mock by default)
pnpm test                                              # unit tests only (Vitest + MSW + jsdom)
pnpm -r typecheck
pnpm --filter @fhir-place/demo e2e                     # Playwright screenshots
pnpm --filter @fhir-place/react-fhir test:integration  # live-server HAPI integration (separate — not part of pnpm test)
```

The demo defaults to an in-browser MSW mock. To point at a real server:

```bash
VITE_USE_MOCK=false VITE_FHIR_BASE_URL=https://hapi.fhir.org/baseR4 pnpm dev
```

Docker compose for a local HAPI:

```bash
docker compose up -d
VITE_USE_MOCK=false VITE_FHIR_BASE_URL=http://localhost:8080/fhir pnpm dev
```

## Shipping a PR

1. Branch off `main` and open the PR against `main`.
2. Write the code + tests. Match the existing style (`tsc --strict`, Vitest, MSW for HTTP mocking). Every library-level change should have unit-test coverage; behaviour that touches real servers should also have an integration test in `packages/react-fhir/integration/`.
3. **Add a changeset** if your PR changes `@fhir-place/react-fhir`:
   ```bash
   pnpm changeset
   ```
   Pick the bump (`patch` / `minor` / `major`) and describe the change in human terms. Commit the generated `.changeset/*.md` alongside your code.
4. Open the PR. CI runs typecheck + tests + build. The release workflow automatically opens / updates a "Version Packages" PR that bumps versions + CHANGELOG when your PR lands; merging that second PR triggers a fresh npm publish.

### PR body — repro for bugs, customer problem for everything else

A reviewer should be able to read the PR body and answer "should we
ship this?" without opening the diff. The template
(`.github/pull_request_template.md`) carries the canonical schema; the
short version:

- **Bug fix** → fill in `### Bug being fixed`,
  `` ### Reproduce on `main` `` (numbered, copy-pasteable steps —
  preconditions / action / observed broken behavior),
  `### Expected behavior`, and `### Root cause`. Every step concrete
  enough that someone who has never seen this code can paste/click and
  observe the bug. "Open the app and notice it's broken" is not a
  repro step. If you cannot write a real repro, the issue is not a
  bug — push back on triage rather than ship.
- **Feature / refactor / infra / docs / dep bump** → fill in
  `### Customer / user problem this solves` (2–3 sentences in the
  voice of the person it hurts: developer evaluating fhir-place,
  clinical informaticist, on-call, future maintainer). If the linked
  issue states the problem well, paste that paragraph verbatim and
  link the issue — don't make the reviewer click through. Then
  `### Why now / why this approach`. Pure internal hygiene may write
  `N/A — internal hygiene, no user-facing problem.` in the problem
  section; no other section gets that escape hatch.

The PR-review routine grep-checks these headings verbatim and posts
an advisory comment if they're missing. It will not block merge for a
missing block today (humans approve), but the comment is loud.

> **Note:** `release.yml` is currently disabled (renamed to `release.yml.disabled`) until npm publishing is set up. The flow described above and the warning below apply once it's re-enabled — pending changesets accumulate in `.changeset/*.md` in the meantime and are not lost. To re-enable: flip the org-level "Allow GitHub Actions to create and approve pull requests" setting, populate the `NPM_TOKEN` repo secret, and rename the workflow back.

> **Do not manually create a "chore: release" PR.** The `changesets/action` manages that PR itself (pushing to `changeset-release/main` and opening a bot-owned PR). A human-authored PR targeting `main` from any other branch with the same title causes the action to fail when it tries to update the conflicting PR. If the Release workflow shows a red check on `main` and the only step that failed is the `changesets/action`, look for an open PR titled "chore: release" that was not created by `github-actions[bot]` — closing it unblocks the workflow.

## Optional hosted preview

CI green plus CODEOWNER approval is the normal merge gate. Staging is an
optional, disposable preview for deployment-specific risk:

```
staging = origin/main + zero or one explicitly selected PR
```

URLs:

- `main` is published at <https://danielsperoniteam.github.io/fhir-place/>
  (goals-tasks at `/fhir-place/goals/`).
- `staging` is published at <https://danielsperoniteam.github.io/fhir-place/staging/>
  (goals-tasks at `/fhir-place/staging/goals/`).

A maintainer can add the `preview: staging` label or run the
`Preview one PR on staging` workflow with the PR number after required checks
are green. At most one open PR may carry the label. The workflow starts from
current main, merges that one PR, deploys `/staging/`, and comments the exact
PR SHA and Pages run on the PR.

If the preview merge conflicts, resolve the PR branch against main. Do not
create a staging-only resolution. Removing the label, closing the PR, or
dispatching the reset action returns staging to main.

Agents and contributors never push to staging. Staging is never merged into
main. See [ADR 0009](docs/decisions/0009-main-first-single-pr-preview.md).

## Bump conventions

- **patch** — bug fixes, docs, internal refactors, dependency tightening
- **minor** — new hooks, new components, new optional props on existing APIs, new overrides
- **major** — breaking API changes, removed props, renamed exports, or semantic shifts in existing behaviour

The demo and example apps (`apps/**`) are not published; they don't need changesets.

## Design principles

Keep these in mind when making changes:

- **Spec-driven.** If you find yourself writing resource-specific logic in the library (e.g. a Patient-only helper), push it to the consumer app — or make it a generic primitive. The selling point is "works for every FHIR resource."
- **Server-agnostic.** Every feature flows through the `FhirClient` interface. No direct `fetch` calls outside `FetchFhirClient`.
- **Safe by default.** Only `<Narrative>` gets to render HTML. Every other component uses React's default escaping.
- **Escape hatches.** If something's hard-coded, provide a prop to override it. `renderers` / `inputs` / `cellRenderers` exist for a reason.

## `dangerouslySetInnerHTML` is forbidden without documented sanitization

FHIR data is attacker-controlled. Any FHIR resource the viewer fetches can carry `<`, `>`, or `&` (a `text.div` narrative is a *required* element on most resources), and `JSON.stringify` does not escape those characters. Passing FHIR-derived strings — or anything derived from them — into `dangerouslySetInnerHTML` is a stored-XSS sink. See #360 for the bug this rule was written for.

Rules:

- **Default: don't use it.** React's default text rendering escapes everything; that is what the JSON viewer, the structured detail walker, and every other display component must rely on.
- **If you genuinely need it,** the input must be either:
  1. constant markup the repo controls (no FHIR data, no user input), or
  2. run through a sanitizer with a tight allow-list (`DOMPurify` is the dependency of choice if you need one).
- **Document why.** Every remaining `dangerouslySetInnerHTML` in the codebase must have a comment immediately above it stating the sanitization story — what input it accepts, what trusts it, and why it's safe. PR reviewers should treat an undocumented sink as a blocker.
- **No exceptions for syntax highlighting.** If you're tempted to build HTML strings out of FHIR content for highlighting / pretty-printing, escape the content first (`& < >` is the minimum) or render the spans as React elements instead.

## Writing tests

- Unit tests live next to their code as `*.test.ts(x)`. Vitest + MSW + Testing Library.
- Integration tests target a real FHIR server and live in `packages/react-fhir/integration/`. Default target is public HAPI; override with `FHIR_BASE_URL`.
- Playwright e2e lives in `apps/demo/e2e/`. Screenshots go in `screenshots/` and get committed.

## Issue & label conventions

GitHub Issues are the canonical backlog (see `docs/decisions/0001-use-github-issues-as-source-of-truth.md`). To keep them scannable, every open issue should carry one `type:`, at least one `area:`, and one `priority:` label. Other prefixes are optional.

**Title convention:** plain, declarative, no `[bracket]` prefixes — labels carry the type / area signal.

**Label vocabulary:**

| Prefix | Cardinality | Values | Meaning |
| --- | --- | --- | --- |
| `type:` | exactly one | `bug`, `feature`, `tech-debt`, `docs`, `spike`, `epic` | What kind of work this is. `epic` = tracker for sub-issues. `spike` = time-boxed exploration. |
| `area:` | one or more | `fhir-explorer`, `react-fhir`, `workbench`, `cql`, `mcp`, `infra`, `auth`, `security` | Which part of the codebase is touched. `fhir-explorer` is the demo app at `apps/demo/` (legacy names: "demo", "fhir-ui", "live-monitor"). `react-fhir` is the published library at `packages/react-fhir/`. |
| `priority:` | exactly one | `P0`, `P1`, `P2`, `P3` | Triage signal. Bugs default to `P0`. Spikes / nice-to-haves default to `P2`. `P3` is the explicit-deferral bucket — out of current sprint, "someday" — not the same as no priority. Default `P1`. |
| `status:` | optional | `blocked`, `needs-triage`, `in-progress`, `needs-human`, `agent-paused` | Workflow state. Use sparingly. `in-progress` / `needs-human` are bot-managed by the engineer-dispatch routine; `agent-paused` on the dispatch tracking issue is the kill switch. |
| `origin:` | optional | `bot-filed` | Filed by automation (e.g. `live-site-monitor.yml`). |
| `phase-N` | optional | `phase-0`..`phase-3`, `fhir-workbench-phase-a` | Multi-phase epic tracking. Keep as plain (no prefix) for grep-ability. |

**When you open an issue:**
- Pick exactly one `type:`, at least one `area:`, exactly one `priority:`.
- Skip `status:` / `origin:` unless they apply.
- No `[bracket]` in the title — write it as a sentence.

**Renaming `apps/demo/`:** the directory and package will move to `apps/fhir-explorer/` (`@fhir-place/fhir-explorer`). Until that lands, code paths still say `demo`; the label and conversational name is `fhir-explorer`.

**Automation:** the canonical label set is managed by `scripts/sync-labels.mjs` and re-applied on every push to `main` via `.github/workflows/sync-labels.yml`. A daily cron (`.github/workflows/daily-pm-triage.yml`) runs the prompt at `docs/prompts/daily-pm-triage.md` to label new issues, strip bracket prefixes, dedup bot-filed bugs, close finished epics, and post a rolling daily report.

**Manual engineer dispatch:** to put an issue in front of the engineer subagent immediately, comment `/dispatch-engineer` on it (maintainers only) or run the `Dispatch engineer on issue` workflow from the Actions tab with the issue number. Unlike the hourly run, manual dispatch skips the readiness gates — you're trusted to know the issue is ready. The `status: agent-paused` kill switch and the `status: in-progress` lock still apply. See `docs/prompts/dispatch-engineer-on-issue.md`.

## Questions?

Open an issue. We're pre-1.0, so preferences and defaults are still moving.
