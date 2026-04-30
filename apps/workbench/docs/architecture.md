# Architecture

Component-level description of the workbench as it stands after PR 6.
PRs 7 / 8 / 9 are tracked but not yet implemented; their planned
contracts are noted under [Planned](#planned) so the existing code
makes sense in context.

## One-line summary

A local-first single-user research workbench that runs an LLM
patient-summary agent against synthetic FHIR data, where every supported
claim cites a real FHIR resource and the agent can only call typed,
patient-scoped tools that the workbench code (not the model) defines.

## Process model

Two processes:

- **Vite dev server** on `:5174` — serves the React frontend
  (`apps/workbench/src/`).
- **Hono API** on `:5175` — the only piece that talks to SQLite, the
  upstream FHIR server, and Anthropic. Started by `tsx server/index.ts`
  in dev (`pnpm --filter @fhir-place/workbench server`) or
  `pnpm --filter @fhir-place/workbench server:start` for one-shot.

Vite proxies `/api` to the Hono server. Override the API port with
`WORKBENCH_PORT`.

## Components shipped through PR 6

| Component | Where it lives | Shipped in |
| --- | --- | --- |
| UI shell + synthetic-only banner | `src/components/SyntheticOnlyBanner.tsx`, `src/App.tsx` | PR 1 |
| SQLite + Drizzle | `db/schema.ts`, `db/migrations/`, `db/client.ts`, `scripts/db-setup.ts` | PR 1 (skeleton), PR 2 (`data_connection`), PR 4 (`agent_session`) |
| FHIR DataConnection | `server/services/connection-store.ts`, `server/services/fhir-connection.ts`, `server/routes/connections.ts`, `src/pages/Connections*Page.tsx` | PR 2 |
| Read-only FHIR proxy | `server/services/fhir-proxy.ts`, `server/routes/fhir.ts` | PR 3 |
| Patient search + viewer | `src/pages/PatientsPage.tsx`, `src/pages/PatientPage.tsx`, `src/pages/ResourcePage.tsx` | PR 3 |
| Typed tool registry | `server/agent/registry.ts`, `server/agent/envelope.ts`, `server/agent/tools/*.ts`, `server/agent/tool-log.ts` | PR 4 |
| Agent sessions | `server/services/session-store.ts`, `server/routes/sessions.ts` | PR 4 |
| `AgentAnswer` schema + renderer | `src/agent/answer-schema.ts`, `src/agent/AgentAnswerRenderer.tsx`, `src/agent/EvidenceChip.tsx`, `src/agent/answer-extractors.ts`, `src/agent/fixtures.ts` | PR 5 |
| Patient-summary agent loop | `server/agent/orchestrator.ts`, `server/agent/prompts.ts`, `server/agent/anthropic-tools.ts`, `server/agent/model-config.ts`, `server/routes/answers.ts` | PR 6 |

## Data flow

```
                                              ┌──────────────────────┐
                                              │   Anthropic API      │
                                              │   (sonnet-4-6)       │
                                              └──────────▲───────────┘
                                                         │ messages.create
                                                         │ + tools list
┌──────────────────────────┐    /api      ┌──────────────┴───────────┐
│ React UI (Vite :5174)    │ ───────────▶ │   Hono API (:5175)       │
│  - HomePage              │   proxy      │                          │
│  - Connections*Page      │              │  routes/connections.ts   │
│  - PatientsPage          │              │  routes/fhir.ts          │ ─┐
│  - PatientPage           │              │  routes/sessions.ts      │ │ FHIR
│  - ResourcePage          │              │  routes/answers.ts       │ │ JSON
│  - SessionPage           │              │                          │ │ over
│  - AnswerPreviewPage     │              │  agent/orchestrator.ts   │ │ HTTPS
│  - AgentAnswerRenderer   │              │  agent/registry.ts       │ │
└──────────────────────────┘              │  agent/tools/*.ts        │ │
                                          │  services/fhir-proxy.ts  │ │
                                          │  services/connection-…   │ │
                                          │  services/session-store  │ │
                                          │                          │ ▼
                                          │  ┌────────────────────┐  │   ┌───────────────┐
                                          │  │ better-sqlite3     │  │   │ Upstream FHIR │
                                          │  │ workbench.sqlite   │  │   │ (HAPI sandbox │
                                          │  │ (data_connection,  │  │   │  or local R4) │
                                          │  │  agent_session)    │  │   └───────────────┘
                                          │  └────────────────────┘  │
                                          └──────────────────────────┘
```

The browser **never** opens the upstream FHIR server directly. Auth
tokens (none on the public sandbox; `bearer` on a private server) live
in SQLite and only the API process reads them.

## Boundary between frontend and node-only code

The workbench is one package but two TypeScript projects:

- `tsconfig.json` covers `src/` (browser, `vite/client` types).
- `tsconfig.node.json` covers `db/`, `scripts/`, `server/`, and
  `*.config.ts` (node).

`db/`, `server/`, and `scripts/` must never be imported from `src/`. The
two-tsconfig split enforces it; `pnpm typecheck` runs both.

The agent orchestrator (PR 6) is server-only because it imports the
Anthropic SDK and the registry. The structured `AgentAnswer` schema
(PR 5) is *shared* between browser and server: `tsconfig.node.json`
explicitly includes the relevant `src/agent/` files so the server can
re-validate `finalize` payloads with the exact same Zod schema the
browser uses to render them.

## The agent loop (PR 6)

`runPatientSummary(deps, args)` in
`server/agent/orchestrator.ts`. The loop has these properties:

1. **Bounded.** `maxTurns: 8`, `maxTokens: 4000` by default. Either
   ceiling forces a partial-answer fallback whose `cannotDetermine`
   entry names the cause.
2. **Tool surface = registry + `finalize`.** The model is shown the six
   PR 4 tools plus a terminal `finalize` tool whose JSON Schema mirrors
   the `AgentAnswer` body. Anything else is rejected with an
   `unknown_tool` envelope.
3. **Patient scope is enforced twice.** The system prompt names the
   authorized patient id verbatim. The registry runner rejects any
   `patientId` that doesn't match the session's id, regardless of what
   the prompt said. Either layer catches the breach; both layers exist
   so a single bug in one doesn't open a hole.
4. **Resource text is data, not instruction.** Every tool result is
   wrapped as
   `<tool_envelope tool="…" ok="…" duration_ms="…"><resource_data>…</resource_data></tool_envelope>`
   in the `messages` array as a `user` `tool_result` block. The system
   prompt (frozen at the start of the run) tells the model that
   anything inside `<resource_data>` is data, never a command.
5. **The `finalize` payload is re-validated.** The Anthropic SDK accepts
   a permissive JSON Schema for tool inputs. The orchestrator does the
   real validation against the `AgentAnswer` Zod schema in
   `src/agent/answer-schema.ts`. Failure → one structured retry, then a
   partial-answer fallback with the Zod issues attached.
6. **Logger pass-through.** The orchestrator never bypasses the
   registry. Every tool call — including `unknown_tool`,
   `unauthorized_patient`, `invalid_input`, and `timeout` — flows
   through the same `ToolLogger` hook that PR 7 will swap from
   in-memory to SQLite.

See [`/docs/agent-loop.md`](../../docs/agent-loop.md) for the loop
contract, system prompt properties, and HTTP API.

## The structured-answer schema (PR 5)

`AgentAnswer` is the only shape the renderer accepts. Every supported
claim must cite at least one FHIR resource (`evidence.min(1)`), and the
reference regex limits citations to the Phase A allow-list
(`Patient | Condition | MedicationRequest | AllergyIntolerance |
Encounter | Observation`). `missingData` and `cannotDetermine` are
required top-level arrays — "I don't know" cannot be smuggled in as a
free-text claim.

See [`docs/agent-answer.md`](./agent-answer.md).

## The typed FHIR tool registry (PR 4)

Six tools, each typed (Zod), patient-scoped (`patientId` required and
checked against the session row), and wrapped in the same `ToolEnvelope`
shape:

```
getPatient · searchConditionsForPatient · searchMedicationRequestsForPatient ·
searchAllergyIntolerancesForPatient · searchEncountersForPatient ·
searchObservationsForPatient
```

Search tools clamp results to a per-tool `resultLimit` (default 20,
configurable). Each tool declares its `timeoutMs` and the runner
enforces it with `AbortController`. Errors are normalised into eight
machine-readable reasons (`unknown_tool`, `invalid_input`,
`unauthorized_patient`, `upstream_error`, `timeout`,
`internal_error`, `session_not_found`, `connection_not_found`); HTTP
status mirrors the reason so generic clients can branch on either.

See [`docs/fhir-tools.md`](./fhir-tools.md).

## The FHIR allow-list (PR 3)

The proxy (`server/routes/fhir.ts` +
`server/services/fhir-proxy.ts`) is a second, lower allow-list that
the registry sits on top of. Resource types and per-resource search
parameters are both allow-listed; anything else is silently dropped
before forwarding upstream. Phase A is read-only; the proxy never
registers `POST` / `PUT` / `PATCH` / `DELETE` routes.

See [`docs/patient-viewer.md`](./patient-viewer.md).

## DB

SQLite via `better-sqlite3` with Drizzle migrations under
`db/migrations/`:

| Migration | Adds |
| --- | --- |
| `0000_initial.sql` | `schema_version` placeholder |
| `0001_data_connection.sql` | `data_connection` (PR 2) |
| `0002_agent_session.sql` | `agent_session` (PR 4) |

Path defaults to `apps/workbench/workbench.sqlite`; override with
`WORKBENCH_DB_URL`. Auth tokens are stored unencrypted — Phase A is
synthetic-only single-user local; see `docs/data-connections.md` for
the explicit non-claim.

## FHIR-native choices (carried into PRs 7 / 8 / 9)

- Evidence references in `EvidenceBackedClaim` are FHIR-style relative
  URLs (`Condition/abc-123`) so they round-trip into the resource
  viewer (PR 3) without URL rewriting.
- The audit log shape (PR 7) will mirror `AuditEvent` + `Provenance`
  fields — same vocabulary the FHIR audit-log resources use, even
  though Phase A never writes those resources back to the FHIR server.
- Eval fixtures (PR 8) will be stored as FHIR `Bundle` resources, not
  bespoke JSON.
- Tool envelopes already return upstream `Bundle` `searchset` payloads
  on success and surface upstream `OperationOutcome` bodies on error,
  not a parallel error shape.

## Planned

What the code anticipates but does not yet implement:

| PR | Adds | Where it will land |
| --- | --- | --- |
| 7 | `tool_call`, `evidence_claim` tables; DB-backed `ToolLogger`; session detail view + tool-call timeline; JSON export | `db/migrations/000{3,4}_*.sql`, `server/services/audit-store.ts`, `src/pages/SessionDetailPage.tsx` (provisional names) |
| 8 | Eval runner, golden fixtures, schema-validity / unsupported-claim metrics | `apps/workbench/scripts/evals.ts` (provisional) |
| 9 | Failure gallery page surfacing the eval cases | `src/pages/FailureGalleryPage.tsx` (provisional) |

The current shapes (envelope + answer schema + logger hook) were chosen
so PR 7's swap from in-memory log to SQLite is additive, not invasive.
