# End-to-End Tests — fhir-place demo

Playwright 1.56 tests for the demo app. All tests run against the local dev
server backed by the in-browser MSW mock, so no live FHIR server is needed.

## Suites

| File | What it covers |
|------|---------------|
| `smoke.spec.ts` | Patient list renders against HAPI / Medplum / Aidbox backends; backend-specific tests skip gracefully when the target URL isn't set |
| `patient.screenshot.spec.ts` | Patient list filtering, detail view navigation, mobile viewport |
| `patient-table.screenshot.spec.ts` | Table layout: column headers, data rows, sort indicators |
| `patient-row-counts.screenshot.spec.ts` | Row count badge reflects the current search result |
| `patient-field-picker.spec.ts` | Column picker opens, fields can be toggled, table re-renders |
| `patient-url-sync.screenshot.spec.ts` | Search state survives a page reload via URL hash |
| `pagination.screenshot.spec.ts` | Next/prev page controls; last page disables Next |
| `responsive-table.screenshot.spec.ts` | Table collapses to a card layout on narrow viewports |
| `compartment.screenshot.spec.ts` | Patient detail shows compartment resource tables |
| `compartment-links.screenshot.spec.ts` | Compartment chip navigation lands on the right filtered view |
| `crud.screenshot.spec.ts` | Search → create → edit → delete full lifecycle |
| `resource-create.screenshot.spec.ts` | ResourceEditor form fields render; submit creates a resource |
| `delete-error.spec.ts` | Delete failure shows an inline error (not an uncaught exception) |
| `missing-resource.spec.ts` | Navigating to a missing resource ID shows a not-found state |
| `allergy-intolerance-patient-filter.spec.ts` | AllergyIntolerance list is filtered to the current patient compartment |
| `docs.spec.ts` | `/docs` redirects to default doc, sidebar TOC renders, slug deep-links work, unknown slug shows not-found, sidebar Docs button navigates |

### Live-site monitor (`../e2e-live/`)

A separate suite in `apps/demo/e2e-live/` runs nightly against the deployed
GitHub Pages demo (real HAPI server). Those tests are intentionally minimal
and data-shape-tolerant — they assert structure and behavior, not literal
values. Failures auto-file a GitHub issue; see
`.github/workflows/live-site-monitor.yml`.

## Running tests

```bash
# All e2e tests (chromium, no screenshots)
pnpm --filter @fhir-place/demo e2e

# Screenshot-comparison project only
pnpm --filter @fhir-place/demo e2e:screenshot

# Single file
pnpm --filter @fhir-place/demo exec playwright test e2e/smoke.spec.ts

# Headed (see the browser)
pnpm --filter @fhir-place/demo exec playwright test --headed

# Live-site smoke suite (needs a deployed URL)
pnpm --filter @fhir-place/demo e2e:live
```

The dev server starts automatically via `playwright.config.ts` `webServer`.
You do not need to run `pnpm dev` separately.

## Updating screenshot baselines

Screenshot specs use a fixtures-driven local server. When a visual change is
intentional:

```bash
pnpm --filter @fhir-place/demo exec playwright test --project=screenshots --update-snapshots
```

Commit the updated PNGs in `screenshots/`. Always review the diff before
committing — a regression looks identical to an intentional change in the
command output.

## Keeping tests current

**Rule:** every user-facing change that touches a page, component, or data
flow needs a corresponding test update in the same PR.

| Change type | Action |
|-------------|--------|
| New page or route | Add a new spec file; name it after the primary behavior, e.g. `my-feature.spec.ts` |
| New UI component on existing page | Add assertions to the relevant existing spec |
| Visual/layout change | Re-run `--update-snapshots`, review, and commit updated PNGs |
| Behavior removed | Delete the assertions that tested it; keep the file if other tests remain |
| New backend interop flow | Add a tagged test to `smoke.spec.ts` following the `@medplum` / `@aidbox` pattern |
| Bug fixed | Add a regression test asserting the broken state no longer appears |

### What makes a good e2e test here

- Assert **behavior and structure**, not exact text values that could change
  with mock data updates.
- Use `data-testid` attributes for stable selectors; avoid CSS class names and
  positional selectors.
- Keep each test independent — don't rely on state left by a prior test.
- If a test needs the live network, gate it with a `test.skip` + reachability
  check (see `smoke.spec.ts` for the pattern).

## Configuration

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Local dev-server suite (chromium + screenshots) |
| `playwright.live.config.ts` | Live-site monitor config (`e2e-live/`) |

Key settings in `playwright.config.ts`:
- `baseURL`: `http://localhost:5173`
- Screenshots project: viewport fixed at 1280×800
- Screenshot output directory: `../../screenshots/`
- No retries in local runs; CI uses 1 retry

### Backend selection — why we pin `VITE_USE_MOCK=true`

`playwright.config.ts` launches the dev server with `VITE_USE_MOCK=true pnpm dev`,
not bare `pnpm dev`. Reasoning:

The demo's `apps/demo/src/config.ts` resolves the active FHIR server in two
branches: when `USE_MOCK` is true the active server is hard-coded to the
in-browser MSW worker; when it is false the resolver falls through to
`localStorage` and then to the first built-in. After #338 the first built-in
became SMART Health IT, so any leakage of a developer's prior server
selection (or an unset `USE_MOCK`) would point the test run at
`https://r4.smarthealthit.org`. The MSW fixtures the specs assert against
(Ada Lovelace, her compartment counts, the test CapabilityStatement) do not
exist on SMART, and the affected specs 404. See issue #416 for the full
trace.

Pinning the env var is enough on its own. The `if (USE_MOCK)` branch in
`config.ts` ignores `localStorage` entirely, so a stale
`fhir-place:active-server` cannot reach into the test session.

If you change the demo's default backend or the resolver order, re-read this
section before tweaking the playwright `webServer.command` — silently
switching the test backend is exactly the failure mode this comment exists
to prevent.

The live-site monitor in `apps/demo/e2e-live/` deliberately runs against the
deployed demo (real backend) and is governed by `playwright.live.config.ts`.
Do not import that suite into the local config or add a `webServer` to the
live config.
