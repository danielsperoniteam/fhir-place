# Requirements — `add-audit-logging`

## Functional

- F1. Three new SQLite tables exist via `db/migrations/0003_audit.sql`:
      `agent_answer`, `tool_call`, `evidence_claim`. The schema is
      mirrored in `db/schema.ts` as Drizzle table objects.
- F2. `agent_answer` rows persist: id, session_id (FK to
      `agent_session`, ON DELETE CASCADE), prompt, prompt_version,
      provider, model, fallback (boolean), turns, answer_json (the
      validated `AgentAnswer` body), final_issues_json (nullable),
      created_at.
- F3. `tool_call` rows persist: id, session_id (FK to `agent_session`,
      ON DELETE CASCADE), answer_id (FK to `agent_answer`, ON DELETE
      SET NULL), connection_id, patient_id, tool, tool_version,
      input_json, envelope_json, ok (boolean), reason (nullable),
      result_count (nullable), truncated (nullable), duration_ms,
      resource_ids_json (nullable), started_at, completed_at.
- F4. `evidence_claim` rows persist: id, answer_id (FK to
      `agent_answer`, ON DELETE CASCADE), claim_id (the AgentAnswer
      claim id), text, evidence_refs_json (the array of
      `ResourceReference`s as JSON).
- F5. A new service `server/services/audit-store.ts` exposes:
      `persistAnswer(input, toolEntries)`,
      `recordToolCall(entry)`,
      `listAnswers(sessionId)`,
      `getAnswer(answerId)`,
      `listToolCalls({ sessionId, answerId? })`,
      `exportSession({ sessionId, connectionId, patientId })`.
- F6. `POST /api/sessions/:sid/answer` persists the run after the
      orchestrator returns. Insert order is enforced:
      `agent_answer` → `tool_call` rows → `evidence_claim` rows.
- F7. The route response includes the new field `answerId` in addition
      to the existing `answer`, `turns`, `fallback`, `finalIssues?`
      shape.
- F8. New routes:
      - `GET /api/sessions/:sid/answers` — list summaries, newest
        first. 200 + `{ answers: AnswerSummary[] }`. 404 if session
        unknown.
      - `GET /api/sessions/:sid/answers/:aid` — detail with
        `toolCalls[]` and `claims[]`. 404 if session or answer
        unknown, **including** the case where the answer exists but
        is owned by another session.
      - `GET /api/sessions/:sid/audit` — JSON export with
        `Content-Disposition: attachment; filename="…"`. The body
        contains the session, every persisted answer (with its tool
        calls and claims), and the unbound debug-runner tool calls.
- F9. `POST /api/sessions/:sid/tools/:toolName` (the debug runner)
      records its tool calls via the same audit store, with
      `answer_id = NULL`.
- F10. The `SessionPage` UI surfaces:
       - an "Export audit JSON" link in the page header that downloads
         the JSON via `sessionAuditExportUrl(sid)`,
       - a "Past runs" panel listing persisted answers, newest-first,
         each expandable into a tool-call timeline + cited-evidence
         summary.

## Non-functional

- N1. The `ToolLogger` interface is preserved. Tools never call the
      audit store directly; the registry runner stays the chokepoint
      for `ToolCallLogEntry` production.
- N2. Two new helpers exist in `server/agent/tool-log.ts`:
      `teeLogger` (fan-out) and `scopeLoggerToAnswer` (tag with
      `answerId`). `inMemoryLogger` and `consoleLogger` continue to
      work unchanged.
- N3. Auth tokens never appear in any audit-log row. Tools don't
      receive the token; the envelope shape doesn't carry it; the
      audit store inherits both.
- N4. SQLite FKs are enforced (`PRAGMA foreign_keys = ON` in
      `db/client.ts`). Insert order in `persistAnswer` respects this.
- N5. Cascade behaviour:
      - Deleting a session cascades to `agent_answer` and `tool_call`.
      - Deleting an answer (rare; not exposed via HTTP today) sets
        `tool_call.answer_id` to NULL and cascades to
        `evidence_claim`.
- N6. The audit export is a single round-trip: one JSON document with
      the schema version `"1"`. No streaming, no per-resource fetch.
- N7. The synthetic-only / not-for-clinical-use banner is unchanged.
- N8. The Phase A icebox is unchanged. In particular, no
      `AuditEvent` / `Provenance` resources are written back to the
      FHIR server. `docs/audit-model.md` is the FHIR-adjacent
      vocabulary cheat sheet, not a write path.

## Tests

- T1. `audit-store.test.ts` — `persistAnswer` inserts the agent_answer
      + tool_call (with `answer_id` set) + evidence_claim rows in one
      logical unit.
- T2. `audit-store.test.ts` — fallback runs persist `final_issues_json`
      and `fallback = 1`.
- T3. `audit-store.test.ts` — duplicate `answerId` is rejected by the
      primary-key constraint.
- T4. `audit-store.test.ts` — `recordToolCall` writes a tool_call row
      with `answer_id = NULL` (debug-runner path).
- T5. `audit-store.test.ts` — failure envelopes persist `ok = 0` and
      `reason`.
- T6. `audit-store.test.ts` — `exportSession` returns answers with
      their tool calls + claims AND the unbound debug-runner calls.
- T7. `audit-store.test.ts` — `listAnswers` returns newest-first.
- T8. `audit-store.test.ts` — deleting an `agent_session` cascades.
- T9. `answers.test.ts` — happy run persists agent_answer +
      tool_call (with `answer_id = body.answerId`) +
      evidence_claim rows.
- T10. `answers.test.ts` — fallback runs (end_turn) persist
       `fallback = true`, `final_issues = null`.
- T11. `answers.test.ts` — `GET /:sid/answers` lists.
- T12. `answers.test.ts` — `GET /:sid/answers/:aid` returns detail.
- T13. `answers.test.ts` — `GET /:sid/answers/:aid` 404s for an
       answer owned by another session.
- T14. `answers.test.ts` — `GET /:sid/audit` returns the export with
       a `Content-Disposition: attachment` header.
- T15. `answers.test.ts` — `POST /:sid/tools/:toolName` (debug
       runner) writes a tool_call row with `answer_id = NULL`.
- T16. `answers.test.ts` — without `ANTHROPIC_API_KEY`, the
       `POST /:sid/answer` route still returns 503 and **does not**
       insert any audit rows.

## Documentation

- D1. `apps/workbench/docs/audit-model.md` documents:
      - the table-by-table shape,
      - the FHIR-adjacent mapping (`AuditEvent` / `Provenance` /
        `Bundle` / etc.),
      - the export format,
      - the explicit non-claim that nothing is written back to the
        FHIR server.
- D2. `apps/workbench/docs/architecture.md` mentions the audit store
      as a shipped component (PR 7) rather than a planned one.
- D3. `apps/workbench/docs/safety.md`'s "audit log everything" layer
      is upgraded from "planned" to "anchored to file path".
- D4. `apps/workbench/docs/limitations.md` no longer lists PR 7 under
      "not yet shipped".
- D5. `apps/workbench/README.md` "Status" section reflects PR 7
      shipped.
- D6. `apps/workbench/src/pages/HomePage.tsx` in-app status blurb
      reflects PR 7.
- D7. `apps/workbench/TASKS.md` moves PR 7 to "Done" and removes the
      duplicated PR 7 card from "Backlog".
