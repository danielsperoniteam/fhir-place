# Proposal — `add-audit-logging`

## Summary

PR 7 of Phase A. Persists every agent run, every tool call, every
final `AgentAnswer`, and every `EvidenceBackedClaim` derived from it.
The DB-backed audit store sits behind the existing `ToolLogger` hook
(PR 4) and the existing `runPatientSummary` route (PR 6); the data
shapes already chosen in those PRs were chosen so this swap is
additive.

The audit log is the basis for **replay-inspecting** any agent run —
"which tool calls produced this answer", "which resources backed this
claim", "what was the prompt version when this fallback happened".

## Motivation

Until this PR, tool calls live in memory only and final answers are
discarded after the HTTP response is sent. That's two things we can't
do:

1. **Audit a past run.** A reviewer who wants to check whether the
   agent's claim about Type 2 diabetes really cited the documented
   `Condition` row has no way to look back; the tool-call timeline
   evaporates with the request.
2. **Compare runs.** PR 8's eval harness compares schema validity,
   unsupported-claim count, and tool-call count across runs. Without
   persistence, every eval is a fresh roll of the dice — there's no
   stable substrate to compare against.

Both are required by the Phase A Definition of Done in
`apps/workbench/TASKS.md`. PR 7 is the substrate.

## Scope

In:

- New SQLite tables (`db/migrations/0003_audit.sql`):
  - `agent_answer` — one row per `runPatientSummary` invocation.
    `answer_json` is the validated `AgentAnswer` body verbatim.
  - `tool_call` — one row per tool execution. Both agent-driven calls
    (FK `answer_id` to `agent_answer`) and standalone debug-runner
    calls (`answer_id NULL`) are recorded.
  - `evidence_claim` — derived from each persisted answer; one row per
    `EvidenceBackedClaim`. The source of truth is still
    `agent_answer.answer_json`; this row makes the audit query "which
    claims cite resource X" cheap and keeps the FHIR-adjacent
    `Provenance.entity` mapping concrete.
- New service `server/services/audit-store.ts` owning all reads and
  writes to those tables.
- `ToolCallLogEntry` gains an optional `answerId`. Two new helpers in
  `server/agent/tool-log.ts`:
  - `teeLogger(...)` — fan-out to multiple loggers.
  - `scopeLoggerToAnswer(base, answerId)` — wrap a base logger so every
    entry is tagged with the current run's answer id.
- `POST /api/sessions/:sid/answer` is wired to the audit store. The
  per-request flow:
  1. Generate an `answerId` up front.
  2. Buffer tool calls in an `inMemoryLogger()` during the loop, fan
     them out to any caller-provided logger via `teeLogger`.
  3. After `runPatientSummary` returns, persist in the order
     `agent_answer → tool_call rows → evidence_claim rows` so the
     `tool_call.answer_id` foreign key resolves cleanly.
- Three new GETs on the answers router:
  - `GET /api/sessions/:sid/answers` — list summaries for the session,
    newest first.
  - `GET /api/sessions/:sid/answers/:aid` — full detail, including the
    persisted tool-call timeline and the per-claim evidence list.
  - `GET /api/sessions/:sid/audit` — JSON export with a
    `Content-Disposition: attachment` header so the UI can offer a
    one-click download.
- The debug runner (`POST /api/sessions/:sid/tools/:toolName`) also
  persists its calls via the audit store, with `answer_id = NULL` so
  they're identifiable as non-agent traffic.
- `SessionPage` UI extensions:
  - "Export audit JSON" button next to the existing AgentAnswer
    preview link.
  - "Past runs" panel listing persisted answers; each row expands into
    a tool-call timeline + cited-evidence list.
- New `apps/workbench/docs/audit-model.md` mapping the persisted shape
  to FHIR `AuditEvent` / `Provenance` concepts. Phase A still does not
  write those resources back to the FHIR server (write-back is
  icebox).
- New tests:
  - `server/services/audit-store.test.ts` — 8 cases covering insert
    ordering, FK cascade, debug-runner path, export shape, list order.
  - `server/routes/answers.test.ts` — 8 cases covering the persistence
    side-effect of `POST /:sid/answer`, the three new GETs, and
    cross-session 404 scoping.

Out (deferred):

- Eval harness (PR 8) — depends on this PR.
- Failure gallery (PR 9) — depends on PRs 7 and 8.
- Streaming partial answers, multi-provider abstraction.
- `AuditEvent` / `Provenance` write-back to the FHIR server (Phase A
  icebox).
- Persistence-level retention policy or vacuuming (Phase A is
  single-user local; the SQLite file owns its size).

## Architecture decisions

- **Insert order: `agent_answer` first, then `tool_call`, then
  `evidence_claim`.** SQLite has `PRAGMA foreign_keys = ON` (in
  `db/client.ts`), so writing `tool_call.answer_id` rows before the
  parent `agent_answer` row would fail. Buffering tool calls during
  the loop and inserting them after the loop closes is simpler than
  switching to deferred FKs and matches how `runPatientSummary`
  actually returns its data.
- **Two logger paths, one audit store.** The agent route uses an
  `inMemoryLogger()` to buffer, then bulk-inserts via the store. The
  debug runner writes through `auditStore.recordToolCall` directly
  (no buffer — those calls aren't part of an answer). Both paths land
  in the same `tool_call` table; `answer_id` distinguishes them.
- **`evidence_claim` is derived data.** The truth lives in
  `agent_answer.answer_json`. The denormalised rows exist so audit
  queries don't have to JSON-parse the answer to ask "which claims
  cite resource X". A future schema bump that re-derives them from
  the JSON is intentional.
- **Resource ids are denormalised on `tool_call`.** `resource_ids_json`
  is a flat array of `<Type>/<id>` strings extracted from the
  envelope. Same reasoning — keeps the audit query cheap.
- **Auth tokens stay out of the audit log.** `tool_call.input_json` is
  the raw input the registry accepted; tools never receive the
  connection's `authToken`, so the persisted JSON cannot contain it.
  We add a regression test that asserts the bearer token never leaves
  the server.

## Safety

- No PHI path is opened. Phase A's working constraint is unchanged:
  synthetic-only, read-only, single-user local. The audit log is
  there *because* the project is research, not despite it.
- The auth token is never persisted to the audit log. The redaction
  is enforced by the layer above (`connection-store`) and the
  envelope shape (`envelope.ts`); the audit store just inherits both.
- The `ToolLogger` chokepoint is preserved. Tools never call the
  audit store directly. The registry runner is still the only place
  that produces `ToolCallLogEntry` records, and the audit store is
  the only thing that persists them.
- The synthetic-only banner stays where it is.

## Non-goals

- Writing `AuditEvent` / `Provenance` resources back to the FHIR
  server. The mapping doc explains the vocabulary; Phase A does not
  write back.
- Encryption-at-rest of the SQLite file. Single-user local; documented
  in `docs/limitations.md`.
- Multi-user authentication or per-user audit-log scoping.
- Search / filter UI on the past-runs panel beyond newest-first
  ordering.
- Alembic-style migration tooling. Drizzle is fine for Phase A.
