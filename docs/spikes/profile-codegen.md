# Spike: profile-aware type narrowing from `StructureDefinition`

**Issue:** [#123](https://github.com/samsuffolksperoni/fhir-place/issues/123)
**ADR:** [0004 — Library Positioning and Wedge](../decisions/0004-positioning.md)
**Status:** Spike complete. Output is experimental and not part of the public API.
**Scope frozen at:** US Core 7.0 Patient + Laboratory Result Observation.

## What we built

- `packages/react-fhir/scripts/codegen-spike.ts` — a zero-dep TS script
  (Node 22 `--experimental-strip-types`) that reads a cached IG package off
  disk and emits one TS file with branded narrowed types.
- `packages/react-fhir/scripts/cache/us-core-7/package/` — a hand-trimmed
  subset of the published US Core 7.0 IG, mirroring the layout of the
  extracted `hl7.fhir.us.core` tarball. Only the two profiles in scope are
  cached.
- `packages/react-fhir/src/structure/__experimental__/us-core-7.ts` —
  generated artifact. Exports `USCorePatientProfile`,
  `USCoreLaboratoryResultObservationProfile`, their `*Required` key unions,
  and `as*()` brand helpers.
- `packages/react-fhir/src/structure/__experimental__/us-core-7.test.ts` —
  type-level tests using `// @ts-expect-error` to assert that an unprofiled
  `Patient` cannot be assigned to `USCorePatientProfile`.

The artifact is **not** re-exported from `src/structure/index.ts`. Consumers
who want to play with it must deep-import via
`@fhir-place/react-fhir/structure/__experimental__/us-core-7` (and accept
that the path may move or vanish without a semver bump).

## What worked

- **Differential walking is straightforward** when you only care about
  top-level constraints. The script reads each `ElementDefinition`, splits
  the `path` on the resource root, and groups by the first segment.
- **Branded types via `unique symbol`** give us the "you can't accidentally
  produce one" property we wanted. The brand sits behind a `declare const`
  symbol, so the only way to satisfy it is via `asUSCorePatientProfile()`.
  Casting around the brand is intentionally easy — this is a TS-only signal,
  not a security boundary.
- **`Omit<Base, Required> & { [K in Required]-?: NonNullable<Base[K]> }`**
  cleanly upgrades optional `Patient.name?` to required `name` without
  fighting `@types/fhir`. The `// @ts-expect-error` test confirms this fires.
- **No npm deps.** The script is pure `node:fs` + `node:path`, so it can
  run in CI without adding a build dependency or pulling in
  `@types/fhir-package` etc.

## What didn't (and got punted)

- **`value[x]` choice narrowing.** We record the choice list in JSDoc but
  the emitted type doesn't enforce one-of `valueQuantity | valueString | …`.
  Doing this soundly requires lifting the variants to the parent level
  (`Omit<Base, "valueQuantity" | "valueString" | …> & ({…} | {…} | …)`),
  which interacts badly with `Omit` + intersection ordering and produces
  noisy error messages. Worth a follow-up spike on its own.
- **Slicing beyond names.** We capture slice names (e.g.
  `Patient.extension:race`) but don't emit anything that lets a consumer
  destructure `patient.extension` into `{ race, ethnicity, … }`. The
  `discriminator` walk needed for sound slice resolution is a meaningful
  chunk of work.
- **Fixed values.** `Observation.category:laboratory.coding.code` has
  `fixedCode: "laboratory"`, but we don't emit a literal type at that
  position — partly because we stop narrowing at depth 1, partly because
  fixed values need a parallel pass over `differential` after the
  parent path has already been emitted.
- **Bound `ValueSet`s.** We carry `binding.strength` and `valueSet` URL
  through to the JSDoc, but `gender: Patient['gender']` is still
  `"male" | "female" | "other" | "unknown" | undefined` — i.e. exactly
  what `@types/fhir` already provides. To do better, the codegen needs
  access to expanded value sets (separate from the IG SDs).
- **Snapshot vs differential.** US Core SDs ship with both. The spike
  walks `differential` only, which is fine for a profile that constrains
  a known base. For a profile-of-a-profile, we'd need to follow
  `baseDefinition` and merge differentials top-down.
- **Deep paths.** `Patient.name.family` (must-support) is recorded in the
  emitted JSDoc but doesn't change the emitted type — `name` is still
  `HumanName[]` from `@types/fhir`. Real per-element narrowing would need
  the codegen to synthesize new types for the sub-elements (effectively
  re-implementing the `@types/fhir` codegen on top of profiled SDs).
- **Runtime validation.** `as*()` is a type-cast pass-through. There's no
  Zod parser, no fhirpath invariant evaluation, no slice discriminator
  matching. A profile-aware validator is a separate, larger track.

## Cost to expand to a full IG

Rough order-of-magnitude estimates for promoting this to a real
`npx fhir-place gen --ig hl7.fhir.us.core@7.0.0` pipeline:

| Step                                           | Estimate     | Notes                                                                                                                  |
| ---------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Pull IG tarball + cache locally                | 0.5 day      | `pacoteResolve` or hit `https://packages.fhir.org` directly. Pin via lockfile.                                         |
| Walk all ~30 US Core profiles                  | 1 day        | Existing differential walker generalises — biggest cost is sanity-checking the long tail.                              |
| Choice-type (`[x]`) narrowing                  | 2–3 days     | Discriminated unions on the parent. Tests need `expectTypeOf` style coverage so we can verify each variant separately. |
| Slicing (real, with discriminator)             | 3–5 days     | Slowest piece. Need to walk `slicing.discriminator`, follow `discriminator.path` resolution, and emit per-slice types. |
| Fixed values + literal narrowing               | 1 day        | Mostly a second pass over the differential after the type skeleton is in place.                                        |
| Bound ValueSet expansion → string-literal unions | 1–2 days     | Requires loading `ValueSet` resources from the IG. Need an opinion about `extensible` — do we union or fall back?      |
| Multi-IG support (CARIN BB / Da Vinci / mCODE) | 1 day each   | Once the pipeline exists, each new IG is a config + smoke test, assuming no profile-of-a-profile exotica.              |
| Runtime Zod parser per profile                 | 5–8 days     | Separate track, gated on the type story landing. ADR 0004 calls this out as the LLM/MCP enabler.                       |

Total realistic budget for "stable codegen for US Core 7.0, types only,
no runtime validation": **~2 weeks of focused work**.

## Blockers for promotion to a stable API

1. **Naming and import path.** `@fhir-place/react-fhir/structure/profiles/us-core-7`?
   `@fhir-place/codegen-us-core`? The library wedge in ADR 0004 keeps this
   inside `react-fhir` for now, but a full IG matrix probably wants its own
   package per IG so consumers don't pay tree-shake cost for IGs they don't use.
2. **Versioning of generated artifacts.** Each IG version (US Core 7.0 vs 8.0)
   should produce a separate artifact, and we need a story for breaking
   changes when an IG changes its must-support set.
3. **Generated-vs-handwritten boundary.** The spike's artifact lives under
   `src/structure/__experimental__/`. For a stable API, the right home is
   probably `dist/` only (i.e. generated at publish time, not checked in),
   so a contributor never has to `pnpm codegen` before TS resolves.
4. **Runtime story.** Type narrowing without a runtime parser is a sharp
   tool. Before promoting, we need at least one of: a Zod parser, a
   fhirpath invariant runner, or a clearly-documented "types only, you
   own validation" boundary.
5. **Discriminator resolution.** Real slicing (Observation.category by
   `coding.code` + `coding.system`) is a non-trivial walk and is likely
   to surface IG bugs/oddities that need a per-IG escape hatch.
6. **`@types/fhir` is the wrong base.** It's broad and doesn't expose the
   per-element types we'd want to narrow into. A future stable pipeline
   probably generates its own base R4 types from the core SDs and layers
   profiles on top, rather than `&`-intersecting with `@types/fhir`.

## How to re-run

From the repo root:

```sh
node --experimental-strip-types packages/react-fhir/scripts/codegen-spike.ts
```

The script is idempotent. Re-running with an unchanged cache produces a
byte-identical artifact.
