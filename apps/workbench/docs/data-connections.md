# Data Connections

A `data_connection` points the workbench at a FHIR server it can read from.
Phase A is read-only and synthetic-only.

## Phase A allow-list

| Field | Allowed values |
| --- | --- |
| `kind` | `fhir_clinical` |
| `authType` | `none`, `bearer` |

Anything else (OMOP, claims, wearable, SMART on FHIR, OAuth client_credentials,
mTLS) is rejected at the validation boundary in `server/schemas.ts`. There
is no DB-only path for unsupported values.

## Where things live

| File | What it is |
| --- | --- |
| `apps/workbench/db/schema.ts` | Drizzle table `data_connection` |
| `apps/workbench/db/migrations/0001_data_connection.sql` | Initial migration |
| `apps/workbench/server/schemas.ts` | Zod input schemas (Phase A allow-list) |
| `apps/workbench/server/services/fhir-connection.ts` | `/metadata` probe |
| `apps/workbench/server/services/connection-store.ts` | CRUD + capability persistence |
| `apps/workbench/server/routes/connections.ts` | Hono routes |
| `apps/workbench/src/api/connections.ts` | Frontend API client |
| `apps/workbench/src/pages/Connections*Page.tsx` | UI |

## HTTP API

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/api/connections` | List connections (auth tokens redacted) |
| `POST` | `/api/connections` | Create a connection |
| `GET` | `/api/connections/:id` | Get one connection |
| `POST` | `/api/connections/:id/test` | Fetch `/metadata`, persist the result |
| `DELETE` | `/api/connections/:id` | Remove a connection |

Auth tokens **never** leave the server. The frontend only sees
`hasAuthToken: true | false` on each row.

The `test` endpoint:

1. Loads the connection by id.
2. Calls `${baseUrl}/metadata` with `Accept: application/fhir+json` and (if
   bearer) an `Authorization` header.
3. Verifies the response is a `CapabilityStatement`.
4. Persists `lastCapabilityAt`, `lastCapabilityStatus`,
   `lastCapabilityFhirVersion`, `lastCapabilitySoftware`, and
   `lastCapabilityJson` on success; persists `lastCapabilityError` on
   failure.

## Local development

The frontend (Vite) and the API (Hono) run as two processes. From the repo
root, in two terminals:

```bash
pnpm --filter @fhir-place/workbench server
pnpm --filter @fhir-place/workbench dev
```

Vite dev (port 5174) proxies `/api` to the Hono server (port 5175). Override
the API port with `WORKBENCH_PORT`.

```bash
WORKBENCH_PORT=6000 pnpm --filter @fhir-place/workbench server
WORKBENCH_PORT=6000 pnpm --filter @fhir-place/workbench dev
```

The SQLite DB file is `apps/workbench/workbench.sqlite` by default. Override
with `WORKBENCH_DB_URL=/some/path.sqlite`.

Run migrations (idempotent) before the first server start:

```bash
pnpm --filter @fhir-place/workbench db:setup
```

## What is **not** supported (Phase A icebox)

- SMART on FHIR auth (`authType: "smart"` is rejected)
- OAuth client_credentials, mTLS, custom auth headers
- BigQuery, OMOP, claims, wearable connection types
- Connection-level scoping by patient compartment (that lives at the tool
  layer in PR 4, not here)
- Encryption at rest for stored bearer tokens — Phase A is synthetic-only
  single-user local; document it, don't pretend to solve it
