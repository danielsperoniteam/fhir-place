# Per-User FHIR Access on a Shared HealthLake Datastore

## Context

`fhir-place` today is a client-side library + Vite demo (`apps/demo`) that
talks to a single shared HAPI FHIR server (docker-compose). There is no auth,
no backend, no AWS. We want to:

1. Let signed-in users have their own logically-isolated FHIR data, backed by
   AWS HealthLake.
2. Provide a way for users to load data into their slice.
3. Add real authentication so each user's data is isolated.
4. Lay the infra groundwork that a future "goal app" will reuse.

An earlier draft provisioned a HealthLake datastore per user (~$30/mo each,
~30-min provisioning). We replaced that with **one shared HealthLake datastore
+ per-Patient compartment isolation enforced by a proxy Lambda**. Trade-off:
cheaper and instant onboarding, but the proxy is now the security boundary —
a bug there leaks data across users. Acceptable for non-HIPAA / dev / hobby;
real HIPAA usage would layer SMART on FHIR scopes on top.

The goal app itself is deferred to a separate plan once this infra lands.

---

## Decisions (locked in)

- **FHIR backend:** **One shared** AWS HealthLake datastore. Users isolated
  via the FHIR Patient compartment.
- **Auth:** AWS Cognito User Pool (+ Identity Pool reserved for future
  direct-to-AWS flows; not used in v1).
- **API runtime:** API Gateway (HTTP API) + raw Node.js Lambdas. No framework.
- **Goal app:** out of scope for this plan.

### Trade-offs of the shared-datastore model

- **Cheap:** one ~$30/mo datastore total, not per user.
- **Instant onboarding:** signup → create one Patient resource → done. No
  ~30-min provisioning wait.
- **Operational simplicity:** one thing to back up, monitor, version-migrate.
- **Risk:** isolation is enforced in proxy code, not infra. Any bug =
  cross-tenant leak. Mitigations in "Hardening" below.
- **Noisy neighbor:** one user's bulk import can rate-limit others. Add API
  Gateway per-user throttling.
- **Resources outside the Patient compartment** (`Practitioner`,
  `Organization`, `Medication` catalog, `ValueSet`, `StructureDefinition`,
  `CapabilityStatement`) need explicit per-type access policy in the proxy —
  see "Compartment policy" below.

---

## Architecture

```
Browser (apps/demo)
  │  Cognito JWT (Authorization: Bearer)
  ▼
API Gateway HTTP API ── Cognito JWT authorizer
  │
  ├─► Lambda: tenants-create   ── creates 1 Patient resource, stores userId→patientId
  ├─► Lambda: tenants-get      ── reads DynamoDB row
  ├─► Lambda: fhir-proxy       ── enforces compartment, signs SigV4, forwards
  ├─► Lambda: import-presign   ─► S3 import bucket (PUT)
  ├─► Lambda: import-start     ─► rewrites refs to user's Patient → StartFHIRImportJob
  ├─► Lambda: import-status    ─► HealthLake DescribeFHIRImportJob
  └─► Lambda: synthea-seed     ─► generates Synthea bundle for one patient on demand

DynamoDB tenants table:  pk=userId  → { patientId, createdAt }

ONE HealthLake datastore (us-east-1, R4)  ← all users share this
S3 import bucket  s3://<bucket>/<userId>/<jobId>/
```

No EventBridge poller, no per-tenant provisioning state machine — onboarding
is synchronous.

---

## Components to Build

### 1. Auth — Cognito User Pool

- User Pool with email sign-in, hosted UI for v1 (skip custom login screens).
- App client issues access + ID tokens.
- API Gateway uses a **JWT authorizer** pointed at the User Pool — no auth
  code in the Lambdas; `event.requestContext.authorizer.jwt.claims.sub` is
  the tenant key.
- Client-side: existing `FetchFhirClient` already supports `getHeaders()` —
  attach `Authorization: Bearer <accessToken>` from `aws-amplify/auth`.
  **No changes to `packages/react-fhir`.**

### 2. Tenant Onboarding (`infra/lambdas/tenants/`)

- `POST /tenants` (Lambda: `tenants-create`):
  1. Read `userId` from JWT claims.
  2. `GetItem` from DynamoDB; if exists, return existing `patientId`.
  3. Create a `Patient` resource in the shared HealthLake datastore via
     `POST /Patient` (SigV4 signed). Body is a minimal Patient referencing
     the Cognito email/sub.
  4. `PutItem` `{ userId, patientId, createdAt }`.
  5. Return `200` with `{ patientId }`. Synchronous, no polling.
- `GET /tenants/me` (Lambda: `tenants-get`): return DynamoDB row.
- `DELETE /tenants/me`: scrubs the user's compartment via FHIR `$everything`
  + per-resource `DELETE`, then deletes the DynamoDB row. Required for cost
  hygiene + GDPR-style deletion.

### 3. FHIR Proxy with Compartment Enforcement (`infra/lambdas/fhir/`)

This is the security boundary. **All** isolation lives here.

- API Gateway route: `ANY /fhir/{proxy+}`.
- Lambda `fhir-proxy`:
  1. Resolve `userId → patientId` from DynamoDB (cache in Lambda memory; TTL
     5 min, invalidate on tenant create/delete).
  2. Apply **compartment policy** (see next section) — may rewrite the URL,
     reject the request, or pass through.
  3. Sign with SigV4 (service `healthlake`,
     `@aws-sdk/signature-v4` + `@aws-sdk/credential-provider-node`).
  4. Forward to `https://healthlake.<region>.amazonaws.com/datastore/<id>/r4/<path>`,
     stream response back. Strip hop-by-hop headers.
  5. **Post-filter responses** for safety: every returned resource must be
     in the user's compartment, else 404 (defense in depth — the URL rewrite
     should already prevent this, but a search Bundle could be misconfigured).
- 4xx/5xx from HealthLake passes through unchanged so the existing
  `FetchFhirClient` error handling Just Works.

### Compartment policy (per resource type)

Every FHIR request is classified before forwarding. This logic is the entire
isolation guarantee — it gets unit tests, a fuzzer, and a code-review tag.

| Class | Resource types | Read | Write |
|---|---|---|---|
| **Patient-compartment** | Observation, Condition, MedicationRequest, Goal, CarePlan, Encounter, AllergyIntolerance, Procedure, DiagnosticReport, ServiceRequest, … (full list per [HL7 Patient compartment](https://www.hl7.org/fhir/compartmentdefinition-patient.html)) | Rewrite searches to `GET /Patient/{patientId}/{type}?...`; on direct read, fetch then verify `subject.reference == Patient/{patientId}` | Validate `subject`/`patient` ref points to user's Patient |
| **Patient itself** | `Patient/{id}` | Allowed only if `id == patientId` | Allowed only if `id == patientId`; block `POST /Patient` (single Patient per user, created at signup) |
| **Shared terminology** | ValueSet, CodeSystem, StructureDefinition, CapabilityStatement, OperationDefinition | Allow read | Block write (server-managed) |
| **Catalog** | Practitioner, Organization, Medication, Location | Allow read | Block write in v1 (revisit if users need to add their own providers) |
| **Everything else** | (default) | Block | Block |

Implementation lives in `infra/lambdas/fhir/compartment.ts`. Returns
`{ action: "rewrite"|"allow"|"reject", url, body }`.

### 4. Data Loading (`infra/lambdas/import/`)

Three paths:

- **Synthea-for-me (recommended onboarding UX):** New Lambda
  `synthea-seed` runs Synthea (or pulls from a pre-generated S3 fixture)
  for *one* patient, **rewrites all `Patient/...` refs in the bundle to
  the user's `patientId`**, uploads NDJSON to S3, kicks off
  `StartFHIRImportJob`. Drops a polished sample dataset into the user's
  compartment in ~minutes.
- **NDJSON upload:**
  - `POST /import/upload-url` → presigned S3 PUT URL under
    `s3://<import-bucket>/<userId>/<jobId>/`.
  - `POST /import/start` (Lambda `import-start`):
    1. Stream the NDJSON, validate every resource's `subject`/`patient` ref
       targets the user's `patientId`. Reject the job if any reference
       points elsewhere — no silent rewrite, since rewriting could mask user
       errors and merge unrelated data.
    2. `StartFHIRImportJob({ InputDataConfig: { S3Uri },
       JobOutputDataConfig, DatastoreId, DataAccessRoleArn })`.
  - `GET /import/{jobId}` → `DescribeFHIRImportJob`, scoped to jobs the
    user owns (track `jobId → userId` in DynamoDB).
- **Manual entry:** Already covered by `ResourceEditor` /
  `useCreateResource` in `packages/react-fhir`. Goes through the FHIR
  proxy and inherits compartment enforcement.

### 5. Client Wiring (`apps/demo`)

- Wrap app in a Cognito auth provider (`aws-amplify/auth`; ~50 LOC).
- Add an "Onboarding" gate before the existing routes:
  1. Not signed in → Cognito hosted UI redirect.
  2. Signed in, no `patientId` yet → call `POST /tenants` (returns
     synchronously, ~1 sec) → optionally show "Generate sample data" button
     that calls `synthea-seed`.
  3. Existing `apps/demo/src/` routes work unchanged, with `FhirClient`
     base URL set to `<api-gateway>/fhir/` and `getHeaders()` returning the
     JWT. The proxy quietly scopes everything to the user's Patient.

---

## Phased Delivery

**Phase 0 — BYO server (1–2 days, no AWS).**
Settings screen accepts a FHIR base URL + bearer token. Validates the
frontend flow before any AWS spend. Uses existing `FetchFhirClient` headers
option.

**Phase 1 — Cognito + tenants table (3–5 days).**
Cognito User Pool, DynamoDB tenants table, `tenants-create` / `tenants-get`
Lambdas (no HealthLake yet — store BYO endpoint per user, or stub
`patientId` against the local HAPI).

**Phase 2 — Shared HealthLake + compartment proxy (1–1.5 weeks).**
Stand up the one HealthLake datastore. Build `fhir-proxy` with the
compartment policy module + tests + fuzzer. CDK stack for IAM, DynamoDB,
Lambdas, API Gateway.

**Phase 3 — Import UX (3–5 days).**
S3 import bucket, presigned uploads, `StartFHIRImportJob` wiring,
`synthea-seed` Lambda, status UI.

**Phase 4 — Goal app.** Separate plan.

---

## Files to Create / Modify

- **New:** `infra/` — CDK app (TypeScript) defining:
  - `Cognito UserPool` + app client
  - `DynamoDB` tenants table (pk: `userId`) and an imports table
    (pk: `jobId` → `userId`)
  - `HealthLake CfnFHIRDatastore` (one, shared)
  - `S3` import bucket (private, lifecycle: delete after 30 days)
  - `IAM Role` for HealthLake import data access
  - 7 Lambda functions: `tenants-create`, `tenants-get`, `tenants-delete`,
    `fhir-proxy`, `import-presign`, `import-start`, `import-status`,
    `synthea-seed`
  - `API Gateway` HTTP API with Cognito JWT authorizer
  - `CloudWatch Budget` alarm at $50/mo
- **New:** `infra/lambdas/<name>/index.ts` — one file per Lambda, plain Node
  + `@aws-sdk/*` v3 clients, no framework.
- **New:** `infra/lambdas/fhir/compartment.ts` + `compartment.test.ts` —
  the policy module. **Highest-scrutiny code in the whole project.**
- **Modify:** `apps/demo/src/main.tsx` — wrap in Cognito provider, gate on
  tenant existence, build `FhirClient` from API Gateway URL + JWT.
- **Modify:** `apps/demo/package.json` — add `aws-amplify` (Auth only).
- **Modify:** `docker-compose.yml` — keep HAPI for offline dev (Phase 0
  fallback).
- **Unchanged:** `packages/react-fhir`. `FetchFhirClient({ baseUrl,
  getHeaders })` already covers everything.

---

## Hardening

- **Compartment policy fuzzer:** generate random FHIR URLs (resource type ×
  search params × ids from another user) and assert proxy never returns a
  resource outside the caller's compartment. Run in CI.
- **Per-request audit log:** CloudWatch Logs structured-log every proxy
  request with `userId`, `patientId`, FHIR verb + path, status, response
  resource ids. Critical for incident forensics on a shared datastore.
- **Rate limiting:** API Gateway usage plan keyed by Cognito sub.
- **Future SMART on FHIR (Phase 5+):** layer HealthLake's SMART on FHIR
  support so HealthLake itself enforces `patient/*.read` scopes — gives
  defense in depth, lets us claim HIPAA. Not v1.
- **Future ABAC isolation:** if HealthLake adds resource-level IAM
  conditions, switch to per-tenant STS sessions tagged with `patientId`.
  Not currently possible at the resource level, tracking AWS roadmap.

---

## Verification

- **Compartment unit tests:** `compartment.test.ts` covers every row of the
  policy table, plus adversarial cases: cross-patient ref injection in
  POST/PUT bodies, search by `_include` that could pull other patients'
  resources, `_revinclude`, `Patient/{otherId}` direct reads, `Bundle`
  transactions referencing other patients.
- **Compartment fuzzer:** randomized property test as CI job. Run for 1
  minute pre-merge, longer nightly.
- **Local:** Phase 0/1 can run fully offline against HAPI. Phase 2+ needs a
  `dev` AWS account (HealthLake has no good local emulator).
- **Integration:** `infra/test/` provisions two test users in a
  long-running dev datastore, asserts user A cannot read/write any of user
  B's resources via 30+ different request shapes. Mirrors the nightly
  `integration.yml` cadence.
- **End-to-end:** Playwright flow in `apps/demo/e2e/` — sign up via Cognito
  test pool → `POST /tenants` → click "Generate sample data" →
  `synthea-seed` completes → see Patients/Observations in the demo UI.
- **Cost guard:** CloudWatch budget alarm at $50/mo. Far less risk than the
  per-tenant model — only one datastore can ever exist.
