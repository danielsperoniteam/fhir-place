# Safety

Every safety claim in this doc is anchored to the file (or test) that
enforces it. If the file moves or the test is deleted, this doc breaks
visibly.

## What this project is, and isn't

This is a **research workbench** for evidence-backed agent answers
grounded in **synthetic FHIR data**. It is **not**:

- a clinical decision support tool,
- a SMART on FHIR app,
- a HIPAA-compliant system,
- a chatbot for real patients.

The synthetic-only / not-for-clinical-use banner is mounted above every
page in `src/components/SyntheticOnlyBanner.tsx`, wired into the
top-level layout in `src/App.tsx`. A regression test pins it in place:
`src/components/SyntheticOnlyBanner.test.tsx`.

## The safety layers (all must hold)

Each numbered layer is independent. A bug in any one layer should be
caught by the next.

### 1. Synthetic-only inputs

The supported deployment mode is the public HAPI sandbox or a local
Docker HAPI seeded with synthetic data. There is no PHI path.

- The top-of-page banner (above) is the user-visible reminder.
- The README (`apps/workbench/README.md`) and the demo script
  (`docs/demo-script.md`) both flag the same constraint up front.
- Connection setup does not advertise SMART on FHIR or any auth method
  that targets a production EHR. The `authType` allow-list in
  `server/schemas.ts` is `"none" | "bearer"` only, validated at the
  Hono boundary in `server/routes/connections.ts`.

### 2. Read-only against the FHIR server

Phase A never writes to the FHIR server. Write-back is icebox
(`docs/limitations.md`).

- The proxy (`server/services/fhir-proxy.ts` +
  `server/routes/fhir.ts`) only registers `GET` routes. `POST` /
  `PUT` / `PATCH` / `DELETE` get a 404 by routing-table omission.
- The agent has no `update*` / `create*` / `delete*` tool. The six
  registered tools (`server/agent/tools/*.ts`) are reads only.
- Regression: `server/routes/fhir.test.ts` asserts the read-only
  surface; `server/agent/tools/tools.test.ts` asserts the tool list.

### 3. Typed, patient-scoped, deny-by-default tools

The agent cannot generate arbitrary FHIR queries. It can only call the
six registered tools, each of which:

- validates input against a Zod schema (`server/agent/tools/*.ts` and
  `server/agent/registry.ts`),
- requires a `patientId` (`PatientScopedBase` in
  `server/agent/registry.ts`),
- is server-side scoped to the session's authorized patient
  (`registry.run` in `server/agent/registry.ts` rejects with
  `reason: "unauthorized_patient"` when the input's `patientId`
  doesn't match `session.patientId`),
- is deny-by-default for missing or unauthorized patient IDs (same
  check),
- has explicit result limits and timeouts (`resultLimit`, `timeoutMs`
  on each `ToolDef`; the runner truncates and aborts).

Regression: `server/agent/registry.test.ts` covers `unknown_tool`,
`invalid_input`, `unauthorized_patient`, `timeout`, and the
`truncated: true` envelope; `server/agent/orchestrator.test.ts`
covers the agent-level deny path (T3 — "deny-by-default") and asserts
the loop continues without escalating after rejection.

### 4. Resource text is data, not instruction

Anything fetched from the FHIR server is wrapped before it reaches a
system prompt or tool-name position.

- Tool results enter the `messages` array as
  `<tool_envelope ...><resource_data>…</resource_data></tool_envelope>`
  (`wrapResourceData` in `server/agent/orchestrator.ts`).
- The system prompt (`server/agent/prompts.ts`) explicitly tells the
  model that anything inside `<resource_data>` is data, never
  instructions.
- The system prompt is rendered once at the start of the run and is
  never replaced by tool output.
- Regression: `server/agent/orchestrator.test.ts` test T8
  ("prompt-injection ignored") feeds a malicious `name.text` and
  `identifier[].system` into a Patient resource and asserts the
  scripted plan is unaffected.

### 5. Structured, evidence-backed answers

The agent's final output validates against the `AgentAnswer` schema
(`src/agent/answer-schema.ts`). Supported claims must cite source
resources; missing-data and cannot-determine are first-class fields,
not absences.

- `EvidenceBackedClaim.evidence.min(1)` is non-optional.
- The reference regex limits citations to the Phase A allow-list:
  `Patient | Condition | MedicationRequest | AllergyIntolerance |
  Encounter | Observation`. Anything else fails validation.
- `missingData` and `cannotDetermine` are required top-level arrays.
  Even when empty, the keys must be present.
- The renderer (`src/agent/AgentAnswerRenderer.tsx`) only ever sees a
  *validated* answer; it does not parse or branch on shape mismatches.
- The orchestrator re-validates the `finalize` payload server-side
  (`runPatientSummary` in `server/agent/orchestrator.ts`). One
  structured retry, then a partial-answer fallback. The fallback
  answer is itself schema-valid (zero claims, one `cannotDetermine`
  entry naming the cause).
- Regression: `src/agent/answer-schema.test.ts` covers the schema;
  `src/agent/AgentAnswerRenderer.test.tsx` covers the renderer;
  `server/agent/orchestrator.test.ts` covers the validation retry
  paths (T4, T5).

### 6. Bounded loop

The agent cannot loop forever or burn unlimited tokens.

- `maxTurns: 8`, `maxTokens: 4000` defaults in
  `server/agent/orchestrator.ts`. Hitting either produces a
  schema-valid partial answer with a `cannotDetermine` entry naming
  the reason.
- Regression: `server/agent/orchestrator.test.ts` test T6
  ("max-turn fallback") and T7 ("end-turn-without-finalize").

### 7. No silent leaks

Auth tokens never reach the model and never reach the browser.

- The frontend only ever sees `hasAuthToken: true | false` on a
  connection row (`server/routes/connections.ts` redacts the token
  before serialising).
- Tool envelopes do not carry any field derived from `connection.authToken`
  (`server/agent/envelope.ts` defines the envelope shape; tools never
  attach the token to a result).
- The model's context window only ever sees the redacted envelope.

### 8. Audit log everything

Every agent run, every tool call (agent or debug), every final
`AgentAnswer`, and every `EvidenceBackedClaim` is persisted and
replay-inspectable.

- The audit store (`server/services/audit-store.ts`) is the
  chokepoint for writes to `agent_answer`, `tool_call`, and
  `evidence_claim`.
- The `ToolLogger` interface (`server/agent/tool-log.ts`) is still
  the sole producer of `ToolCallLogEntry` records; the registry
  runner is the single hook. The DB-backed path is added via
  `teeLogger` / `scopeLoggerToAnswer`, not by replacing the
  interface.
- HTTP surface: `GET /api/sessions/:sid/answers`,
  `GET /api/sessions/:sid/answers/:aid`,
  `GET /api/sessions/:sid/audit` (downloadable export). Wired in
  `server/routes/answers.ts`.
- UI surface: `SessionPage`'s "Past runs" panel + tool-call
  timeline + "Export audit JSON" link
  (`src/pages/SessionPage.tsx`).
- Auth tokens never reach the audit log. Tools never receive the
  connection's `authToken`, so `tool_call.input_json` cannot
  contain it. Regression: `routes/sessions.test.ts` "never returns
  the connection's auth token in any envelope".
- Cascade behaviour: deleting a session cascades to `agent_answer`
  and `tool_call`; deleting an answer cascades to `evidence_claim`.
- Regression: `server/services/audit-store.test.ts` (8 tests) and
  `server/routes/answers.test.ts` (8 tests).

The mapping to FHIR `AuditEvent` / `Provenance` shapes lives in
`docs/audit-model.md`. Phase A still does **not** write those
resources back to the FHIR server — write-back is icebox.

### 9. Evals before "done" (planned, not yet enforced)

Phase A is not done until the eval harness covers the named hard
cases:

- known-condition (cite the right `Condition`),
- no-allergy-data (zero `AllergyIntolerance` → "no allergy data
  found", not "no known allergies"),
- missing-labs (cannot-determine, not a guess),
- prompt-injection in resource text (already covered by orchestrator
  test T8, will move to the eval suite),
- out-of-scope patient (already covered by registry test
  `unauthorized_patient`, will move to the eval suite).

PR 8 owns this. Until then, the orchestrator and registry tests are
the regression boundary; they cover the prompt-injection and
unauthorized-patient cases today, but not the no-allergy or
missing-labs cases. See issue #77.

## Hard negatives

The following are explicitly **not** Phase A and are intentionally
absent from the codebase:

SMART on FHIR auth, real PHI handling, HIPAA claims, write-back, draft
/ queue / approval, prior auth, care-gap detection, quality-measure
explanation, CQL, `$evaluate-measure`, DocumentReference text
extraction, MCP server, BigQuery / OMOP / claims / wearable
connections, memory across sessions, multi-agent planning, clinician
preview mode, arbitrary FHIR query generation by the agent, arbitrary
code execution by the agent.

If a future request seems to require any of these, stop and confirm
before shipping. The `AGENTS.md` rule and the icebox section of
`docs/limitations.md` are aligned with this list.

## How to verify

From a clean checkout:

```bash
pnpm install
pnpm --filter @fhir-place/workbench db:setup
pnpm --filter @fhir-place/workbench typecheck
pnpm --filter @fhir-place/workbench test:run
```

The 138-test suite includes the regression tests cited above. A
failing test is a failing safety claim.
