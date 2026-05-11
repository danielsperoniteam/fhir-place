# @fhir-place/react-fhir

## 0.1.0

### Minor Changes

- e45e4ca: Add `pnpm sync:valuesets` script that regenerates `valuesets.generated.ts` from a cached `expansions.json` extracted from the official FHIR R4 `definitions.json.zip`. The generated map now ships ~500 pre-expanded ValueSets (those with ≤500 codes and a complete expansion). `coreValueSet()` consults hand-curated entries first so intentional overrides are preserved. Closes #163.
- f30b2f2: CodeInput and CodingInput now respect FHIR binding strength when deciding whether to offer a free-text escape hatch.

  Previously, any binding that was not `required` showed an "Other…" option, which incorrectly treated `extensible` bindings as open. Per the FHIR spec:

  - `required` and `extensible` are **closed** — the dropdown is normative and no free-text escape is offered.
  - `preferred` and `example` are **open** — the dropdown is provided as a convenience but users may enter any `(system, code, display)` they choose.

  The fix introduces `isOpenBinding()` in `binding.ts` and wires it through `CodeInput`, `CodingInput`, and (via context propagation) `CodeableConceptInput`. Users editing resources with `preferred` or `example` CodeableConcept fields (e.g. `Procedure.category`, `Procedure.outcome`) now see an "Other…" option that exposes the free-form three-input editor, producing a valid CodeableConcept that round-trips through FHIR servers.

- 42d29f8: Add `<CodedValue />` — a chip + hover-popover primitive for `Coding` and `CodeableConcept` values, with a registry-driven priority/classification model. Replaces the old `title`-tooltip rendering inside `defaultTypeRenderers`.

  What ships:

  - `<CodedValue value={Coding | CodeableConcept} tone? telemetry? />` exported from `@fhir-place/react-fhir`. Resting state is a bordered chip showing `text` ?? primary `display` ?? primary `code` ?? `'—'`, with a sunken pill for the primary code and an optional `+N` indicator when more codings exist. Hovering (or focusing) opens a 360px popover with TEXT, CODINGS · N, and an expander for unknown / OID / local codings.
  - Optional `tone="success" | "warn" | "danger"` opt-in (caller-supplied; never derived from the value) — adds a small dot before the label and tints the chip.
  - Definition lookup runs only for the primary coding (via the existing `useCodeLookup`) so hover does not spam terminology servers.
  - New `codedValue/registry` module exporting `FHIR_CODE_SYSTEMS`, `pickPrimary`, `partition`, `labelForSystem`, `normalizeSystem`, `isKnown`. URI normalisation strips the `|version` suffix.
  - `RendererContext` gained an optional `tone` field, propagated to `Coding` / `CodeableConcept` renderers in `defaultTypeRenderers`.

  Behaviour changes:

  - `Coding` and `CodeableConcept` cells in `<ResourceView>` / `<ResourceTable>` now render through `<CodedValue />`. The chip no longer uses a `<code>` element with a `title` attribute and the old `+N more` toggle has been replaced by the popover's hidden-codings expander. Apps that scoped CSS or tests to those exact selectors will need to migrate to the new `data-testid` selectors (`coded-value`, `coded-value-chip`, `coded-value-code`, `coded-value-popover`, `coded-value-system-pill`, `coded-value-other-toggle`).

  Closes #246.

- d2cff6b: Add `<ColumnPicker>` companion to `<ResourceTable>`: a popover-style "Columns" button with checkboxes per column, optional `localStorage` persistence via `storageKey`, keyboard accessible (Esc closes, ArrowUp/Down navigate). Closes #32.

  Expand the offline ValueSet bundle for HAPI-style servers that don't serve ValueSets: bundles now include `medicationrequest-intent`, `medicationrequest-category`, `event-status`, `procedure-category`, `allergy-intolerance-{type,category,criticality}`, `immunization-status`, and `v3-ActEncounterCode`. Bundled SDs gained matching bindings on the relevant `code` / `Coding` / `CodeableConcept` elements so `<TokenSearchField>` can render them as dropdowns without contacting the server. Closes #44.

  Add `useSearchParameter(base, code)` hook and a spec-aware `elementPathForSearchParam(param, base, spec?)` that prefers `SearchParameter.expression` over the kebab→camel naming convention, with graceful fallback when the expression contains FHIRPath function syntax (`.where(...)`, `.as(...)`, `.resolve()`). `<TokenSearchField>` now consults the canonical SearchParameter when available — covers custom IG params and core params whose code diverges from their expression.

  `codesFromValueSet` gains an optional `resolve` argument that follows `compose.include.valueSet[]` references recursively, with cycle protection (single-level, multi-level, and self-reference cases all guarded). Closes #33.

- 669e867: Extract reusable string-formatters into `src/structure/format.ts`:
  `formatHumanName`, `formatAddress`, `formatCoding`,
  `formatCodeableConcept`, `formatQuantity`, `formatPeriod`, and
  `formatReferenceLabel`. Now exported from
  `@fhir-place/react-fhir/structure`.

  `renderers.tsx` and `ReferencePicker` use these shared helpers, so a
  HumanName rendered in `<ResourceView>` and the same name shown as a
  picker label come out identical. Previously the two surfaces had
  quietly drifted (the picker's name path didn't strip prefix/suffix).

  **Breaking** (pre-1.0): the `referenceLabel` export from
  `@fhir-place/react-fhir` is renamed to `formatReferenceLabel`. The new
  function has the same signature and slightly broader fallback behaviour
  (picks up `coding[0].display` for CodeableConcept-shaped resources, and
  falls back to `.title` before `Type/id`).

- 386a114: Initial 0.1.0 release of `@fhir-place/react-fhir`.

  A React component library for building FHIR R4 apps driven by the FHIR spec itself (StructureDefinition, SearchParameter, CapabilityStatement). Minimal resource-specific code — the UI is derived from spec metadata, so it works against any FHIR REST API.

  What ships:

  **Client**

  - `FhirClient` interface + `FetchFhirClient` implementation
  - Full CRUD: `read`, `vread`, `history`, `search`, `create`, `update`, `patch` (JSON Patch), `delete`, `readReference`
  - Optimistic concurrency via `If-Match` / `If-None-Match`, conditional create via `If-None-Exist`
  - Static and dynamic header providers (for bearer tokens)
  - `FhirError` carries status, URL, and `OperationOutcome`

  **Hooks** (TanStack Query wrappers)

  - `useResource`, `useSearch`, `useCapabilities`, `useStructureDefinition`, `useReadReference`
  - `useCreateResource`, `useUpdateResource`, `useDeleteResource` — invalidate matching read queries on success

  **Components**

  - `<ResourceView>` — generic spec-driven read view with 20+ datatype renderers
  - `<ResourceEditor>` — generic spec-driven form for every R4 primitive + HumanName / Address / ContactPoint / Identifier / Reference / Period / Quantity / Coding / CodeableConcept. Array add/remove, choice types, BackboneElement recursion.
  - `<ResourceSearch>` — form driven by `CapabilityStatement.rest[].resource[].searchParam`
  - `<Narrative>` — DOMPurify-sanitised narrative rendering (the only place `dangerouslySetInnerHTML` is allowed)

  **Structure utilities**

  - `walkResource` / `walkObject` — iterate a StructureDefinition snapshot in canonical order, handling `[x]` choice types
  - `directChildren`, `findElement` — SD queries
  - `pathGet` / `pathSet` / `pathRemove` / `prune` — immutable state helpers for the editor
  - `resolveStructureDefinition` — instance read → search-by-canonical → bundled core fallback chain
  - Bundled R4 Patient and Observation StructureDefinitions (more to come) loaded via dynamic import

  Safe by default: every narrative goes through DOMPurify. ESM + `.d.ts`; subpath exports `@fhir-place/react-fhir/client`, `/hooks`, `/structure`, `/components`.

- 691575d: Add the Tier 1 `LayoutHint` schema and `<HintedDetail>` renderer.

  A `LayoutHint` is a data-only description of how a single FHIR resource
  type should be displayed in list / detail / create surfaces. Hints are
  JSON-serialisable (no closures, no JSX) so they can be shipped from a
  server later (see #223).

  New exports from `@fhir-place/react-fhir` (also available as the
  subpath `@fhir-place/react-fhir/layout-hints`):

  - Types: `LayoutHint`, `ListHint`, `DetailHint`, `DetailSection`,
    `CreateHint`, `SearchHint`, `BackboneCollectionHint`, `Tone`,
    `Tier`, `FieldPath`.
  - Registry helpers: `getLayoutHint(resourceType)`,
    `getTier(resourceType, bespokeViewKeys?)`, `tier1ResourceTypes()`,
    `LAYOUT_HINTS`.
  - Renderer: `<HintedDetail>` composes a hero row + label/value
    sections from `hint.detail`. Falls back gracefully when the hint
    has no detail block; callers should use `<ResourceView>` for Tier 0
    resources.

  Ten initial Tier 1 hints ship: Patient, Observation, Condition,
  Encounter, MedicationRequest, AllergyIntolerance, DiagnosticReport,
  Procedure, Immunization, DocumentReference. Adding a new Tier 1
  resource is a matter of dropping another entry into the registry.

  This change is additive — `<ResourceView>` and the existing
  `renderers.tsx` defaults are unchanged. The `BackboneCollection`
  slot in `DetailHint.collections` is reserved for #251 and currently
  ignored by `<HintedDetail>`.

- a9110cb: Add `useResources(type, ids)` and `useReadReferences(refs)` hooks for batch
  reads. `useResources` issues a single `{type}?_id=a,b,c` search and returns
  the resolved resources as a flat array; `useReadReferences` accepts a
  heterogeneous `Reference[]`, groups by target type, fans out one search per
  group in parallel, and returns a `Map` keyed by `Type/id`.

  Both hooks hydrate the per-resource read cache (`fhirQueryKeys.resource`)
  on success, so a later `useResource(type, id)` for any of the same ids
  resolves from cache without an extra round-trip. `useReadReferences` also
  hydrates the per-reference cache.

  Query keys are order-independent (ids sorted + deduped) so re-rendering
  with a shuffled list does not re-fetch. Empty/undefined input short-circuits
  with no network request.

  `parseBatchableRefs` is exported as a small helper that returns
  `{ [Type]: [id, ...] }` from a `Reference[]`, skipping refs that can't be
  resolved through `_id` search (contained, urn, absolute URLs, versioned).

  Closes #13.

### Patch Changes

- 55096c1: Add regression tests for `[x]` choice column resolution in `ResourceTable` covering `medication[x]` (MedicationRequest Reference variant), `onset[x]` (Condition dateTime/Period/Age), `performed[x]` (Procedure dateTime/Period), and `occurrence[x]` (Immunization dateTime/string). Fixes a test fixture bug where the `medicationReference` test resource omitted `authoredOn`, causing the missing-field dash to trigger a false assertion failure. Closes #232.
- 8cc31b3: Bundle core R4 StructureDefinitions for `Condition`, `MedicationRequest`, `AllergyIntolerance`, `Procedure`, `Encounter`, and `Immunization` so detail pages work out-of-the-box against servers that do not persist canonical SDs (e.g. public HAPI). Closes #42.

  Clip `SearchParameter.documentation` per resource in `ResourceSearch`: cross-resource params that dump a `"Multiple Resources: * [A](a.html): ... * [B](b.html): ..."` bullet list now show only the bullet matching the current resource type, falling back to the first sentence capped at 140 characters. Closes #43.

- 489abb6: Delete the duplicate `StructureDefinition` walker assertion from the live
  integration suite (closes #382, supersedes #336).

  The integration test in `packages/react-fhir/integration/FhirClient.integration.test.ts`
  was walking `StructureDefinition/Patient` over the wire and asserting on
  both server-shape (`sd.kind === "resource"`) and walker behavior
  (`directChildren()` produces expected Patient paths). The walker
  behavior is already covered deterministically by
  `packages/react-fhir/src/structure/walker.test.ts` against a vendored
  fixture, so the integration version coupled the suite to whatever the
  live `r4.smarthealthit.org` sandbox happened to return.

  Replaced with a shape-only interop probe: read the SD, assert
  `resourceType === "StructureDefinition"`. No assertions on `kind` or
  specific element paths.

  Test-only change — no runtime code modified.

- 81c4030: Expand the nightly HAPI integration suite to cover the server contracts
  that `useValueSet`, `useInfiniteSearch`, and `<ReferencePicker>` rely on
  (closes #29):

  - `ValueSet/$expand?url=administrative-gender` returns codes including
    `female` / `male` (first-step lookup in `useValueSet`)
  - `ValueSet?url=goal-status` fallback yields a usable concept list via
    `codesFromValueSet`, with a graceful skip if HAPI doesn't host the
    ValueSet at all
  - Pagination: create 25 tagged Patients, search with `_count=10`, follow
    `Bundle.link[rel=next]` until exhausted, and assert every created id is
    visited
  - `<ReferencePicker>` search-by-name: create a uniquely-named Patient,
    search by partial family, and assert the returned Bundle entries match
    what `formatReferenceLabel` expects to consume

  Test-only change — no runtime code modified. Each test is isolated via
  unique identifiers and cleans up after itself.

- db4e87c: Split `src/components/inputs.tsx` (629 lines) into a per-datatype module
  under `src/components/inputs/`. Behaviour is unchanged — the public
  exports `defaultTypeInputs`, `JsonFallbackInput`, and the type aliases
  `FhirTypeInput` / `FhirInputProps` / `InputContext` / `TypeInputs` keep
  the same identity, so consumers using `import { x } from "@fhir-place/react-fhir"`
  or `@fhir-place/react-fhir/components` see no diff.

  New layout:

  components/inputs/
  index.ts — assembles `defaultTypeInputs`; re-exports types
  types.ts — shared types + form-field CSS classes
  primitives.tsx — Text, Markdown, Boolean, Number, Date, DateTime,
  Time, Uri, Code (binding-aware)
  HumanName.tsx
  Address.tsx
  ContactPoint.tsx
  Identifier.tsx
  Reference.tsx — delegates to ReferencePicker / fallback
  Period.tsx
  Quantity.tsx
  Coding.tsx
  CodeableConcept.tsx
  JsonFallback.tsx

- 833093b: Fix ReferenceInput always rendering the fallback text inputs when a Reference element's ElementDefinition carries no `targetProfile` (e.g. bundled core SDs). The search-and-pick ReferencePicker now renders unconditionally; when `targetProfile` is absent a default set of common types (Patient, Practitioner, Organization, Encounter, Location, Device) is offered so the user still gets the search UX rather than raw Type/id text boxes.
- de8dbb6: Expand typed search builder coverage for all v0 date and number prefixes plus seeded include/revinclude paths.

All notable changes to this package are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semver.
