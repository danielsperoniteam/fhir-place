# Tasks — `add-agent-tool-registry`

- [x] Add `agent_session` table to `db/schema.ts`.
- [x] Add migration `db/migrations/0002_agent_session.sql`.
- [x] Add `server/services/session-store.ts` (CRUD, injectable
      `generateId` / `now`).
- [x] Add `server/agent/envelope.ts` with `ToolEnvelope`,
      `ToolErrorReason`, `ok()`, `err()`.
- [x] Add `server/agent/tool-log.ts` with `ToolLogger`,
      `inMemoryLogger()`, `consoleLogger()`.
- [x] Add `server/agent/registry.ts` with `ToolDef`, `createRegistry()`,
      and `PatientIdField`.
- [x] Add `server/agent/tools/_shared.ts` with `dateRangeSchema`,
      `appendDateRange`, `clampLimit`, `runPatientSearch`, `runRead`.
- [x] Add `server/agent/tools/get-patient.ts` and the five
      `search*-for-patient.ts` tool definitions.
- [x] Add `server/agent/tools/index.ts` exporting `PHASE_A_TOOLS` and
      `createPhaseATools()`.
- [x] Thread `AbortSignal` through `proxySearch` / `proxyRead` for tool
      timeouts.
- [x] Add `server/routes/sessions.ts` with `POST/GET/DELETE
      /api/sessions`, `GET /api/sessions/tools`, and
      `POST /api/sessions/:sid/tools/:toolName`.
- [x] Wire sessions, registry, and logger into `server/app.ts` and
      `server/index.ts`.
- [x] Backend tests:
      - `server/agent/registry.test.ts` (13 tests)
      - `server/agent/tools/tools.test.ts` (12 tests)
      - `server/routes/sessions.test.ts` (11 tests)
- [x] Frontend client `src/api/sessions.ts`.
- [x] Frontend `SessionPage` (humans-only debug runner).
- [x] "Start agent session" button on `PatientPage`.
- [x] Wire `/sessions/:sid` route in `App.tsx`.
- [x] Add `docs/fhir-tools.md`.
- [x] Add OpenSpec change `add-agent-tool-registry/`.
- [x] `pnpm -r typecheck`, `pnpm -r test:run`, and the workbench build
      all pass.
