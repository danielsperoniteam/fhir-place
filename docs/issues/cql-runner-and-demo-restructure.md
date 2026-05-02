# CQL Runner + Demo Restructure

Status: planned, not started. Source of truth for the work on branch `claude/plan-cql-runner-IAd0L`. Phases can be parallelized — see "Parallelization" below.

## Context

`fhir-place` today is a spec-driven React FHIR library (`@fhir-place/react-fhir`) plus a Vite demo app (`apps/demo`) that browses FHIR resources against a configurable server. The demo is the main showcase (live on GitHub Pages against public HAPI R4) but is single-purpose: it only renders raw FHIR.

The goal is to add a second surface — a **CQL runner** — that lets people paste CQL, run it against the same FHIR server, and see results rendered well (not raw JSON). The wedge is *iteration on CQL against real FHIR data with good result rendering*, not a full IDE.

To make room for the second surface (and any future ones), `apps/demo` is restructured into a route shell with two surfaces side by side: the existing FHIR browser (`/fhir-ui/*`) and the new CQL runner (`/cql-runner/*`). Both share the existing server picker, FHIR client, and resource renderers from `@fhir-place/react-fhir`.

Phase 1 is paste-and-run with a polished result renderer. Phase 2 adds an editor and library management. A small Java translator service (`services/cql-translator`) wraps the official cqframework CQL→ELM translator; ELM execution runs client-side via the `cql-execution` npm package.

## Decisions locked in

- **One package, no split.** `@fhir-place/react-fhir` already exports both the client and the UI components. The CQL runner consumes it the same way the existing pages do. No new `packages/fhir-ui` or `packages/fhir-client` until a second consumer actually demands it.
- **URL layout:** all existing demo routes move under `/fhir-ui/*`, CQL runner lives under `/cql-runner/*`, with redirects from old paths so the live GitHub Pages site keeps working.
- **Translator hosting deferred.** Phase 1 ships a `Dockerfile` + `docker-compose.yml` entry only. Hosting (Fly/Cloud Run/etc.) decided when the live demo needs CQL.
- **`apps/goals-tasks` untouched.** It's a separate app and stays one. No restructure touches it.
- **`cql-runtime` package not extracted.** All CQL wiring stays inside the cql-runner route. Extract only when a second consumer appears.

## Parallelization

Three workstreams that can run independently once Phase 0 lands:

1. **Phase 0 — Restructure** (must land first; small, mechanical). Unblocks 2.
2. **Phase 1a — Translator service** (`services/cql-translator/`). Independent of Phase 0; can start in parallel.
3. **Phase 1b — Runner UI + execution wiring** (`apps/demo/src/routes/cql-runner/`). Depends on Phase 0 (route shell) and Phase 1a (a working translator endpoint, even local).

Phase 2 (editor + libraries) is a follow-up branch.

---

## Phase 0 — Restructure

Goal: existing demo behaves identically, but lives at `/fhir-ui/*` and the shell can host a second route.

### Files to modify

- **`apps/demo/src/App.tsx`** — rewrite the route table:
  - Wrap current routes under `/fhir-ui/*`.
  - Add `/cql-runner` placeholder route (renders "coming soon").
  - Add redirects: `/` → `/fhir-ui/Patient`, `/Patient` → `/fhir-ui/Patient`, `/Patient/new` → `/fhir-ui/Patient/new`, `/settings` → `/fhir-ui/settings`, `/ask` → `/fhir-ui/ask`, `/:resourceType/:id/edit` → `/fhir-ui/:resourceType/:id/edit`, `/:resourceType/:id` → `/fhir-ui/:resourceType/:id`, `/:resourceType` → `/fhir-ui/:resourceType`. Use `Navigate` with `replace`.
  - Update the header: keep the existing "fhir-place" home link, add nav links between `FHIR UI` (→ `/fhir-ui/Patient`) and `CQL Runner` (→ `/cql-runner`). Move the existing `Ask` link inside the FHIR UI section.
- **`apps/demo/src/pages/`** — move into `apps/demo/src/routes/fhir-ui/pages/`. Adjust imports in `App.tsx` accordingly. Leave `ask/`, `compartment.ts`, `patientFields.ts`, `serverProbe.ts`, `mocks/`, `components/` where they are for now (move only if obviously fhir-ui-specific; keep if shared).
- **Create `apps/demo/src/routes/cql-runner/`** with a stub `CqlRunnerPage.tsx` that renders a placeholder.
- **`apps/demo/e2e/`** — update Playwright tests that hit hardcoded `/Patient` etc. to the new paths (or rely on the redirects, which is fine for most cases).

### Things to preserve

- `main.tsx` providers (`QueryClientProvider`, `FhirClientProvider`, Router with hash/browser switch) — no changes.
- `config.ts`, `serverProbe.ts`, MSW setup — no changes.
- `apps/goals-tasks/` — no changes.
- `@fhir-place/react-fhir` package — no changes.

### Exit criteria

- `pnpm -r test` passes.
- `pnpm --filter @fhir-place/demo dev` shows the same UI at `/fhir-ui/Patient` and any old URL bookmarked at `/Patient` etc. redirects there.
- Header shows nav links to FHIR UI and CQL Runner; CQL Runner renders the placeholder.
- E2E: `pnpm --filter @fhir-place/demo e2e` passes (after path updates / relying on redirects).

---

## Phase 1 — CQL Runner: Paste and Run

Goal: paste CQL, get rendered results that beat raw JSON.

### Phase 1a — `services/cql-translator/` (net-new directory)

- Single-endpoint Java service wrapping `org.cqframework:cql-to-elm`.
- `POST /translate` accepts `{ cql: string }`, returns ELM JSON or `{ errors: [{ line, col, message }] }`.
- `Dockerfile` (multi-stage: maven build → JRE runtime).
- Add a `cql-translator` service to the existing `docker-compose.yml` (alongside `hapi`) on a fixed port (e.g. 8081). CORS open for localhost dev.
- README with `docker compose up cql-translator` + curl example.
- License check: cqframework is Apache-2.0 (confirm in `pom.xml`).
- **No hosting config in this phase.** Add a `TRANSLATOR_URL` env (`VITE_CQL_TRANSLATOR_URL`) consumed by the runner; defaults to `http://localhost:8081`.

### Phase 1b — `apps/demo/src/routes/cql-runner/`

- **`CqlRunnerPage.tsx`** — page layout: server picker (already in shell header), patient context picker, CQL textarea, Run button, Results panel, Errors panel.
- **`translator.ts`** — `translateCql(cql: string): Promise<ElmLibrary | TranslationError>`. Hits `VITE_CQL_TRANSLATOR_URL`. License check on `cql-execution` (Apache-2.0, confirm).
- **`fhirDataSource.ts`** — adapter implementing `cql-execution`'s `PatientSource` / data source interface, backed by `useFhirClient()` from `@fhir-place/react-fhir`. Map CQL "retrieve by type + patient" calls to FHIR searches via the existing client.
- **`runCql.ts`** — orchestration: translate → instantiate executor with ELM + data source → return shaped result.
- **`PatientContextPicker.tsx`** — small wrapper over the existing patient list/search hooks from `@fhir-place/react-fhir` to pick a patient.
- **`results/CqlResult.tsx`** — dispatcher on result shape:
  - `Boolean` → big pass/fail badge.
  - `Number | String | Date | Code` → labeled value.
  - `Interval` → start/end with type-aware formatting.
  - `Tuple` → key/value table.
  - `List` of FHIR resources → reuse `ResourceTable` / per-type renderers from `@fhir-place/react-fhir`.
  - `List` of primitives → simple table.
  - `List` of tuples → table with columns from tuple keys.
  - Unknown → JSON `<pre>` with a "no nice view yet" affordance.
- **`results/shape.ts`** — a small `inferShape(value)` helper feeding the dispatcher.
- **`errors/ErrorPanel.tsx`** — three labeled buckets (translator / execution / FHIR fetch). FHIR errors come from `FhirError` already exported by `@fhir-place/react-fhir`.
- **`examples.ts`** — 3–5 seed CQL snippets shown in a "Load example" dropdown: a boolean check, a list of Observations, a Tuple, an Interval, a primitive list. Hand-picked to show off renderer variety.

### Dependencies

- Add `cql-execution` to `apps/demo/package.json`.
- No new packages in `packages/`.

### Reuse (do not reinvent)

- FHIR client + auth headers: `FetchFhirClient`, `buildRequestHeaders` (`apps/demo/src/config.ts:203`), `useFhirClient` from `@fhir-place/react-fhir`.
- Server picker: `apps/demo/src/components/ServerPicker.tsx` (already in shell header after Phase 0).
- Resource renderers: `ResourceView`, `ResourceTable`, primitive renderers from `@fhir-place/react-fhir/components`.
- Patient search: existing hooks from `@fhir-place/react-fhir/hooks`.
- React Query is already wired at the root for caching.

### Tests

- Unit (Vitest): `inferShape`, `translateCql` (mock fetch), `fhirDataSource` (mock FHIR client), per-shape renderers (snapshot).
- E2E (Playwright): one happy path that loads an example, runs it against MSW-mocked FHIR + a stubbed translator response, asserts the rendered result.

### Exit criteria

- Paste any reasonable patient-scoped CQL → translator returns ELM → engine executes → `<CqlResult>` renders the right shape.
- Translator + execution errors visible in the error panel without reload.
- All examples in the dropdown work end-to-end.

---

## Phase 2 — Edit and Author (deferred, sketch only)

Not implemented in this branch. Sketched so Phase 1 doesn't paint into a corner.

- Swap textarea for **CodeMirror 6** (lighter than Monaco; sufficient highlighting story via existing TextMate grammar; cleaner Vite story).
- Inline error markers driven by translator `{ line, col }` output.
- Library data model: `{ id, name, version, cql, updatedAt }`. Storage interface `LibraryStore` with a `LocalStorageLibraryStore` impl. Backend impl is a future swap.
- Library list UI (sidebar in cql-runner route), CRUD, duplicate, import/export `.cql`.
- `include` resolution at translate time: resolve referenced libraries from the store, send all needed CQL text to the translator (translator already supports multi-library compilation).

---

## Long-term seams (preserve in Phase 1)

- **Server-side execution swap point:** keep `runCql.ts` as the only place that calls `cql-execution`. Future server-side path replaces this file's body without touching UI.
- **Storage swap point:** Phase 2's `LibraryStore` interface is the seam.
- **`cql-runtime` package extraction:** only when `apps/goals-tasks` (or a new app) needs CQL. Not now.

---

## Verification (end-to-end after Phase 1)

1. `docker compose up hapi cql-translator` — translator on `:8081`, HAPI on `:8080`.
2. `pnpm install` (picks up `cql-execution`).
3. `pnpm --filter @fhir-place/demo dev`.
4. Visit `/`. Confirm redirect to `/fhir-ui/Patient`. Confirm header nav shows both surfaces.
5. Old bookmark check: visit `/Patient/123` and confirm it redirects to `/fhir-ui/Patient/123`.
6. Visit `/cql-runner`. Pick the local HAPI server in the picker. Pick a patient. Load each seed example, click Run, confirm the renderer shape matches the example.
7. Force a translator error (malformed CQL) and a FHIR error (stop HAPI). Confirm both surface in distinct error buckets.
8. `pnpm -r test` and `pnpm --filter @fhir-place/demo e2e` green.

## Critical files reference

- `apps/demo/src/App.tsx` (route table — rewrite Phase 0)
- `apps/demo/src/main.tsx` (providers — leave alone)
- `apps/demo/src/config.ts` (server config, headers — reuse `buildRequestHeaders`)
- `apps/demo/src/components/ServerPicker.tsx` (header picker — reuse)
- `packages/react-fhir/src/index.ts` and `packages/react-fhir/src/components/` (renderers — reuse)
- `docker-compose.yml` (add `cql-translator` service)
- New: `services/cql-translator/{Dockerfile,pom.xml,src/...}`
- New: `apps/demo/src/routes/{fhir-ui,cql-runner}/...`

## Risks / follow-ups

- Live GitHub Pages site uses HashRouter; redirects need to work under hash routing too — verify with `USE_HASH_ROUTER=true` locally.
- `cql-execution`'s data source interface may not map 1:1 to the existing FHIR client; the adapter may need to translate CQL retrieve filters to FHIR search params. Worth a 30-min spike before the full Phase 1 build.
- Tailwind config in `apps/demo` already covers `src/`; confirm the `routes/` move doesn't escape its `content` glob.
- Patient context picker: if no patient is selected, only non-patient-scoped CQL should run — gate Run button accordingly.
