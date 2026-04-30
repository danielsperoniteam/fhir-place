# Acceptance — `add-agent-tool-registry`

This change is accepted when **all** of the following hold:

- [ ] `pnpm --filter @fhir-place/workbench db:setup` applies migration
      `0002_agent_session.sql` cleanly.
- [ ] `GET /api/sessions/tools` returns the six Phase A tools with their
      metadata.
- [ ] `POST /api/sessions` with `(connectionId, patientId)`:
      - 201 + the row on success;
      - 400 for an invalid FHIR id;
      - 404 for an unknown connection.
- [ ] `POST /api/sessions/:sid/tools/getPatient` with the matching
      `patientId` returns 200 + an envelope with `ok: true` and the
      Patient resource.
- [ ] The same call with a different `patientId` returns HTTP 403 + an
      envelope with `ok: false`, `reason: "unauthorized_patient"`.
- [ ] An unknown tool name returns 404 + `reason: "unknown_tool"`.
- [ ] Missing `patientId` returns 400 + `reason: "invalid_input"` with
      structured Zod issues.
- [ ] An unknown enum value (e.g. `clinicalStatus: "indeterminate"`,
      `category: "survey"`, `status: "tentative"`) returns 400 +
      `reason: "invalid_input"`.
- [ ] `_count`-style truncation: a tool whose `execute` returns more
      than `resultLimit` items returns the first `resultLimit` items
      with `truncated: true`.
- [ ] A tool that exceeds `timeoutMs` returns HTTP 504 + `reason:
      "timeout"`.
- [ ] The connection's `authToken` does not appear in any envelope or
      response body — verified by a route test.
- [ ] The in-memory logger receives one entry per invocation, including
      failed ones, with `sessionId`, `patientId`, `tool`, `toolVersion`,
      `input`, and `envelope`.
- [ ] The frontend `PatientPage` has a "Start agent session" button
      that creates the session and navigates to `/sessions/:sid`.
- [ ] `/sessions/:sid` renders a tool selector, an extra-input JSON
      field, and a tool-call history.
- [ ] The synthetic-only banner is visible on every new page.
- [ ] `pnpm -r typecheck` exits 0.
- [ ] `pnpm -r test:run` exits 0; the suite includes 13 + 12 + 11 new
      tests.
- [ ] `pnpm --filter @fhir-place/workbench build` produces a Vite
      bundle.
- [ ] `docs/fhir-tools.md` describes the hard rules, tools, HTTP API,
      envelope, file layout, and Phase A icebox.
- [ ] No Phase A icebox item is introduced. Specifically: no LLM, no
      arbitrary FHIR query generation, no write-back, no PHI path, no
      tool composition inside the registry, no SMART, no tools outside
      the six allow-listed types.
