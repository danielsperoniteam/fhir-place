# Issue Templates: Strategy -> Implementation (`@fhir-place/react-fhir`)

Use these six issues to convert strategy into implementation PRs.

---

## Issue 1 — Typed Search Builder v0 (core API)

**Title**
`feat(search): add typed search builder v0 for Patient/Observation`

**Problem**
Current search support works, but typed search ergonomics are not a standout differentiator.

**Scope**
- Add `createSearchBuilder` (or equivalent) in `packages/react-fhir/src/client/`.
- Support initial operators for `string`, `token`, `date`.
- Support `_include` and `_revinclude` for an initial allowlist:
  - `Observation:subject`
  - `Patient:general-practitioner`
- Keep existing `search(resourceType, params)` API intact.

**Out of scope**
- Full coverage for all resource types/search params.
- Breaking changes to existing search API.

**Acceptance criteria**
- Builder emits identical query strings for supported cases vs existing serializer.
- Existing search tests pass unchanged.
- New tests cover operator serialization + include/revinclude.

**Test plan**
- `pnpm --filter @fhir-place/react-fhir test:run`
- `pnpm --filter @fhir-place/react-fhir typecheck`

---

## Issue 2 — Typed Search Builder v0.1 (hook + demo usage)

**Title**
`feat(hooks/demo): expose typed search builder via hooks and demo example`

**Problem**
The builder must be visible in real React usage to prove DX value.

**Scope**
- Add hook integration path in `packages/react-fhir/src/hooks/queries.ts`.
- Add demo usage example in `apps/demo` (new page or section in Patient index).
- Show at least one chained include example.

**Out of scope**
- Advanced query planner and auto-optimization.

**Acceptance criteria**
- Demo compiles and runs with typed builder example.
- Example shows autocomplete/narrowing in code sample.
- Query output remains backward compatible.

**Test plan**
- `pnpm --filter @fhir-place/react-fhir test:run`
- `pnpm --filter @fhir-place/demo test:run`
- `pnpm --filter @fhir-place/demo typecheck`

---

## Issue 3 — Profile-aware codegen spike (US Core seed)

**Title**
`spike(codegen): profile-aware type narrowing from StructureDefinition (US Core seed)`

**Problem**
Generic FHIR typings are broad; profile-aware narrowing is needed for stronger DX.

**Scope**
- Add a spike in `packages/react-fhir/src/structure/` utilities for profile-derived narrowing.
- Start with one profile family (US Core Patient/Observation seed).
- Produce generated artifacts in a clearly marked experimental location.

**Out of scope**
- Full IG pipeline and full profile coverage.
- API stability guarantees for generated artifacts.

**Acceptance criteria**
- Spike can generate at least one profile-specific type artifact.
- Include docs that explain limitations and next expansion step.

**Test plan**
- `pnpm --filter @fhir-place/react-fhir typecheck`
- `pnpm --filter @fhir-place/react-fhir test:run`

---

## Issue 4 — Zod schema generation from StructureDefinition (experimental)

**Title**
`feat(validation): experimental zod schema generation from StructureDefinition`

**Problem**
Structured-output and validation ergonomics are strategic, but need concrete package primitives.

**Scope**
- Add optional generator/util to create Zod schemas from a limited subset of `StructureDefinition`.
- Start with a small target set (e.g., Patient + Observation core fields).
- Expose as experimental API (clearly documented).

**Out of scope**
- Complete parity with all FHIR constraints/invariants.
- Runtime validator replacement for server-side conformance tools.

**Acceptance criteria**
- Generated schema validates happy-path fixtures for target resources.
- Known unsupported constraints are documented.

**Test plan**
- `pnpm --filter @fhir-place/react-fhir test:run`
- `pnpm --filter @fhir-place/react-fhir typecheck`

---

## Issue 5 — Interop demo matrix (2+ backends)

**Title**
`docs/demo: add reproducible interop matrix for 2+ FHIR backends`

**Problem**
“Backend-agnostic” needs reproducible proof.

**Scope**
- Add `apps/demo/docs/interop-matrix.md`.
- Cover at least two targets (for example: HAPI + Medplum/Aidbox sandbox).
- Document setup, env vars, expected behavior by page, known differences.
- Add/update one smoke e2e path per target where feasible.

**Out of scope**
- Full certification/conformance claims.

**Acceptance criteria**
- Another engineer can reproduce both targets using only docs.
- Matrix explicitly calls out caveats, unsupported behaviors, and fallbacks.

**Test plan**
- `pnpm --filter @fhir-place/demo test:run`
- `pnpm --filter @fhir-place/demo e2e -- --grep smoke`

---

## Issue 6 — README positioning + honest comparison + roadmap links

**Title**
`docs(readme): tighten positioning, add honest comparison table, link roadmap issues`

**Problem**
Implementation work needs a single external-facing narrative and trust surface.

**Scope**
- Update `packages/react-fhir/README.md` with:
  - one-line wedge statement,
  - “who this is for / not for”,
  - comparison table vs alternatives,
  - “where we are weaker today”,
  - links to the five implementation issues above.
- Update demo header copy in `apps/demo/src/App.tsx` for consistency.

**Out of scope**
- Marketing claims unsupported by code/tests.

**Acceptance criteria**
- README claims are backed by links to code, tests, or demo pages.
- No contradictory positioning language between README and demo.

**Test plan**
- `pnpm --filter @fhir-place/react-fhir typecheck`
- `pnpm --filter @fhir-place/demo typecheck`

---

## Recommended execution order

1. Issue 6 (positioning + comparison anchor)
2. Issue 1 (typed builder core)
3. Issue 2 (typed builder in hooks/demo)
4. Issue 5 (interop matrix proof)
5. Issue 3 (profile-aware codegen spike)
6. Issue 4 (zod generation experimental)

This sequencing drives fast external clarity, then tangible technical differentiation.
