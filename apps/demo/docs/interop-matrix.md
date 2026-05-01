# Interop demo matrix — HAPI · Medplum · Aidbox

`@fhir-place/react-fhir` is "backend-agnostic" because every component derives
from `StructureDefinition`, `SearchParameter`, and `CapabilityStatement`. This
doc proves that claim by walking through running `apps/demo` against three
unrelated R4 servers, and recording the per-backend caveats so you don't have
to rediscover them.

ADR [`0004-positioning.md`](../../../docs/decisions/0004-positioning.md) commits
to demonstrable, reproducible interop. If a step in this doc breaks, please
file an issue — the matrix is meant to stay green.

## What "supported" means here

The demo exercises five flows on every backend:

| Flow | Page | Library API |
| --- | --- | --- |
| List | `/#/Patient` | `useSearch<Patient>` + `<ResourceTable>` |
| Detail | `/#/Patient/:id` | `useResource<Patient>` + `<ResourceView>` |
| Create | `/#/Patient/new` | `useCreateResource<Patient>` + `<ResourceEditor>` |
| Edit | `/#/Patient/:id/edit` | `useUpdateResource<Patient>` + `<ResourceEditor>` |
| Search | inline on `/#/Patient` | `<ResourceSearch>` driven by `CapabilityStatement` |

A backend is "supported" when all five flows render without console errors and
basic acceptance from `apps/demo/e2e-live/smoke.spec.ts` passes (or the
`@grep smoke` subset, where the backend is gated behind registration).

## Quick switch — `.env` presets

We ship three copy-and-source presets to cut setup friction:

```bash
# in apps/demo/
cp .env.example.medplum .env.local      # Medplum public sandbox
# or
cp .env.example.aidbox  .env.local      # Aidbox dev license, docker-compose
# or fall back to public HAPI:
echo 'VITE_USE_MOCK=false' >  .env.local
echo 'VITE_FHIR_BASE_URL=https://hapi.fhir.org/baseR4' >> .env.local

pnpm --filter @fhir-place/demo dev
```

`.env.local` is gitignored. Overrides on the shell win:
`VITE_FHIR_BASE_URL=… pnpm --filter @fhir-place/demo dev`.

## Backend 1 — HAPI (public)

The default and the most thoroughly exercised target. No registration.

### Setup

```bash
cd apps/demo
pnpm install
VITE_USE_MOCK=false \
VITE_FHIR_BASE_URL=https://hapi.fhir.org/baseR4 \
  pnpm dev
```

### Expected behavior

| Page | Notes |
| --- | --- |
| List | Returns the public bucket of patients. Names and counts change daily; assert structure, not values. |
| Detail | Renders narrative + compartment chips. Some patients have malformed narratives; DOMPurify scrubs them. |
| Create | Anyone can create. Your patient is visible to every other user of the public sandbox; reset weekly. |
| Edit | `If-Match` is honoured; concurrent edits surface as a 412. |
| Search | All standard `SearchParameter`s present. `_text` works. |

### Caveats / version pinning

- HAPI public is whatever HEAD HAPI deploys. The CapabilityStatement reports
  the running version under `software.version` — surface it via the demo's
  base-URL chip to debug shape drift.
- `_count` defaults higher than other servers — the demo passes `_count: 20`
  explicitly.
- HAPI returns `total` on every search; do not rely on this elsewhere.

### Smoke test

```bash
LIVE_SITE_BASE_URL=http://127.0.0.1:5173/ \
  pnpm --filter @fhir-place/demo e2e:live -- --grep smoke
```

Or against the deployed Pages site (default of `playwright.live.config.ts`):

```bash
pnpm --filter @fhir-place/demo e2e:live -- --grep smoke
```

## Backend 2 — Medplum (public sandbox)

Medplum hosts a free public sandbox at `https://api.medplum.com/fhir/R4/`. It
requires a project + a client/access token to do anything authenticated, but a
read-only token of a demo project is enough to drive list/detail/search.

### Setup

1. Sign up at <https://app.medplum.com/> (free).
2. Create a project, then create a `ClientApplication` under
   *Project → Admin → Client Applications*. Copy the client ID + secret.
3. Get an access token via the OAuth2 client-credentials flow:

   ```bash
   curl -s -X POST https://api.medplum.com/oauth2/token \
     -H 'Content-Type: application/x-www-form-urlencoded' \
     -d "grant_type=client_credentials&client_id=$MEDPLUM_CLIENT_ID&client_secret=$MEDPLUM_CLIENT_SECRET" \
     | jq -r .access_token
   ```

4. Copy `.env.example.medplum` to `.env.local`, paste the access token in
   `VITE_FHIR_BEARER_TOKEN`, and run `pnpm --filter @fhir-place/demo dev`.

> **Note:** the demo currently configures `FetchFhirClient` without auth in
> `src/main.tsx`. To consume `VITE_FHIR_BEARER_TOKEN` against Medplum/Aidbox,
> wire `getHeaders` in `main.tsx`:
>
> ```ts
> const token = import.meta.env.VITE_FHIR_BEARER_TOKEN;
> const fhirClient = new FetchFhirClient({
>   baseUrl: FHIR_BASE_URL,
>   getHeaders: token ? () => ({ Authorization: `Bearer ${token}` }) : undefined,
> });
> ```
>
> This is one line; we keep it out of the default to avoid a static-token
> footgun in the deployed Pages build. Tracked separately under the SMART
> on FHIR adapter work in the README roadmap.

### Expected behavior

| Page | Notes |
| --- | --- |
| List | Returns only patients within your Medplum project. Empty by default — seed via `Patient.create` in the Medplum web app first. |
| Detail | Renders fine. Medplum does not synthesise narratives; `<ResourceView>` falls back to structured fields, which is the intended behavior. |
| Create | Works if the access token has `Patient.write`. Default client-credentials token has admin scope on its own project. |
| Edit | Honours `If-Match`. Returns `400` (not `412`) on missing `If-Match` for some resource types — see Medplum docs. |
| Search | `CapabilityStatement.rest[].resource[].searchParam` is comprehensive. |

### Caveats

- **`Patient.identifier` shape differs from HAPI.** Medplum returns `system` +
  `value` only; HAPI fills `assigner.display`. Tests that assert on identifier
  display strings will see different output.
- `_text` search returns `OperationOutcome` with `not-supported`. The demo's
  `<ResourceSearch>` reads supported params from `CapabilityStatement` so the
  field is hidden automatically — but if you hard-code `_text=…` URLs, expect
  a 400.
- Project-scoped: every search is implicitly filtered by the project of the
  access token. You will not see HAPI's public patients here.
- API stability: pin `https://api.medplum.com/fhir/R4/` (not `R4B`). The
  `software.version` reported in `CapabilityStatement` is the Medplum server
  version (`@medplum/server` in npm).

### Smoke test

```bash
LIVE_SITE_BASE_URL=http://127.0.0.1:5173/ \
  pnpm --filter @fhir-place/demo e2e:live -- --grep "smoke|medplum"
```

`@medplum` tagged tests are skipped automatically when
`VITE_FHIR_BASE_URL` does not include `medplum`, so the same command is safe
to run against any backend.

## Backend 3 — Aidbox (Docker dev license)

Aidbox provides a free dev license for local self-host. Run it via
docker-compose; the matrix doc assumes the official quick-start.

### Setup

1. Create a free dev license at <https://aidbox.app/> and copy the
   `AIDBOX_LICENSE` value.
2. Run Aidbox locally:

   ```bash
   git clone https://github.com/Aidbox/aidbox-compose
   cd aidbox-compose
   AIDBOX_LICENSE=<your-key> docker compose up -d
   # http://localhost:8080  →  Aidbox UI
   # http://localhost:8080/fhir  →  FHIR R4 endpoint
   ```

3. Seed at least one Patient via the Aidbox UI or `curl`:

   ```bash
   curl -u root:secret -H 'Content-Type: application/fhir+json' \
     -X POST http://localhost:8080/fhir/Patient \
     -d '{"resourceType":"Patient","name":[{"family":"Smoke","given":["Test"]}]}'
   ```

4. Copy `.env.example.aidbox` to `.env.local`, set
   `VITE_FHIR_BEARER_TOKEN` to a Basic-auth equivalent (`base64(root:secret)`)
   or wire your own client credential, and run
   `pnpm --filter @fhir-place/demo dev`.

### Expected behavior

| Page | Notes |
| --- | --- |
| List | Returns only what you've seeded. `Patient` with no entries is the default. |
| Detail | Renders. Aidbox returns FHIR-format JSON when the path is `/fhir/...`; the legacy `/...` (Aidbox-format) won't work — keep the trailing `/fhir` in the base URL. |
| Create | Works. Aidbox is strict about resource shape — invalid date formats fail with a clear `OperationOutcome`. |
| Edit | `If-Match` honoured. Aidbox returns `ETag: W/"<vid>"`. |
| Search | `CapabilityStatement` enumerates the supported params; `<ResourceSearch>` adapts. |

### Caveats

- **Two API surfaces.** Aidbox's *FHIR* endpoint is `/fhir/...`; its native
  *Aidbox-format* endpoint is `/...`. Always set
  `VITE_FHIR_BASE_URL=http://localhost:8080/fhir` — the bare `:8080` returns
  Aidbox-format JSON which `FetchFhirClient` will not parse.
- Auth: the dev image ships with `root:secret` Basic auth out of the box. For
  shared/dev environments configure a `Client` resource and use a real bearer
  token.
- CORS: by default, Aidbox dev allows `*`. If you've locked it down, add
  `http://localhost:5173` to `BOX_WEB_BASE_URL` and `BOX_FHIR_CORS_ORIGINS`.
- Version pinning: the matrix has been validated against
  `aidboxone/aidbox-dev:edge` (Aidbox 2509+). Older Aidbox versions advertise
  fewer search params on `CapabilityStatement` and the search form
  consequently shows fewer fields — this is correct behavior, not a bug.

### Smoke test

```bash
LIVE_SITE_BASE_URL=http://127.0.0.1:5173/ \
  pnpm --filter @fhir-place/demo e2e:live -- --grep "smoke|aidbox"
```

The `@aidbox` tagged tests skip automatically when the demo's base URL chip
does not point at an Aidbox instance, so the suite is safe to run anywhere.

## Out of scope (intentionally)

- **Epic on FHIR / Cerner Code.** Both require a developer-account application
  per app — registration friction kills a one-shot PR. Tracked under
  README "Roadmap → Deferred".
- **Conformance / certification claims.** This matrix demonstrates the shape
  of "backend-agnostic"; it does not claim ONC certification for any path.
- **`apps/workbench` interop coverage.** The workbench operates on synthetic
  data per its Phase A constraints — see
  [`apps/workbench/README.md`](../../../apps/workbench/README.md).

## Running the suite locally

```bash
# unit + handler tests (backend-independent)
pnpm --filter @fhir-place/demo test:run

# smoke e2e — runs against whatever VITE_FHIR_BASE_URL points at,
# skips backend-specific tests automatically when their server isn't reachable.
pnpm --filter @fhir-place/demo e2e -- --grep smoke
```
