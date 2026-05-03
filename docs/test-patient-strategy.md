# Test Patient Strategy for E2E / QA Coverage

## Current state

The app runs against two primary live servers (HAPI public and SMART Health IT) plus
an optional local HAPI via Docker Compose. End-to-end tests run against the MSW mock
by default.

**What we have today:**

| Layer | Patients | Clinical data |
|---|---|---|
| MSW mock | Ada, Turing, Hopper, Lamarr + 32 synthetic | Only Ada has any (12 resources, 7 types) |
| HAPI public | Whatever the public bucket has | Unpredictable; resets weekly |
| SMART Health IT | Pre-loaded Synthea corpus | 4 candidates chosen — see §Discovery results |
| Local HAPI (Docker) | Empty on startup | None; must seed manually |

Turing, Hopper, and Lamarr carry only `name`/`gender`/`birthDate`. The 32 synthetic
patients carry no clinical data at all. This means every compartment view, lab result
table, medication list, and allergy display that exercises a path other than Ada's is
dark — untested in CI and unreliable against live servers.

---

## Goals

1. **4 well-known patients on SMART Health IT** with stable UUIDs and deep clinical data
   so tests can make deterministic assertions against a live server.
2. **Wide resource-type coverage** — exercise every compartment type the app renders
   (Condition, Observation, MedicationRequest, AllergyIntolerance, Procedure,
   Encounter, Immunization, DiagnosticReport, CarePlan) plus Patient demographics.
3. **Distinct clinical profiles** — each patient stresses a different rendering path so
   failures are easy to localise.
4. **Matching MSW expansion** — the same 4 profiles reflected in `fixtures.ts` so
   offline CI tests cover the same paths as live-server smoke tests.

---

## Server assessment

### SMART Health IT (`https://r4.smarthealthit.org`) ✓ Chosen as primary live server

Discovery run on 2026-05-03 scored 40 sampled patients across 9 resource types.
Results were excellent: the top 4 candidates have 400–578 resources each, spanning
8–9/9 compartment types, with realistic multi-decade clinical histories.

Patient IDs are stable across SMART Health IT resets — the corpus is reloaded from the
same Synthea-generated dataset each time. No ongoing seeding needed.

### HAPI public (`https://hapi.fhir.org/baseR4`) ✗ Not viable for rich test fixtures

The discovery run revealed two fatal problems:
- **Severe rate limiting** — 429s on 4 of 9 resource-type queries per patient, starting
  from patient 1. Counts were corrupted for most of the sample.
- **Sparse data** — the patients that got through were almost entirely junk: 38 of 40
  scored 0 resources. The "top 4" were all the same person with 2–10 resources total,
  breadth ≤ 2/9.

HAPI public is useful as an interop target for CRUD and search tests but not as a source
of rich, stable patient data. A second _stable_ live server with deep patient data
should be one of:

- **Local HAPI via Docker** (`docker-compose.yml` already ships it) — seed it once with
  Synthea bundles on `docker compose up`; stable for the lifetime of the container.
- **Medplum sandbox** — project-scoped, seeds survive indefinitely, already documented
  in `interop-matrix.md`. Requires a bearer token.

See §Open questions for the decision.

---

## Discovery results — SMART Health IT

Ran `scripts/discover-test-patients.mjs` against `https://r4.smarthealthit.org`
with `SAMPLE=40 TOP=4`. Full results in `apps/demo/src/mocks/test-patients.json`.

| Patient | ID | Score | Resources | Breadth | Distinctive feature |
|---|---|---|---|---|---|
| Coleman Ortiz | `5fd069dc-…` | 698 | 578 | 8/9 | 414 Observations, 39 DiagnosticReports — deep lab history |
| Hallie Hoeger | `c34852c9-…` | 618 | 498 | 8/9 | 55 MedicationRequests, 71 Encounters — polypharmacy |
| Emilee Ritchie | `9823384d-…` | 613 | 493 | 8/9 | 12 Immunizations, 321 Observations — breadth + immunization series |
| Hobert Murazik | `d4f1aab1-…` | 537 | 402 | **9/9** | Only patient with AllergyIntolerance — full compartment breadth |

Resource breakdown:

| Patient | Cond | Obs | MedReq | Enc | Proc | Imm | AI | DR | CP |
|---|---|---|---|---|---|---|---|---|---|
| Coleman Ortiz | 21 | 414 | 11 | 45 | 29 | 10 | 0 | 39 | 9 |
| Hallie Hoeger | 13 | 297 | 55 | 71 | 21 | 10 | 0 | 25 | 6 |
| Emilee Ritchie | 13 | 321 | 41 | 61 | 13 | 12 | 0 | 27 | 5 |
| Hobert Murazik | 8 | 297 | 18 | 33 | 6 | 12 | **1** | 25 | 2 |

_Cond=Condition, Obs=Observation, MedReq=MedicationRequest, Enc=Encounter,
Proc=Procedure, Imm=Immunization, AI=AllergyIntolerance, DR=DiagnosticReport, CP=CarePlan_

**Note:** AllergyIntolerance was 0 for 3 of 4 patients. Hobert Murazik is the only
candidate in the 40-patient sample with a non-zero AI count (1 resource) and is the
only patient covering all 9 compartment types. A targeted search for patients with
`AllergyIntolerance?patient=…&_summary=count > 0` would find richer AI coverage if
needed.

**Note on pediatric coverage:** None of the top-scoring patients are pediatric (DOBs
range from 1915 to 1963). A separate targeted query
(`/Patient?birthdate=gt2010-01-01&_count=20`) would be needed to find a child patient
with clinical data, if the pediatric rendering path becomes important to test.

---

## Patient profiles (mapped to discovered IDs)

| Profile | Patient | Rationale |
|---|---|---|
| **Chronic-complex** | Coleman Ortiz (`5fd069dc`) | Highest volume. 110-year history. Deep observation and diagnostic series for compartment pagination tests. |
| **Medication-heavy** | Hallie Hoeger (`c34852c9`) | 55 medications, 71 encounters. Tests medication list rendering and polypharmacy edge cases. |
| **Immunization-rich** | Emilee Ritchie (`9823384d`) | 12 immunizations + large observation set. Tests immunization table alongside dense lab data. |
| **Full-breadth** | Hobert Murazik (`d4f1aab1`) | Only 9/9 resource types including AllergyIntolerance. Critical for allergy rendering and full compartment navigation. |

---

## Implementation plan

### Phase 1 — Discovery ✅ Complete

- [x] Write `scripts/discover-test-patients.mjs`
- [x] Add `scripts/discover-test-patients.mjs` — follows pagination, surfaces 429 errors
- [x] Add `.github/workflows/discover-test-patients.yml` — `workflow_dispatch` job
- [x] Run discovery against SMART Health IT; pick 4 patient IDs
- [x] Create `apps/demo/src/mocks/test-patients.json` with chosen patients

### Phase 1.5 — Targeted searches (next)

Two follow-up runs of `discover-test-patients` against SMART Health IT, using the
new `patient_query` workflow input:

- [ ] **Allergy-rich patient** — `patient_query=_has:AllergyIntolerance:patient:_id:exists=true`
  finds patients with at least one AllergyIntolerance. Pick the highest-scoring one to
  replace or supplement the current full-breadth slot (Hobert has only 1 AI record).
- [ ] **Pediatric patient** — `patient_query=birthdate=gt2010-01-01` finds children.
  Pick a candidate with growth observations and a vaccine series; add as a 5th profile.

### Phase 2 — Server 2 (Medplum)

Decided: Medplum sandbox is server 2. Project-scoped, seeds survive indefinitely,
no weekly re-seed. Bearer-token auth is already documented in `interop-matrix.md`.

- [ ] Create a Medplum project + ClientApplication; obtain a long-lived access token
  scoped to the test-fixtures project
- [ ] Write `scripts/seed-medplum.mjs` that POSTs Synthea-derived Transaction bundles
  for each profile and captures the Medplum-assigned IDs into `test-patients.json`
- [ ] Add the access token as a GitHub repo secret (`MEDPLUM_TEST_TOKEN`); document
  local-dev setup via `.env.local`
- [ ] Update `interop-matrix.md` with the seeding step

### Phase 3 — MSW fixture expansion (1–2 days)

- [ ] Expand `apps/demo/src/mocks/fixtures.ts`: add clinical data for Turing, Hopper, Lamarr
  mapped to the chronic-complex, medication-heavy, and full-breadth profiles respectively
- [ ] Lamarr remains sparse (only name + gender) — tests empty-state compartment paths
- [ ] Turing: add 10+ Observations, 3 Conditions, 2 MedicationRequests, 2 Encounters
- [ ] Hopper: add 12 Immunizations, 5+ Observations (vitals), 3 Encounters
- [ ] If pediatric profile is added: extend a synthetic patient (or repurpose one of
  the existing ones) with growth Observations and an immunization series

### Phase 4 — Live-server test coverage (1–2 days)

The Vitest integration suite (`packages/react-fhir/integration/`) stays focused on
protocol-drift CRUD roundtrips against HAPI public — its design (random identifiers,
clean up after, never assert on pre-existing data) is incompatible with asserting on
known patient IDs. The new live-data assertions live in two new places:

**a) New `LiveRead.integration.test.ts`** (gated on `FHIR_BASE_URL` pointing at SMART):
- [ ] `describe.skipIf(!url.includes("smarthealthit"))` so the suite no-ops against HAPI
- [ ] For each chosen patient: `client.read("Patient", id)` returns 200, names match
- [ ] Compartment search returns >0 for each non-zero type in `test-patients.json.totals`
  (assert non-empty, not exact counts — Synthea regen could shift counts by ±5%)
- [ ] Hobert: AllergyIntolerance search returns ≥1
- [ ] Add an Actions matrix to `integration.yml`: run once with HAPI (existing) and
  once with `FHIR_BASE_URL=https://r4.smarthealthit.org` (new)

**b) Extend `apps/demo/e2e-live/`** (Playwright against the deployed app):
- [ ] Add a `getTestPatient(profile)` helper reading `test-patients.json`
- [ ] New `e2e-live/patient-profiles.spec.ts`: navigate to each profile patient on the
  deployed site (configured to point at SMART), assert the right compartment tabs render
- [ ] Add Hobert-specific assertion: AllergyIntolerance compartment shows ≥1 row
- [ ] Tag tests with `@smart` so they skip when the live site points elsewhere

---

## Risk and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| SMART Health IT corpus resets, changing patient IDs | Low | Re-run `discover-test-patients` workflow; update `test-patients.json` |
| AllergyIntolerance data too sparse for meaningful tests | Addressed | Phase 1.5 runs a targeted `_has:AllergyIntolerance` search to replace the full-breadth slot |
| Pediatric path untested on live server | Addressed | Phase 1.5 runs a targeted `birthdate=gt2010-01-01` search to add a 5th profile |
| HAPI public rate limits worsen | N/A | HAPI public dropped as server 2 for rich patient data |

---

## Decisions (2026-05-03)

1. **Server 2 = Medplum sandbox.** Project-scoped, seeds survive indefinitely. HAPI
   public dropped for rich-fixture purposes (severe rate limiting + sparse data
   confirmed in the discovery run). Local HAPI via Docker remains useful for ad-hoc
   developer testing but isn't part of the canonical fixture set.
2. **Run a targeted allergy search** — 1 AI record on Hobert is insufficient; a search
   for a patient with multiple allergies will replace or supplement the full-breadth
   slot.
3. **Add a pediatric profile** — bring the total to 5 patients. Targeted search by
   `birthdate=gt2010-01-01` against SMART Health IT.
