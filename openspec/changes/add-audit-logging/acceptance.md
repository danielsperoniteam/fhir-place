# Acceptance — `add-audit-logging`

This change is accepted when **all** of the following hold:

## Persistence

- [ ] `db/migrations/0003_audit.sql` exists. `pnpm db:setup` from a
      clean checkout applies it and creates the three tables.
- [ ] `db/schema.ts` exports `agentAnswer`, `toolCall`, `evidenceClaim`
      Drizzle table objects with matching `*Row` and `New*Row`
      type aliases.
- [ ] After a successful agent run, the `agent_answer` row contains:
      session_id, prompt, prompt_version (`patient-summary@v1`),
      provider (`anthropic`), model (the configured model),
      `fallback = 0`, `turns`, `answer_json` (validated AgentAnswer),
      and `created_at`.
- [ ] After a fallback agent run (e.g. `end_turn` without finalize),
      the row has `fallback = 1` and the partial answer's
      `cannotDetermine[0].why` is preserved in `answer_json`.
- [ ] Every `tool_call` row from an agent run has its `answer_id`
      pointing at the run's `agent_answer.id`.
- [ ] Every debug-runner `tool_call` row has `answer_id IS NULL`.
- [ ] Each `evidence_claim` row carries the original claim's `id`,
      `text`, and the array of `<AllowedType>/<id>` references.
- [ ] Deleting the parent `agent_session` cascades: all
      `agent_answer`, `tool_call`, and (via the answer cascade)
      `evidence_claim` rows are removed.

## HTTP

- [ ] `POST /api/sessions/:sid/answer` returns
      `{ answerId, answer, turns, fallback, finalIssues? }`.
- [ ] `GET /api/sessions/:sid/answers` returns
      `{ answers: AnswerSummary[] }` newest-first.
- [ ] `GET /api/sessions/:sid/answers/:aid` returns the full
      `AnswerDetail` (answer + toolCalls + claims).
- [ ] `GET /api/sessions/:sid/answers/:aid` 404s when the answer is
      owned by a different session (cross-session scoping).
- [ ] `GET /api/sessions/:sid/audit` returns a JSON document with
      `schemaVersion: "1"`, the session row, every persisted answer
      with its tool calls + claims, and unbound debug-runner tool
      calls. The response carries
      `Content-Disposition: attachment; filename="…"`.
- [ ] Without `ANTHROPIC_API_KEY`, `POST /:sid/answer` still returns
      503 and writes nothing to the audit log.

## UI

- [ ] `SessionPage` shows an "Export audit JSON" link in the header.
- [ ] After at least one run, `SessionPage` shows a "Past runs" panel
      listing persisted answers, newest-first.
- [ ] Expanding a past run shows its tool-call timeline (tool, ok /
      reason, count, durationMs) and the cited-evidence summary.

## Safety

- [ ] No audit-log row ever contains the connection's bearer token.
      The `tool_call.input_json` column carries only the registry-
      accepted input; tools never receive the token.
- [ ] The synthetic-only / not-for-clinical-use banner is unchanged.
- [ ] The `ToolLogger` interface is preserved. Tools never call the
      audit store directly.
- [ ] No `AuditEvent` / `Provenance` resource is written back to the
      FHIR server. The mapping doc explains the vocabulary; Phase A
      stays read-only against upstream.

## Tests

- [ ] `pnpm -r typecheck` exits 0.
- [ ] `pnpm -r test:run` exits 0; the workbench suite has at least
      16 new tests:
      - 8 in `server/services/audit-store.test.ts`,
      - 8 in `server/routes/answers.test.ts`.
- [ ] `pnpm --filter @fhir-place/workbench build` produces a Vite
      bundle.

## Docs

- [ ] `apps/workbench/docs/audit-model.md` exists and maps the schema
      to FHIR `AuditEvent` / `Provenance` concepts.
- [ ] `apps/workbench/docs/architecture.md` lists audit logging as
      shipped, not planned.
- [ ] `apps/workbench/docs/safety.md`'s "audit log everything" layer
      is anchored to file paths.
- [ ] `apps/workbench/docs/limitations.md` no longer lists PR 7 under
      "not yet shipped".
- [ ] `apps/workbench/README.md` and the in-app `HomePage.tsx` blurb
      reflect PR 7 shipped.
- [ ] `apps/workbench/TASKS.md` moves PR 7 to Done and removes the
      duplicated Backlog card.

## Out of scope

- [ ] No `AuditEvent` / `Provenance` write-back is introduced.
- [ ] No encryption-at-rest of the SQLite file is added.
- [ ] No multi-user authentication or per-user audit-log scoping is
      added.
- [ ] No retention / vacuuming policy is added — Phase A is single-
      user local; the SQLite file owns its size.
