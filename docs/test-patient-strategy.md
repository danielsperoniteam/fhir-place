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
| SMART Health IT | Pre-loaded Synthea corpus | Unknown — needs investigation |
| Local HAPI (Docker) | Empty on startup | None; must seed manually |

Turing, Hopper, and Lamarr carry only `name`/`gender`/`birthDate`. The 32 synthetic
patients carry no clinical data at all. This means every compartment view, lab result
table, medication list, and allergy display that exercises a path other than Ada's is
dark — untested in CI and unreliable against live servers.

---

## Goals

1. **4 patients, 2 live servers** — each patient seeded on both HAPI and SMART Health IT
   with stable, known IDs so tests can make deterministic assertions.
2. **Wide resource-type coverage** — exercise every compartment type the app renders
   (Condition, Observation, MedicationRequest, AllergyIntolerance, Procedure,
   Encounter, Immunization, DiagnosticReport, CarePlan) plus Patient demographics.
3. **Field-completeness mix** — one patient with nearly every field populated, one with
   sparse data, two in between, so edge-case rendering is covered.
4. **Stability** — IDs must survive server resets. HAPI public resets weekly; the
   seeding pipeline must run after each reset.

---

## Server assessment

### SMART Health IT (`https://r4.smarthealthit.org`)

SMART Health IT pre-loads a Synthea-generated corpus on every reset. The patients have
realistic clinical histories spanning years: hundreds of Observations (vitals + labs),
dozens of Conditions, full Encounter histories, CarePlans, DiagnosticReports, and
ExplanationOfBenefits. The server is maintained by the SMART Health IT group at Boston
Children's Hospital and is designed specifically as a stable integration target.

**Investigation needed:** Query the server to identify 4 candidates matching the profiles
below. Synthea patients on this server have UUIDs as their FHIR `id`; once chosen, those
IDs appear stable across resets (the corpus is reloaded from the same generated dataset).
A one-time discovery script (see §Implementation) will surface the best candidates.

### HAPI public (`https://hapi.fhir.org/baseR4`)

HAPI's public server is a shared sandbox that resets on a rolling weekly schedule. Any
patient written to it will eventually be wiped. Stable test coverage therefore requires
a seeding pipeline that writes patients back after each reset, using `PUT` with
deterministic UUIDs so IDs remain constant across re-seeds.

**Note on HAPI vs. a private HAPI:** The project's `docker-compose.yml` already ships
a local HAPI image. A future improvement could promote that to a project-owned hosted
HAPI (e.g. fly.io or Railway free tier) to eliminate the weekly reset problem entirely.
This proposal keeps public HAPI as server 2 and handles the reset via automation, with
a note to revisit if maintenance burden grows.

---

## Patient profiles

Four patients with deliberately distinct clinical profiles stress-test different app
rendering paths.

| # | Persona | Key clinical features | Field-completeness |
|---|---|---|---|
| **P1** | **Chronic-complex** | DM2 + HTN + CKD, 5+ years of vitals, 10+ medications, 3+ encounters/year, imaging | Near-complete (name, DOB, MRN, telecom, address, photo, deceased=false) |
| **P2** | **Acute/surgical** | Single major surgery, short Encounter history, post-op meds, imaging DiagnosticReport | Moderate (name, DOB, gender; no telecom, no MRN) |
| **P3** | **Pediatric** | Child under 10, well-child encounters, growth Observations (weight/height/BMI), immunization series | Complete demographics, minimal conditions |
| **P4** | **Sparse/edge-case** | Near-empty record: name + gender only, no conditions, no meds, no encounters | Minimal — tests empty-state UI paths |

---

## Approach per server

### Server 1 — SMART Health IT (discover existing patients)

SMART Health IT's corpus is large enough that good candidates for P1–P3 almost certainly
already exist. The approach:

1. Run a one-time **discovery script** (`scripts/discover-test-patients.mjs`) that:
   - Fetches the first 200 patients from `https://r4.smarthealthit.org/Patient`
   - For each, issues parallel requests to count their Conditions, Observations,
     MedicationRequests, Encounters, Immunizations, and Procedures
   - Scores and ranks patients by resource-type breadth and total count
   - Prints the top 10 with their IDs and scores
2. A human reviews the shortlist, picks the 4 that best match the profiles above, and
   records their IDs in `apps/demo/src/mocks/test-patients.json`.
3. No ongoing automation needed — SMART's corpus is stable.

### Server 2 — HAPI public (Synthea seeding, weekly)

Because HAPI resets weekly, we need a reproducible seeding script and a scheduled job.

**Tooling — Synthea:**
[Synthea](https://github.com/synthetichealth/synthea) is an open-source patient
generator that produces standards-conformant R4 FHIR Transaction bundles. A single run
generates a patient with 10–30 resource types, realistic date ranges, and coded values
from SNOMED, LOINC, and RxNorm. Each generation run is deterministic given a fixed
`--seed` value, meaning we can reproduce identical patients on every re-seed.

**Seeding script (`scripts/seed-test-patients.mjs`):**
- Reads `apps/demo/src/mocks/test-patients.json` for the four patient UUIDs
- Checks whether each patient already exists on HAPI (`GET /Patient/<id>`)
- If missing, POSTs the corresponding Synthea Transaction bundle, then `PUT`s each
  resource with its deterministic ID to ensure stable references
- Exits 0 if all four patients are present; exits 1 if any write fails

**Weekly GitHub Actions workflow (`.github/workflows/seed-test-patients.yml`):**
```
schedule: cron '0 6 * * 1'   # Monday 06:00 UTC, after HAPI's Sunday reset
```
- Installs Node, runs the seed script against HAPI
- On failure: opens a GitHub issue tagged `test-infrastructure`
- Caches Synthea JAR between runs to keep the job under 2 minutes

---

## Implementation plan

### Phase 1 — Discovery (1–2 days)

- [ ] Write `scripts/discover-test-patients.mjs` (Node, no extra deps beyond `node-fetch`)
- [ ] Run it against SMART Health IT; review output; pick 4 patient IDs
- [ ] Create `apps/demo/src/mocks/test-patients.json`:
  ```json
  {
    "patients": [
      { "id": "...", "profile": "chronic-complex", "server": "smart" },
      { "id": "...", "profile": "acute-surgical",  "server": "smart" },
      { "id": "...", "profile": "pediatric",        "server": "smart" },
      { "id": "...", "profile": "sparse",           "server": "smart" }
    ]
  }
  ```

### Phase 2 — HAPI seeding pipeline (2–3 days)

- [ ] Download Synthea JAR; generate 4 bundles with fixed seeds matching the profiles
- [ ] Write `scripts/seed-test-patients.mjs` to write bundles to HAPI with deterministic IDs
- [ ] Add `.github/workflows/seed-test-patients.yml` with the weekly cron + failure issue
- [ ] Extend `test-patients.json` with the corresponding HAPI patient IDs

### Phase 3 — Fixture expansion (1–2 days)

- [ ] Expand `apps/demo/src/mocks/fixtures.ts`: add clinical data for Turing, Hopper, and
  Lamarr so they map to the acute, pediatric, and sparse profiles respectively
- [ ] Lamarr (sparse): keep as-is — deliberately empty to test empty-state paths
- [ ] Turing: add 10+ Observations, 3 Conditions, 2 MedicationRequests, 2 Encounters
- [ ] Hopper: add growth Observations (height/weight/BMI), 5 Immunizations, 3 Encounters

### Phase 4 — Test updates (1–2 days)

- [ ] Add a `test-patients` helper that reads `test-patients.json` and resolves the correct
  patient ID for a given profile + server
- [ ] Update `compartment.screenshot.spec.ts` and `compartment-links.screenshot.spec.ts`
  to exercise each of the 4 profiles (currently only tests Ada/P1 equivalent)
- [ ] Add `allergy-intolerance-patient-filter.spec.ts` assertions for P1 (known allergy
  count) and P4 (empty list)
- [ ] Add a new `e2e/patient-profiles.spec.ts` spec that visits each of the 4 profile
  patients and asserts resource-type tabs are present/absent as expected

---

## Risk and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| SMART Health IT corpus resets, changing patient IDs | Low | Re-run discovery script; update `test-patients.json`; pin to a version-stamped snapshot if it becomes recurring |
| HAPI public changes reset schedule | Medium | Seed workflow detects missing patients on every run and re-seeds on any Monday; can also be triggered manually |
| Synthea-generated data too voluminous (>500 resources per patient) | Low | Trim Transaction bundle to the resource types the app renders; strip ExplanationOfBenefit and DocumentReference unless explicitly needed |
| Weekly seed job fails silently | Low | Workflow opens a GitHub issue on failure; add to the same nightly alert channel as the live-site monitor |
| Deterministic UUIDs clash with other users' HAPI data | Very low | UUIDs are SHA-256–derived from `fhir-place/test/<profile>` namespace — astronomically unlikely to collide |

---

## Open questions for human decision

1. **Private HAPI vs. public HAPI** — should we provision a project-owned HAPI instance
   (e.g. fly.io free tier) to eliminate the weekly re-seed overhead? Would make tests
   simpler and more reliable at the cost of owning infra.
2. **Medplum as a second server** — the interop matrix already documents Medplum. Should
   the test patients also be seeded there, replacing HAPI as Server 2? Medplum's
   project-scoped auth means seeds survive indefinitely.
3. **P4 sparse patient** — should it be truly empty (only name), or should it have 1–2
   resources in one compartment only (to test single-item lists without empty states)?
