# Issue: Raise `@fhir-place/react-fhir` quality bar for testing signal and package ergonomics

## Summary

`@fhir-place/react-fhir` already has broad unit/integration-style test coverage across clients, hooks, structure, and components. The next quality step is to improve **developer signal-to-noise** and **package usability**, so contributors and adopters can trust failures quickly and understand how to use the package without source-diving.

## Why this matters

- Test runs currently pass, but expected error-path tests emit noisy `stderr`, which can hide real regressions in CI logs.
- Coverage is collected, but there is no enforced threshold, so quality can drift silently.
- The package manifest advertises a README in published files, but there is no package README to guide consumers.
- Public exports are broad and not tiered by stability, which can make long-term API ergonomics harder.

## Findings from QA review

1. **Baseline is strong but noisy**
   - `npm run test:run` passes (262 tests), but includes noisy `stderr` output from expected provider-error tests and an MSW unhandled-request warning.
2. **Coverage collection exists without quality gates**
   - Vitest coverage is configured with include/exclude/reporters, but there are no threshold gates (`lines`, `branches`, etc.).
3. **Published package metadata references missing docs**
   - `package.json` includes `README.md` in `files`, but the package directory does not currently contain one.
4. **API surface discoverability can improve**
   - Root `src/index.ts` re-exports multiple domains directly; an explicit stability policy for root vs subpath exports would reduce accidental coupling.

## Proposed improvements

### A) Testing quality and CI signal

- [x] Add coverage thresholds in `vitest.config.ts` and enforce them in CI.
  - Thresholds: lines 80, statements 80, functions 75, branches 80 (current
    aggregate sits ~85/84/81/84 — gives a small regression-margin without
    masking real coverage drops).
- [x] Eliminate expected-noise in tests:
  - [x] Silence `console.error` around the "throws when used without provider"
    test (React reports the thrown render error otherwise).
  - [x] Replace MSW's noisy unhandled-request fallback in the cache-hydration
    test with an explicit per-id read handler that counts hits, plus
    `staleTime` so the cached read isn't refetched in the background. The
    test now asserts `readCalls === 0` instead of relying on stderr.
- [x] Add a dedicated `test:ci` script (`vitest run --coverage`) and use it in CI.

### B) Package ergonomics for developers

- [x] Add `packages/react-fhir/README.md` with:
  - [x] Install + peer dependency requirements.
  - [x] Minimal setup (`FhirClientProvider`, `QueryClientProvider`).
  - [x] Examples for `client`, `hooks`, `components`, and `structure` entry points.
  - [x] Versioning/support expectations for exported APIs.
- [x] Define export-surface policy:
  - [x] Document the four subpath exports (`/client`, `/hooks`, `/structure`, `/components`)
    plus root as the **public API**; deeper relative imports are internal.
  - [x] Note pre-1.0 versioning expectations (minor bumps may break).
  - [ ] Formal deprecation policy for post-1.0 — deferred until a real
    deprecation lands; not worth predicting the shape now.

### C) Code organization improvements

- [x] Add lightweight architecture notes for module boundaries (in the package
  README under "Architecture: layer boundaries"):
  - [x] `client` (transport/search params)
  - [x] `hooks` (query integration)
  - [x] `structure` (FHIR structure/introspection)
  - [x] `components` (UI rendering/editing)
- [ ] **Deferred:** lint guardrails for cross-layer imports.
  - At the current package size (4 layers, one published package, one repo)
    the boundaries are easy to see and easy to enforce in review. Adding
    `eslint-plugin-import` with `no-restricted-paths` rules is real
    configuration surface that needs ongoing tuning, and I'd rather wait
    until the boundary is actually being violated to justify it. Track as a
    follow-up if a regression appears.

## Acceptance criteria

- [x] `pnpm test:ci` is green with zero unexpected `stderr` noise.
- [x] Coverage thresholds are enforced and visible in CI (`vitest.config.ts`
      thresholds + a CI step running `pnpm --filter @fhir-place/react-fhir
      test:ci`).
- [x] Package README exists and is included in published artifacts (already
      listed in `package.json` `files`).
- [x] Export-surface policy is documented and reflected in entry points.
- [x] New contributors can build a working example without reading internal
      source files (README "Minimal setup" + per-layer examples).
