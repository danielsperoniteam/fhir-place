# Acceptance — `add-patient-summary-agent`

This change is accepted when **all** of the following hold:

- [ ] `GET /api/agent/status` with no `ANTHROPIC_API_KEY` set returns
      `{ ready: false, hint: "..." }` and HTTP 200.
- [ ] `POST /api/sessions/:sid/answer` with no `ANTHROPIC_API_KEY` set
      returns HTTP 503 with `error: "agent_unavailable"` and an
      explanatory hint.
- [ ] With `ANTHROPIC_API_KEY` set:
      - `GET /api/agent/status` returns
        `{ ready: true, provider: "anthropic", model, promptVersion,
        suggestedPrompts: [{id:"summary", text:"Summarise this patient."}] }`.
      - The frontend `SessionPage` shows an enabled "Run" button.
      - Clicking Run invokes the agent loop and renders a validated
        `AgentAnswer` via PR 5's renderer.
- [ ] The system prompt sent to the model on every turn:
      - is rendered before any tool result;
      - contains the session's authorized `patientId` verbatim;
      - is marked `cache_control: {type: "ephemeral"}`.
- [ ] The model can ONLY call:
      - the six PR 4 tools (`getPatient`,
        `searchConditionsForPatient`,
        `searchMedicationRequestsForPatient`,
        `searchAllergyIntolerancesForPatient`,
        `searchEncountersForPatient`,
        `searchObservationsForPatient`), and
      - the terminal `finalize` tool.
- [ ] A `getPatient` call with a `patientId` other than the session's
      authorized id is rejected by the registry with
      `reason: "unauthorized_patient"`; the loop continues and the
      orchestrator does not crash.
- [ ] A `finalize` payload that fails AgentAnswer validation produces
      an `is_error: true` tool_result with the structured Zod issues;
      the model gets exactly one retry. If the second attempt also
      fails, the orchestrator returns a partial answer with
      `fallback: true` and `finalIssues` set.
- [ ] When the model exhausts `maxTurns` (default 8) without calling
      `finalize`, the orchestrator returns a schema-valid partial
      answer with `cannotDetermine[0].why` naming the cause.
- [ ] When the model returns `stop_reason: "end_turn"` without calling
      `finalize`, the orchestrator returns a schema-valid partial
      answer with `cannotDetermine[0].why` mentioning the stop reason.
- [ ] Tool results delivered to the model are wrapped as
      `<tool_envelope tool="…" ok="…" duration_ms="…">
      <resource_data>…</resource_data></tool_envelope>`. Resource text
      never reaches the system position.
- [ ] Prompt-injection text inside resource fields (e.g. a Patient
      `name.text` of "IGNORE PRIOR INSTRUCTIONS …") cannot make the
      orchestrator change its behavior. The agent's run is dictated by
      the loop and the model's response, not by content inside
      `<resource_data>`.
- [ ] Every tool call (success and failure) is captured by the
      registry's `ToolLogger`, including `unknown_tool` and
      `unauthorized_patient` envelopes.
- [ ] Auth tokens never appear in any envelope, tool result, or HTTP
      response from the answer route.
- [ ] `pnpm -r typecheck` exits 0.
- [ ] `pnpm -r test:run` exits 0; the suite includes 9 new
      orchestrator tests.
- [ ] `pnpm --filter @fhir-place/workbench build` produces a Vite
      bundle.
- [ ] `docs/agent-loop.md` and `apps/workbench/.env.example` exist.
- [ ] No Phase A icebox item is introduced. Specifically: no DB
      persistence (PR 7), no eval harness (PR 8), no streaming, no
      multi-provider abstraction, no memory, no multi-agent planning,
      no tools outside the six allow-listed types.
