# `@fhir-place/react-fhir` — Implementation PR Plan (Fresh Pass)

_Date: May 1, 2026_

This plan is a fresh, implementation-first pass for **`packages/react-fhir` + `apps/demo` only**.

It incorporates prior review direction:

- no workbench roadmap coupling,
- no vague strategy-only text,
- concrete PR slices with acceptance criteria and test expectations.

## Working positioning (for README + demo)

`@fhir-place/react-fhir` is an **easy React library for building product experiences on top of any FHIR backend**.

Primary wedge:

1. Headless/backend-agnostic React-FHIR primitives.
2. Strong developer ergonomics for typed FHIR reads/search/rendering.
3. Clear escape hatches (raw client + raw resource access).

---

## PR 1 — Package identity + docs tightening

### Why
Current value is real, but package narrative is underspecified for first-time evaluators.

### Scope
- Update `packages/react-fhir/README.md` intro and section order:
  - explicit positioning sentence,
  - “who this is for / not for”,
  - backend-agnostic statement,
  - pre-1.0 expectations.
- Add `packages/react-fhir/docs/positioning.md` with:
  - competitive scope boundaries,
  - non-goals (not a hosted backend; not an EHR replacement).
- Update `apps/demo/src/App.tsx` header subtitle to mirror the wedge language.

### Acceptance criteria
- A new developer can answer in <60s: “What is this library and when should I use it?”
- README and demo headline are aligned.

### Test/check plan
- `pnpm --filter @fhir-place/react-fhir typecheck`
- `pnpm --filter @fhir-place/demo typecheck`

---

## PR 2 — Competitive matrix with evidence links

### Why
Claims need credibility artifacts tied to real code/examples.

### Scope
- Add `packages/react-fhir/docs/competitive-matrix.md` with columns:
  - Client transport,
  - React hooks,
  - component strategy,
  - backend lock-in profile,
  - typed search ergonomics,
  - escape hatches.
- Include “Where we are currently weaker” section.
- For each “supported” claim, link to package source/test/demo page.

### Acceptance criteria
- Every non-trivial claim has a repo link.
- Matrix is neutral (includes tradeoffs, not only wins).

### Test/check plan
- docs-only + link spot-check using local preview/read.

---

## PR 3 — Typed search DX slice (technical hook)

### Why
Typed search ergonomics is the most defensible implementation wedge.

### Scope
- Add a constrained typed search builder on top of existing search params:
  - initial support: token/string/date basics,
  - include/revinclude typed options for selected resource types,
  - no breaking API changes to existing `search` path.
- Add dedicated tests for:
  - serialization correctness,
  - include/revinclude behavior,
  - type-level usage examples.
- Add demo usage section/page showing practical autocomplete benefit.

### Acceptance criteria
- Existing search tests keep passing.
- New typed builder can produce identical URLs for supported cases.
- Demo includes at least one concrete before/after DX snippet.

### Test/check plan
- `pnpm --filter @fhir-place/react-fhir test:run`
- `pnpm --filter @fhir-place/react-fhir typecheck`
- `pnpm --filter @fhir-place/demo test:run`

---

## PR 4 — Interop demo matrix (backend-agnostic proof)

### Why
“Backend-agnostic” must be demonstrable, not asserted.

### Scope
- Add `apps/demo/docs/interop-matrix.md`:
  - backend targets (at least 2),
  - setup steps,
  - expected behavior per page/feature,
  - known caveats.
- Add scripts or env presets to reduce setup friction.
- Add one smoke e2e profile per target where feasible.

### Acceptance criteria
- Another engineer can run at least two backends from docs.
- Caveats are explicit and reproducible.

### Test/check plan
- `pnpm --filter @fhir-place/demo test:run`
- `pnpm --filter @fhir-place/demo e2e -- --grep smoke` (or equivalent targeted smoke run)

---

## PR 5 — Release readiness for external adoption

### Why
Pre-1.0 projects need explicit upgrade and stability expectations.

### Scope
- Add `packages/react-fhir/CHANGELOG.md` discipline section (or initialize changelog if absent).
- Add `packages/react-fhir/docs/recipes.md` for common flows:
  - patient list/search,
  - resource detail,
  - update flow with invalidation,
  - custom renderer override.
- Add “Support policy” note (pre-1.0 compatibility expectations).

### Acceptance criteria
- Users can map common use-case -> recipe -> API entry point quickly.
- Upgrade risk is clearly documented.

### Test/check plan
- `pnpm --filter @fhir-place/react-fhir build`
- `pnpm --filter @fhir-place/react-fhir test:ci`

---

## Implementation order

1. PR 1 (positioning clarity)
2. PR 2 (credibility matrix)
3. PR 3 (typed search DX)
4. PR 4 (interop proof)
5. PR 5 (adoption/readiness)

This order prioritizes **clarity -> trust -> differentiation -> proof -> adoption**.

---

## Explicit non-goals in this plan

- Building a hosted backend product.
- Re-platforming to a different UI framework.
- Adding clinical/compliance claims.
- Coupling this roadmap to workbench Phase A constraints.
