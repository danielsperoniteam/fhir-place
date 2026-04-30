# Patient Search and Resource Viewer

The workbench's user-facing read path. The FHIR connection abstraction
(PR 2, [`docs/data-connections.md`](./data-connections.md)) gives us *a*
FHIR server. This doc covers how the user finds a synthetic patient and
inspects their core resources.

## URL shape

The selected patient lives in the URL. Refresh-safe, shareable, and means
no extra React context is needed:

```
/connections/:cid/patients                            — search & list
/connections/:cid/patients/:pid                       — patient detail + compartment
/connections/:cid/patients/:pid/:resourceType/:id     — raw JSON viewer
```

`:cid` is a `data_connection.id`. `:pid` is the FHIR `Patient.id` on the
upstream server. `:resourceType` and `:id` are validated server-side
against the Phase A allow-list (see below).

## Read path

```
Browser ──GET /api/connections/:cid/fhir/<...>──► Hono
                                                   │
                                                   ├── load connection (incl. authToken)
                                                   ├── validate resourceType in allow-list
                                                   ├── filter search params via allow-list
                                                   └──GET <baseUrl>/<...>──► Upstream FHIR
```

The auth token never reaches the browser. The frontend never opens the
upstream FHIR server directly.

## Phase A allow-lists

Both lists live in [`apps/workbench/server/schemas.ts`](../apps/workbench/server/schemas.ts).

### Resource types

```
Patient · Condition · MedicationRequest · AllergyIntolerance · Encounter · Observation
```

Anything else (e.g. `Procedure`, `DocumentReference`, `Practitioner`) is a
400 at the proxy boundary. There is no path that lets the browser — or, in
PR 6, the agent — probe arbitrary FHIR resources.

### Search parameters (per resource)

| Resource | Allowed parameters |
| --- | --- |
| `Patient` | `name`, `family`, `given`, `identifier`, `birthdate`, `gender`, `_id`, `_count`, `_sort` |
| `Condition` | `patient`, `clinical-status`, `category`, `code`, `_id`, `_count`, `_sort` |
| `MedicationRequest` | `patient`, `status`, `intent`, `_id`, `_count`, `_sort` |
| `AllergyIntolerance` | `patient`, `clinical-status`, `_id`, `_count`, `_sort` |
| `Encounter` | `patient`, `status`, `date`, `_id`, `_count`, `_sort` |
| `Observation` | `patient`, `category`, `code`, `date`, `status`, `_id`, `_count`, `_sort` |

Anything else — including `_include`, `_revinclude`, `_has`, `_filter`,
`_elements`, `_summary`, `_format` — is silently dropped before
forwarding upstream so a caller cannot expand the response shape, change
content negotiation, or chain into resources outside the allow-list.

`_count` is clamped to `MAX_COUNT = 100` and defaults to `20`.

## HTTP API

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/api/connections/:cid/fhir/:resourceType` | Forwarded search (allow-listed params only) |
| `GET` | `/api/connections/:cid/fhir/:resourceType/:id` | Single resource read |

Phase A is read-only. `POST`/`PUT`/`PATCH`/`DELETE` on this prefix get a
404 by routing-table omission (Hono never registers them).

## What the user sees

- **`PatientsPage`** — name / identifier / birthdate / gender form.
  Search params live in the URL so the search is shareable and
  refresh-safe. Clear wipes both the form and the URL.
- **`PatientPage`** — demographics panel + six compartment cards
  (`Condition`, `MedicationRequest`, `AllergyIntolerance`, `Encounter`,
  `Observation`). Each card lists up to 8 entries with a per-resource
  one-line summary; "+ N more" overflow.
- **`ResourcePage`** — raw FHIR JSON for one resource, shown verbatim from
  the upstream. The synthetic-only banner stays at the top of every page.

## What is **not** here (Phase A icebox)

- Free-text search across resource bodies.
- Arbitrary FHIR query generation (no path lets a user or the agent type a
  raw search-string and have it forwarded as-is).
- DocumentReference text extraction.
- Anything that mutates the upstream FHIR server.
- SMART on FHIR launch from the patient context — Phase A is server-token
  only.
- Compartment-aware "patient resources" via FHIR `$everything` — we only
  use plain `?patient=Patient/:id` searches because they're trivially
  bounded by the allow-list.
