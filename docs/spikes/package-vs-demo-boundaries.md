# Package vs Demo Boundaries — Moving Value Into `@fhir-place/react-fhir`

Status: Proposed — principal review, May 2026
Refines: ADR `docs/decisions/0004-positioning.md` ("Library Positioning and Wedge")
Related: `docs/issues/cql-runner-and-demo-restructure.md`,
`docs/issues/react-fhir-testing-and-organization-improvements.md`

## TL;DR

Today the package covers the **resource layer** very well — datatype dispatch,
StructureDefinition introspection, search, four primary components, 23 inputs,
hooks for CRUD and terminology. The **app-shell layer** — compartment views,
server selection, capability probing, request preview, reference-link
navigation, bundle entry extraction — lives in `apps/demo`, and `apps/goals-
tasks` has now reimplemented the same patterns by hand. With two consumer apps
duplicating boilerplate the package could absorb, the threshold ADR 0004 set
("until a second consumer actually demands it") is met.

This spike proposes promoting **~10 modules** out of the demo and into the
package across **three additive PRs**, plus carving out a separate
`@fhir-place/cql` companion package for the CQL bridge. No breaking changes to
existing exports.

## Why now

ADR 0004 fixes the wedge as "backend-agnostic, spec-driven, headless React
primitives for any FHIR REST API" and explicitly reserves room for LLM/agent
ergonomics. The cql-runner restructure note (`docs/issues/cql-runner-and-demo-
restructure.md:15-21`) deferred package growth: "One package, no split. No new
packages until a second consumer actually demands it."

Evidence the threshold is met:

- `apps/goals-tasks/src/pages/PatientOverviewPage.tsx` and
  `apps/demo/src/components/CompartmentSection.tsx` both implement the same
  "list N resources of type X scoped to a parent" loop with hand-rolled
  `bundle?.entry?.flatMap(...)`.
- Both apps build their own status-pill / label-formatter helpers
  (`apps/goals-tasks/src/helpers.ts`).
- Both apps wire identical `QueryClientProvider` + `FhirClientProvider` boots.
- Both apps copy the same `onRowClick → router.navigate(...)` pattern.

The package README claims "everything derives from the spec's own metadata, so
the library works natively against any FHIR REST API." That is true at the
resource layer and partially aspirational at the app-shell layer.

## What's already in scope (keep as-is)

The four-layer architecture in `packages/react-fhir/src/index.ts` is sound:

- `client/` — `FetchFhirClient`, `SearchBuilder`, `formatSearchRequest`,
  `FhirError`. No React, no globals.
- `structure/` — `walkResource`, `pathGet/Set/Remove`, `bindingFor`,
  `formatHumanName/Address/Coding/CodeableConcept/Quantity/Period`,
  `elementPathForSearchParam`, bundled `StructureDefinition`s for 8 core
  resources, `valueset` lookups.
- `hooks/` — `FhirClientProvider`, `useResource`, `useSearch`,
  `useInfiniteSearch`, `useCreate/Update/DeleteResource`, `useCapabilities`,
  `useStructureDefinition`, `useValueSet`, `useValueSetExpansion`,
  `useReadReference`, `useReadReferences`.
- `components/` — `ResourceView`, `ResourceEditor`, `ResourceSearch`,
  `ResourceTable`, `ReferencePicker`, `Narrative`, `ColumnPicker`, plus 23
  type-specific inputs/renderers under `components/inputs/`.

The layering rule ("contribute at the lowest layer that can host the
behaviour") is documented and should continue to apply.

## Gaps — proposed additions, by layer

### 1. `structure/` (no React, no network)

| Add | Source today | Notes |
| --- | --- | --- |
| `resourceFieldOptions(sd, resourceType)` | `apps/demo/src/patientFields.ts:31` | Generalize from `patientFieldOptions`. Already calls package's `directChildren()`. Expand `[x]` choice elements into per-variant options. |
| `compartmentDefinition(name)` | none — currently the demo hard-codes `patient` as the search param in `CompartmentSection.tsx:34` | Bundle the five FHIR R4 compartments (Patient, Encounter, Practitioner, Device, RelatedPerson) like core SDs are bundled in `structure/core/`. Returns the canonical `{ resourceType: searchParam }` map. |
| `bundleEntries<T>(bundle)` | repeated inline as `bundle?.entry?.flatMap(e => e.resource ? [e.resource] : []) ?? []` everywhere | Trivial typed helper; biggest readability win across both consumer apps. |
| `buildSearchUrl(base, type, params)` | `apps/demo/src/ask/url.ts:7-21` | Already tested. |
| `parseSearchUrl(url)` | `apps/demo/src/ask/url.ts:30-40` | Already tested. |
| `sameOrigin(target, base, ref)` | `apps/demo/src/ask/url.ts:51-61` | The most important addition — it's a **security boundary**. Today only the demo's Ask page uses it to refuse to send bearer headers cross-origin. Any consumer that lets users edit URLs needs the same gate. |

### 2. `client/`

| Add | Source today | Notes |
| --- | --- | --- |
| `probeServer(base, opts)` | `apps/demo/src/serverProbe.ts:18` | Returns `{ ok: true, software?, fhirVersion? }` or `{ ok: false, kind: "http" \| "network", message }`. CORS-aware error classification stays. |
| `bearerAuth(token)`, `staticHeaders(headers)` | `apps/demo/src/config.ts:218` (`buildRequestHeaders`) | Middleware factories that plug into `FetchFhirClient`'s existing header hook. Composable; replaces the inline `if (server.authMode === "bearer") ...` ladder. |
| `ServerConfig` schema, `parseServerConfig(unknown)`, `serverConfigStore({ load, save })` | `apps/demo/src/config.ts:11-189` (`ServerConfig`, `parseServer`, `loadServers`, `saveServers`, `mergeWithBuiltins`, `resolveActiveServer`) | Package owns the **schema and merge-with-builtins logic**. Apps own the **storage** (the `load`/`save` adapters), the **builtin defaults**, and the **localStorage keys**. |

### 3. `hooks/`

| Add | Replaces | Notes |
| --- | --- | --- |
| `useSearchEntries<T>(type, params, opts)` | hand-rolled `bundle.entry.flatMap` in every page | Returns `T[]`. Pairs with `useSearchTotal`. |
| `useSearchTotal(type, params)` | manual `data?.total ?? resources.length` | Returns `number \| undefined`. |
| `useServerCapabilities()` | bespoke probe state machine in `apps/demo/src/routes/fhir-ui/pages/SettingsPage.tsx` | Wraps `probeServer` with `useQuery`. |
| `useResourceFields(resourceType)` | demo composes `useStructureDefinition` + `patientFieldOptions` manually | Convenience hook. |
| `RouterAdapterProvider` + `useRouterAdapter()` | `react-router-dom` imports inside `CompartmentSection.tsx`, the demo's row-click handlers, goals-tasks's `onReferenceClick` callback | App provides `{ resourceHref(type, id), navigate?(href) }`. **Decouples the package from any router.** All package components stop importing `react-router-dom`. |

### 4. `components/`

| Add | Source today | Notes |
| --- | --- | --- |
| `<CompartmentSection>` | `apps/demo/src/components/CompartmentSection.tsx` | Drop direct `react-router-dom` import; use `RouterAdapter`. |
| `<SearchRequestPreview>` | `apps/demo/src/components/SearchRequestPreview.tsx` | Pure UI wrapper around the package's existing `formatSearchRequest()`. Promote as-is. |
| `<ServerPicker>` | `apps/demo/src/components/ServerPicker.tsx` | Render-prop slots for label/empty so brands can override copy. |
| `<ReferenceLink>` | demo + goals-tasks each build their own | Pairs `formatReferenceLabel()` with `RouterAdapter`. |
| `<CapabilityBadge>` | the "Software / FHIR vR4" pill on `SettingsPage` | Small chip rendering `useServerCapabilities()` result. |

### 5. New layer: `app/` — opinionated app primitives

A fifth subpath export `@fhir-place/react-fhir/app`. Distinct from
`components/` because these are **opinionated** (assume a routing model, a
registry pattern); the rest of `components/` is composable and unopinionated.

- `ResourceListConfig<T>` type (priority params, table columns, default
  visible columns, sort options, primary/meta formatters). Source:
  `apps/demo/src/resourceListConfig.ts:27`. **Defaults stay in apps.**
- `createResourceListRegistry(map)` factory with type narrowing on
  resource type.
- `<ResourceShell>` headless layout primitive: takes a `registry` and renders
  a list/detail/edit/create scaffold. Both demo and goals-tasks should be
  able to adopt it.

### 6. Companion package: `@fhir-place/cql`

Move `apps/demo/src/routes/cql-runner/{fhirDataSource,runCql,translator}.ts`
to a new package, leaving the runner UI (`CqlRunnerPage.tsx`,
`CqlRunner.tsx`, `PatientContextPicker.tsx`, `examples.ts`,
`results/CqlResult.tsx`, `errors/ErrorPanel.tsx`) in the demo.

Rationale: extra runtime deps (`cql-execution`, `cql-exec-fhir`, the external
translator HTTP client) that most package consumers don't want. Matches ADR
0004's precedent of `@fhir-place/mcp` as a first-class but separate consumer.

## Out of scope — explicitly NOT moving

- `BUILTIN_SERVERS` (`apps/demo/src/config.ts:27`) — editorial.
- localStorage keys (`fhir-place:servers`, etc.) — app-namespaced.
- `DEFAULT_TERMINOLOGY_BASE_URL` — editorial.
- `RESOURCE_LIST_CONFIG` / `TOP_RESOURCE_TYPES` defaults — editorial.
- `mocks/` (MSW handlers, fixtures, `browser.ts`) — app concern.
- Marketing / landing pages (`App.tsx` route table).
- The Ask (Anthropic) UI feature itself — only the URL helpers it depends on
  move.
- The CQL runner UI — only the data-source/runner/translator move.
- Any opinion about state management beyond TanStack Query and React context.

## API stability impact

- All additions are **net-new exports**. No breaking changes to the existing
  four subpaths.
- `RouterAdapterProvider` is required only by the **new** components.
  Existing components (`ResourceView`, `ResourceEditor`, `ResourceSearch`,
  `ResourceTable`, `ReferencePicker`) keep working without it.
- `package.json` adds one new export entry (`./app`).
- Suggested version bump: `0.0.0` → `0.1.0` (still pre-1.0, consistent with
  ADR 0004's "stay headless / spec-driven" caveat).

## Sequencing — three additive PRs

### PR 1 — non-React additions, no consumer changes required

Adds to `structure/` and `client/`; extends `hooks/queries.ts`. Each promoted
module brings its existing test file into the package suite.

- `structure/`: `bundleEntries`, `resourceFieldOptions`, `buildSearchUrl`,
  `parseSearchUrl`, `sameOrigin`, `compartmentDefinition` + bundled
  compartment data.
- `client/`: `probeServer`, `bearerAuth`, `staticHeaders`.
- `hooks/`: `useSearchEntries`, `useSearchTotal`, `useServerCapabilities`,
  `useResourceFields`.
- Demo refactor: re-export thin shims, delete duplicated logic in
  `patientFields.ts`, `serverProbe.ts`, `ask/url.ts`, `config.ts:218`.
- goals-tasks refactor: switch to `useSearchEntries` + `bundleEntries`.

### PR 2 — component promotions (introduces `RouterAdapter`)

- `RouterAdapterProvider` + `useRouterAdapter` in `hooks/`.
- Promote `CompartmentSection`, `SearchRequestPreview`, `ServerPicker`,
  `ReferenceLink`, `CapabilityBadge`. Existing Tailwind classes preserved.
- Demo + goals-tasks each provide a `RouterAdapter` at root and delete their
  local copies.

### PR 3 — config schema + new `app/` layer

- `ServerConfig` + `parseServerConfig` + `serverConfigStore` in `client/`.
- New `app/` subpath with `ResourceListConfig`, `createResourceListRegistry`,
  `<ResourceShell>`.
- Demo migrates `resourceListConfig.ts` defaults onto the registry; route
  pages migrate to `<ResourceShell>`.

### Companion (separate cadence) — `@fhir-place/cql`

Skeleton package + move `fhirDataSource`/`runCql`/`translator`. Demo's CQL
runner UI imports from the new package.

## Verification

- `pnpm -w typecheck` clean.
- `pnpm --filter @fhir-place/react-fhir test:ci` passes coverage thresholds.
  Every promoted module brings its existing test file:
  `config.test.ts`, `serverProbe.test.ts`, `patientFields.test.ts`,
  `ask/url.test.ts`, `routes/cql-runner/*.test.ts`.
- `pnpm --filter @fhir-place/react-fhir test:integration` still green against
  the MSW fixture in `packages/react-fhir/integration/`.
- `pnpm --filter demo test` and `pnpm --filter demo e2e` green — the demo
  should look and behave identically post-refactor.
- `pnpm --filter goals-tasks test` green; expect a net file deletion in the
  app for every promotion.
- Manual smoke: run both apps, exercise patient detail pages, settings,
  search/preview, reference-click navigation. The Ask page must still
  refuse to send bearer headers cross-origin (`sameOrigin()` test still
  passes).

## Open questions for review

1. **`app/` as a fifth layer, or inside `components/`?** Recommend the new
   subpath — `<ResourceShell>` and `ResourceListConfig` are opinionated app
   primitives, the rest of `components/` is composable and unopinionated.
2. **`RouterAdapter`: ship a built-in `react-router-dom` adapter?**
   Recommend BYO with a 10-line example in the README, to keep the package
   router-agnostic (matches the "backend-agnostic" wedge stance).
3. **Naming: `useSearchEntries` vs `useResources`?** `useResources` already
   exists for batched reads-by-id. Prefer `useSearchEntries` to avoid
   confusion.
4. **Do we promote `compartment.ts` defaults into the package?** Recommend
   no — the comment at `apps/demo/src/compartment.ts:6-13` is right: which
   compartment types matter and how to label their columns is editorial.
   Keep the *component* in the package; keep *defaults* in apps.
5. **Should `bearerAuth`/`staticHeaders` accept an `AbortSignal`-aware
   refresh hook for SMART-on-FHIR / OAuth?** Probably yes eventually, but
   out of scope for PR 1 — file as a follow-up.

## Follow-ups (not in this proposal)

- SMART-on-FHIR launch flow as a separate `@fhir-place/smart` companion.
- Zod-from-`StructureDefinition` codegen (already noted in ADR 0004 and the
  `profile-codegen` spike).
- LLM/MCP-shaped consumer (`@fhir-place/mcp`) using the same package as a
  first-class consumer — orthogonal to this proposal but unblocked by the
  `client/` additions.
