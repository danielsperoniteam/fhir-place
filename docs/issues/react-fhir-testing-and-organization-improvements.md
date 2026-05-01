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

- [ ] Add coverage thresholds in `vitest.config.ts` and enforce them in CI.
- [ ] Eliminate expected-noise in tests:
  - [ ] Guard expected thrown-error tests by temporarily silencing `console.error` in targeted tests.
  - [ ] Resolve/explicitly handle MSW unhandled-request warnings in hook tests.
- [ ] Add a dedicated `test:ci` script (e.g., `vitest run --coverage`) and use that in CI.

### B) Package ergonomics for developers

- [ ] Add `packages/react-fhir/README.md` with:
  - [ ] Install + peer dependency requirements.
  - [ ] Minimal setup (`FhirClientProvider`, `QueryClientProvider`).
  - [ ] Examples for `client`, `hooks`, `components`, and `structure` entry points.
  - [ ] Versioning/support expectations for exported APIs.
- [ ] Define export-surface policy:
  - [ ] Keep stable public APIs on root export.
  - [ ] Move advanced/volatile APIs to explicit subpath exports.
  - [ ] Document deprecation policy for future API cleanup.

### C) Code organization improvements

- [ ] Add lightweight architecture notes for module boundaries:
  - [ ] `client` (transport/search params)
  - [ ] `hooks` (query integration)
  - [ ] `structure` (FHIR structure/introspection)
  - [ ] `components` (UI rendering/editing)
- [ ] Add lint/test guardrails to discourage cross-layer imports that bypass intended module boundaries.

## Acceptance criteria

- `npm run test:ci` is green with zero unexpected `stderr` noise.
- Coverage thresholds are enforced and visible in CI.
- Package README exists and is included in published artifacts.
- Export-surface policy is documented and reflected in entry points.
- New contributors can build a working example without reading internal source files.
