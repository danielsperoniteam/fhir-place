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

1. Branch off `main`. (See "Staging deploys" below for the staging-promote
   step you do before review.)
2. Write the code + tests. Match the existing style (`tsc --strict`, Vitest, MSW for HTTP mocking). Every library-level change should have unit-test coverage; behaviour that touches real servers should also have an integration test in `packages/react-fhir/integration/`.
3. **Add a changeset** if your PR changes `@fhir-place/react-fhir`:
   ```bash
   pnpm changeset
   ```
   Pick the bump (`patch` / `minor` / `major`) and describe the change in human terms. Commit the generated `.changeset/*.md` alongside your code.
4. Open the PR. CI runs typecheck + tests + build. The release workflow automatically opens / updates a "Version Packages" PR that bumps versions + CHANGELOG when your PR lands; merging that second PR triggers a fresh npm publish.

## Staging deploys

The `staging` branch is a continuously-rebuilt deploy target:

```
staging = origin/main + every open PR with reviewDecision == APPROVED
```

Stacking is automatic — when a PR receives an approving CODEOWNER
review, the [`stack-approved-prs.yml`](.github/workflows/stack-approved-prs.yml)
workflow resets staging to main HEAD, merges every approved-and-open
PR's head in order, and force-pushes. `pages.yml` redeploys
`/staging/` with the new tip. Staging has no branch protection — it's
a deploy artifact, not a source-of-truth branch.

URLs:

- `main` is published at <https://danielsperoniteam.github.io/fhir-place/>
  (goals-tasks at `/fhir-place/goals/`).
- `staging` is published at <https://danielsperoniteam.github.io/fhir-place/staging/>
  (goals-tasks at `/fhir-place/staging/goals/`).

**Flow:**

1. Open every PR — human or agent — with `base: main`.
2. Get CODEOWNER approval. On approval, `stack-approved-prs.yml`
   rebuilds staging automatically (you don't push to staging
   yourself).
3. Walk the PR's **UAT on live staging** steps against the live
   `/staging/` URL. If anything is off, push a fix to the PR
   branch — staging rebuilds on the next event (push, approval, or
   close).
4. When UAT passes, merge the PR to `main`. The next staging
   rebuild excludes it (it's on main now, no longer "approved
   and open").

**Direct-to-main commits** trigger a staging rebuild from the new
main HEAD automatically (the workflow fires on `push: main`). No
separate sync step needed — every rebuild starts from main HEAD, so
drift is impossible.

**Agents never push to staging.** Engineer subagents only push to
their `bot/*` branches; staging is owned by `stack-approved-prs.yml`
and force-rebuilt from scratch on every relevant event. See
`.claude/agents/engineer.md` and `AGENTS.md`. Every agent-authored
PR must include a UAT section with concrete copy-pasteable steps for
the live staging URL.

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
| `priority:` | exactly one | `high`, `medium`, `low` | Triage signal. Bugs default to `high`. Spikes / nice-to-haves default to `low`. Default `medium`. |
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
