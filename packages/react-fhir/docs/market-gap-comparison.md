# `react-fhir` + `apps/demo` Market Gap Review (Package-Focused)

_Date: May 1, 2026_

## Scope

This revision is intentionally **not workbench-focused**.

It compares only:

- `packages/react-fhir` (the library)
- `apps/demo` (example app consuming the library)

And translates the PM memo into **package/demo roadmap suggestions**.

## Positioning statement (proposed)

`@fhir-place/react-fhir` is an **easy-to-use React library for building patient and clinician experiences/CX on top of any FHIR backend**.

In practical terms:

- Easy setup (provider + hooks)
- Spec-driven defaults (FHIR resource and datatype aware)
- Backend-agnostic access patterns
- Escape hatches for custom UI and raw FHIR access

## Current repo-grounded baseline

### Library strengths already present (`packages/react-fhir`)

- Layered architecture is clear: `client` → `structure` → `hooks` → `components`.
- Subpath exports support flexible adoption (`/client`, `/hooks`, `/structure`, `/components`).
- TanStack Query integration gives strong DX for read/search/mutation/cache flows.
- Components include practical primitives (`ResourceSearch`, `ResourceTable`, `ResourceView`, `Narrative`, form inputs).
- Unit and integration tests are already present.

### Demo strengths already present (`apps/demo`)

- Real usage examples across list/detail/create/edit/index routes.
- Mocked mode via MSW plus Playwright screenshot/e2e coverage.
- Demonstrates package ergonomics in a real app shell (routing, pages, table/search flows).

## Gap vs the PM memo (for package + demo only)

## 1) Product narrative is not explicit enough

Current code already supports “easy-to-use React library for FHIR UX,” but this message is not yet the dominant external narrative.

**Gap:** docs and demo do not center a concise wedge statement everywhere.

## 2) Competitive proof points are not assembled

The package has substantial technical surface, but there is no single “how this differs from Medplum/bonFHIR/Beda” technical matrix linked to demo evidence.

**Gap:** strong implementation exists, but external comparison artifact is missing.

## 3) Search ergonomics differentiation is partial

The client supports search today, but the memo’s “type-safe search builder” hook is not yet called out as a flagship capability.

**Gap:** differentiation opportunity exists but is not productized/documented.

## 4) Demo is good technically, but not yet benchmark-oriented

`apps/demo` proves local package use, but it is not yet structured as a “backend-agnostic benchmark/demo matrix.”

**Gap:** lacks explicit interop storyline and replay checklist.

## Suggested `TASKS.md` updates (package/demo track)

If you want to track this in tasks, use a **package/demo backlog section** (separate from workbench backlog ordering).

### PR A — Positioning Pass for Package + Demo

**Goal:** make wedge unmistakable: easy React CX on FHIR backends.

- Update package README top section with one-sentence positioning and who it is for.
- Update demo landing copy to mirror the same wedge.
- Add “what this library is / is not” to avoid overreach.

**Acceptance criteria:**

- A new visitor can understand value proposition in <60 seconds.
- README and demo copy use consistent wording.

### PR B — Honest Competitive Matrix

**Goal:** publish a technical comparison grounded in actual package behavior.

- Add a matrix doc comparing core capabilities vs Medplum/bonFHIR/Beda/fhirclient.
- Include “where we are weaker today” with links to follow-up issues.
- Link each “supported” claim to package code path or demo evidence.

**Acceptance criteria:**

- Every feature claim has a citation.
- Matrix is useful to engineers choosing a stack.

### PR C — Search DX Flagship

**Goal:** elevate typed search ergonomics as a visible differentiator.

- Add typed search-builder API design doc + minimal implementation slice.
- Add focused tests for include/revinclude/chaining subset.
- Add demo page/section showing developer UX benefit.

**Acceptance criteria:**

- Example code shows measurable autocomplete/type narrowing gains.
- Existing search behavior remains backward-compatible.

### PR D — Interop Demo Matrix

**Goal:** prove backend-agnostic claim using reproducible demo runs.

- Document demo run instructions for at least two backend targets.
- Capture per-backend caveats and expected behavior differences.
- Add checklist for replaying each scenario.

**Acceptance criteria:**

- Another engineer can run through the matrix without tribal knowledge.
- Caveats are explicit and versioned.

### PR E — Distribution-Ready Artifacts for the Package

**Goal:** improve package trust/discoverability (without clinical/compliance over-claim).

- Add a concise changelog/release discipline note for pre-1.0 users.
- Add a “recipes” section (common app patterns) sourced from demo code.
- Add a public roadmap section for next package milestones.

**Acceptance criteria:**

- Users can quickly map use case → example → API surface.
- Upgrade expectations are clear for pre-1.0 adopters.

## Suggested insertion block

```md
## Package + Demo Backlog (`@fhir-place/react-fhir`)

### PR A — Positioning Pass for Package + Demo
...

### PR B — Honest Competitive Matrix
...

### PR C — Search DX Flagship
...

### PR D — Interop Demo Matrix
...

### PR E — Distribution-Ready Artifacts for the Package
...
```

## Why this framing

- Stays fully aligned to your stated wedge: **easy React library for CX on top of FHIR backends**.
- Uses `apps/demo` as the concrete proof surface for developer experience.
- Avoids conflating package strategy with workbench Phase A constraints.
