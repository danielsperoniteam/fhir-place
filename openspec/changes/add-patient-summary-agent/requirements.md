# Requirements — `add-patient-summary-agent`

## Functional

- F1. The provider is `anthropic` and the default model is
  `claude-sonnet-4-6`. Both are exposed via
  `apps/workbench/server/agent/model-config.ts`.
- F2. `WORKBENCH_AGENT_MODEL` env var overrides the model.
- F3. `ANTHROPIC_API_KEY` env var is required for the agent endpoint.
  Without it `POST /api/sessions/:sid/answer` returns
  `503 agent_unavailable` and the rest of the workbench stays usable.
- F4. The orchestrator exposes a single function
  `runPatientSummary(deps, args)` that returns
  `{ answer, turns, fallback, toolEnvelopes, finalIssues? }`.
- F5. The agent has access to the six PR 4 tools plus a terminal
  `finalize` tool. The model cannot call any other tool.
- F6. `runPatientSummary` validates the `finalize` input against the
  AgentAnswer Zod schema. On failure, it returns a structured
  `is_error` tool_result with the Zod issues; the model gets exactly
  one retry.
- F7. The loop ends on:
      - a schema-valid `finalize` (returns `fallback: false`),
      - second `finalize` that fails validation (`fallback: true`),
      - `stop_reason !== "tool_use"` without a `finalize` call
        (`fallback: true`),
      - `maxTurns` exhaustion (`fallback: true`).
- F8. The fallback answer is itself schema-valid: zero claims, one
  `cannotDetermine` entry naming the reason, and the tool-call
  timeline summarising every envelope captured.
- F9. The HTTP route `POST /api/sessions/:sid/answer` returns 200 + the
  answer wrapper on success, 503 if no API key, 404 if session/
  connection unknown, 400 for invalid input, 502 for upstream errors.
- F10. `GET /api/agent/status` returns
  `{ ready, provider, model, promptVersion, suggestedPrompts, hint }`
  and never requires auth.
- F11. The frontend `SessionPage` shows an `AgentPanel` that disables
  the Run button when `ready: false`, displays the hint, and renders
  the validated answer via `AgentAnswerRenderer` on completion.

## Non-functional

- N1. The system prompt is rendered before any tool result and contains
  the authorized patient id verbatim.
- N2. The system prompt is marked `cache_control: {type: "ephemeral"}`.
- N3. The registry's `ToolLogger` is invoked for every tool call,
  including unknown / unauthorized / invalid-input cases. The
  orchestrator does not bypass the runner.
- N4. Tool results are wrapped as
  `<tool_envelope tool="…" ok="…" duration_ms="…"><resource_data>…</resource_data></tool_envelope>`.
- N5. The orchestrator never inserts resource text into the system
  position. The system prompt is frozen at the start of the run.
- N6. The orchestrator never throws on a malformed model response — it
  converts every error path into a structured envelope or a partial
  answer.
- N7. `maxTurns` defaults to 8 and is overridable via the route body
  for testing only.
- N8. The patient-scope check is enforced *both* by the system prompt
  and by the registry runner. Either, alone, is not sufficient.

## Tests

- T1. Happy path: scripted `getPatient → searchConditionsForPatient →
  finalize` with valid claims returns `fallback: false`,
  `claims.length === 1`, evidence reference preserved, prompt version
  set, `provider/model` set.
- T2. The first model call's `system` field is an array with a
  `cache_control: ephemeral` block whose text contains the authorized
  patient id verbatim.
- T3. Deny-by-default: a `getPatient` with a different `patientId`
  produces an `unauthorized_patient` envelope; the loop continues
  and finalizes.
- T4. Schema retry then fallback: two consecutive invalid `finalize`
  payloads produce a partial answer with `finalIssues` populated.
- T5. Schema retry recovery: invalid → valid `finalize` returns
  `fallback: false`.
- T6. Max-turn fallback: a model that loops on `getPatient` past
  `maxTurns: 3` returns `fallback: true`,
  `cannotDetermine[0].why` mentions "exhausted maxTurns",
  `toolCalls.length === 3`.
- T7. End-turn-without-finalize fallback: model returns `end_turn` →
  `fallback: true`, `cannotDetermine[0].why` mentions
  `stop_reason=end_turn`.
- T8. Prompt-injection ignored: a malicious `name.text` and
  `identifier[].system` in a Patient resource does not affect the
  scripted plan; the agent's answer remains schema-valid and contains
  no fabricated claims.
- T9. Unknown tool: a tool_use with a name outside the registry
  produces an `unknown_tool` envelope; the orchestrator does not
  crash.

## Documentation

- D1. `docs/agent-loop.md` documents the file layout, provider/model
  resolution, system prompt properties, the loop, safety properties,
  HTTP API, and Phase A icebox.
- D2. `apps/workbench/.env.example` lists the required and optional
  env vars with explanatory comments.
