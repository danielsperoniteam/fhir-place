# Tasks — `add-audit-logging`

- [x] Add `db/migrations/0003_audit.sql` with `agent_answer`,
      `tool_call`, `evidence_claim`.
- [x] Mirror the new tables in `db/schema.ts`.
- [x] Extend `ToolCallLogEntry` with optional `answerId`.
- [x] Add `teeLogger` and `scopeLoggerToAnswer` helpers in
      `server/agent/tool-log.ts`.
- [x] Add `server/services/audit-store.ts` with `persistAnswer`,
      `recordToolCall`, `listAnswers`, `getAnswer`, `listToolCalls`,
      `exportSession`.
- [x] Wire the audit store into `server/app.ts` as a required
      `ServerDeps` field; thread it through `index.ts` and
      `test-utils.ts`.
- [x] Wire `POST /api/sessions/:sid/answer` to persist via the audit
      store after `runPatientSummary` returns.
- [x] Wire `POST /api/sessions/:sid/tools/:toolName` (debug runner)
      to persist its tool calls (`answer_id = NULL`).
- [x] Add `GET /api/sessions/:sid/answers` route.
- [x] Add `GET /api/sessions/:sid/answers/:aid` route with
      cross-session 404 scoping.
- [x] Add `GET /api/sessions/:sid/audit` route with
      `Content-Disposition: attachment`.
- [x] Extend `src/api/sessions.ts` with `listSessionAnswers`,
      `getSessionAnswer`, `sessionAuditExportUrl`, plus the
      `AnswerSummary` / `AnswerDetail` / `ToolCallSummary` /
      `EvidenceClaimSummary` types.
- [x] Extend `src/pages/SessionPage.tsx` with "Export audit JSON"
      link and the `PastAnswersPanel` + `ToolCallTimeline`
      components.
- [x] Add `apps/workbench/docs/audit-model.md`.
- [x] Update `apps/workbench/docs/architecture.md` — move audit log
      from planned to shipped.
- [x] Update `apps/workbench/docs/safety.md` — anchor "audit log
      everything" to file paths.
- [x] Update `apps/workbench/docs/limitations.md` — remove PR 7 from
      "not yet shipped".
- [x] Update `apps/workbench/README.md` "Status" section.
- [x] Update `apps/workbench/src/pages/HomePage.tsx` blurb.
- [x] Update `apps/workbench/TASKS.md` — move PR 7 to Done, drop the
      duplicate Backlog card.
- [x] Tests (`audit-store.test.ts` + `answers.test.ts`).
- [x] `pnpm -r typecheck`, `pnpm -r test:run`, and the workbench
      build all pass.
