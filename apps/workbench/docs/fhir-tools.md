# Typed FHIR Tool Registry

Phase A's typed, patient-scoped, deny-by-default tool layer. Sits on top
of the read-only FHIR proxy from PR 3 ([`docs/patient-viewer.md`](./patient-viewer.md))
and is the surface PR 6's patient-summary agent will be allowed to call.

## Hard rules (enforced server-side, every call)

1. **Patient-scoped sessions.** A tool runs inside an `agent_session` row
   that carries exactly one authorized `patient_id`. Sessions are created
   explicitly via `POST /api/sessions`.
2. **Typed inputs.** Every tool has a Zod input schema with `patientId`
   required. Anything that fails the schema → `reason: "invalid_input"`.
3. **Deny-by-default patient scope.** If the request body's `patientId`
   doesn't match the session's `patient_id` → `reason:
   "unauthorized_patient"` (HTTP 403). There is no path that lets a tool
   touch a different patient.
4. **Resource allow-list.** Each tool declares the FHIR resources it
   reads. Searches go through the same allow-list-enforcing proxy as
   PR 3, so the per-resource search-param policy still applies.
5. **Result limits + timeouts.** Each tool declares `resultLimit` and
   `timeoutMs`. The runner truncates arrays past `resultLimit` and sets
   `truncated: true`. Timeouts return `reason: "timeout"` (HTTP 504).
6. **Normalized envelope.** Every call — success or failure — comes back
   in the same `ToolEnvelope` shape (see below).
7. **Logged.** Every call (input + envelope + start/complete timestamps)
   goes through a `ToolLogger`. Phase A ships an in-memory implementation;
   PR 7 swaps in DB persistence.

## The six Phase A tools

All six accept `patientId` (required, FHIR `id`); search tools also
accept `limit?: number` (1–50, default 20).

| Tool | Extra input | Reads | Notes |
| --- | --- | --- | --- |
| `getPatient` | — | `Patient/:id` | Single resource read. |
| `searchConditionsForPatient` | `clinicalStatus?` | `Condition?patient=&clinical-status=` | `clinicalStatus` is the FHIR enum (`active`, `recurrence`, `relapse`, `inactive`, `remission`, `resolved`). |
| `searchMedicationRequestsForPatient` | `status?` | `MedicationRequest?patient=&status=` | `status` is the FHIR medication-request status enum. |
| `searchAllergyIntolerancesForPatient` | — | `AllergyIntolerance?patient=` | Returns `[]` when none exist; **must NOT** be summarised as "no known allergies" — see PR 6 / `docs/safety.md`. |
| `searchEncountersForPatient` | `dateRange?` | `Encounter?patient=&date=ge…&date=le…` | `dateRange.from` / `to` are `YYYY-MM-DD`. |
| `searchObservationsForPatient` | `category?`, `dateRange?` | `Observation?patient=&category=&date=…` | `category` is the conservative allow-list `{ vital-signs, laboratory, social-history, exam, therapy, activity }`. |

## HTTP API

| Method | Path | What it does |
| --- | --- | --- |
| `POST` | `/api/sessions` | Create a session bound to `(connectionId, patientId)`. |
| `GET` | `/api/sessions` | List sessions. |
| `GET` | `/api/sessions/:sid` | Get one session. |
| `DELETE` | `/api/sessions/:sid` | Delete a session. |
| `GET` | `/api/sessions/tools` | List registered tools (name, version, description, allow-list, result limit, timeout). |
| `POST` | `/api/sessions/:sid/tools/:toolName` | Run a tool. Body is the typed input. |

`patient_id` is validated against the FHIR R4 `id` regex
`[A-Za-z0-9\-\.]{1,64}` at the session-create boundary.

## Envelope

```ts
type ToolEnvelope =
  | { ok: true,  tool, toolVersion, data, count?, truncated?, durationMs }
  | { ok: false, tool, toolVersion, error, reason, issues?, upstream?, durationMs };

type ToolErrorReason =
  | "unknown_tool"
  | "invalid_input"
  | "session_not_found"
  | "connection_not_found"
  | "unauthorized_patient"
  | "upstream_error"
  | "timeout"
  | "internal_error";
```

HTTP status mirrors `reason` so clients can branch generically while the
envelope's `reason` field stays the source of truth:

| Reason | HTTP |
| --- | --- |
| (ok) | 200 |
| `unknown_tool` | 404 |
| `invalid_input` | 400 |
| `unauthorized_patient` | 403 |
| `session_not_found` / `connection_not_found` | 404 |
| `timeout` | 504 |
| `upstream_error` / `internal_error` | 502 |

## Where things live

| File | What it is |
| --- | --- |
| `apps/workbench/db/schema.ts` (`agent_session`) | Table for the session row. |
| `apps/workbench/db/migrations/0002_agent_session.sql` | Migration. |
| `apps/workbench/server/services/session-store.ts` | Session CRUD. |
| `apps/workbench/server/agent/envelope.ts` | `ToolEnvelope` + helpers. |
| `apps/workbench/server/agent/registry.ts` | Registry, `ToolDef`, runner. |
| `apps/workbench/server/agent/tool-log.ts` | `ToolLogger` + in-memory / console implementations. |
| `apps/workbench/server/agent/tools/_shared.ts` | `dateRangeSchema`, limit clamping, bundle unwrapping. |
| `apps/workbench/server/agent/tools/*.ts` | The six tool definitions. |
| `apps/workbench/server/routes/sessions.ts` | HTTP routes. |
| `apps/workbench/src/api/sessions.ts` | Frontend client. |
| `apps/workbench/src/pages/SessionPage.tsx` | Humans-only debug runner. |

## Why this layer exists

Phase A's working constraint is *typed, patient-scoped, deny-by-default*.
The proxy from PR 3 is the FHIR allow-list. The tool registry adds:

- **Domain inputs** that rule out FHIR-syntax mistakes (e.g. agent
  emitting `clinicalStatus: "indeterminate"` → 400, not silently ignored).
- **Result-limit and timeout enforcement** the proxy doesn't (and
  shouldn't) do.
- **A patient-scope chokepoint** the proxy alone can't enforce — the
  proxy doesn't know which patient is "yours" for this run.
- **A logging hook** PR 7's audit log can subscribe to without changing
  any tool.

PR 6's agent calls **only** these tools, never the proxy directly, never
fetch directly, never the DB. The agent sees the envelope; nothing else.

## Phase A icebox

- Tool composition / chaining inside the registry — the agent does that.
- DB-backed `tool_call` persistence — PR 7.
- Per-tool authorization beyond patient scope (e.g. role-based) — Phase A
  is a single-user local research tool.
- Tools that mutate the FHIR server.
- Tools that read resources outside the proxy allow-list.
- Free-form FHIR query tools.
