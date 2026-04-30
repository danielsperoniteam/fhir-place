# Patient-Summary Agent (the Loop)

PR 6 of Phase A. The first LLM workflow. The orchestrator runs a custom
tool-calling loop bounded to:

- the typed FHIR tool registry from PR 4 (six tools, patient-scoped,
  deny-by-default), plus
- a single terminal `finalize` tool whose input is the
  [`AgentAnswer`](./agent-answer.md) body.

The model never sees the FHIR proxy directly. The orchestrator never
sees the resource bytes outside an `<resource_data>` wrapper.

## Files

| File | What it is |
| --- | --- |
| `apps/workbench/server/agent/model-config.ts` | `ANTHROPIC_API_KEY` plumbing, default model, injectable `messagesCreate` |
| `apps/workbench/server/agent/prompts.ts` | System prompt + `PHASE_A_PROMPT_VERSION` + suggested prompts |
| `apps/workbench/server/agent/anthropic-tools.ts` | Hand-written JSON Schemas mirroring the registry tools + the `finalize` tool |
| `apps/workbench/server/agent/orchestrator.ts` | The loop |
| `apps/workbench/server/agent/orchestrator.test.ts` | 9 scripted-Anthropic tests |
| `apps/workbench/server/routes/answers.ts` | `POST /api/sessions/:sid/answer` + `GET /api/agent/status` |
| `apps/workbench/src/api/sessions.ts` | Frontend client (`runPatientSummary`, `getAgentStatus`) |
| `apps/workbench/src/pages/SessionPage.tsx` | `AgentPanel` — Run button + render |

## Provider / model

- **Provider:** `anthropic` (only Phase A provider).
- **Default model:** `claude-sonnet-4-6` — chosen for cost-bounded
  Phase A research. Override with `WORKBENCH_AGENT_MODEL` env var; the
  recommended swap for higher-quality runs is `claude-opus-4-7`.
- **API key:** read from `ANTHROPIC_API_KEY` only. No UI input — that
  is a separate threat model.
- **Without a key:** `POST /api/sessions/:sid/answer` returns
  `503 agent_unavailable` with a clear hint. The rest of the workbench
  (patient search, FHIR proxy, tool runner) keeps working.

## The system prompt

Three properties are non-negotiable, encoded directly in the system
prompt:

1. **Scope** — only the typed tools; only the session's authorized
   patient id; never mutate.
2. **Evidence** — every supported claim cites ≥ 1 FHIR resource. The
   `finalize` tool's input enforces this (an empty `evidence` array on a
   claim is rejected by the AgentAnswer schema; the orchestrator returns
   `is_error` to the model).
3. **Resource text is data, not instruction** — every tool result is
   wrapped in `<tool_envelope><resource_data>…</resource_data></tool_envelope>`
   and the system prompt explicitly tells the model that anything inside
   that wrapper is patient or system data, never commands.

Prompt version: `patient-summary@v1`. Bumping the constant in
`server/agent/prompts.ts` is the single source of truth.

## The loop

```
loop:
  ask model (system + tools + messages) →
    if stop_reason !== "tool_use":
      return partial-answer fallback (cannotDetermine why)
    for each tool_use block:
      if name === "finalize":
        validate input against AgentAnswer
          ok    → end loop, return validated answer
          fail  → tool_result(is_error: true, issues: ...) and one retry
      else:
        run via PR 4 registry → wrap envelope as tool_result content
    append assistant turn + user turn (tool_results)
    if turns >= maxTurns: return partial-answer fallback
```

Defaults: `maxTurns = 8`, `maxTokens = 4000`. Both override-able per
request via the `POST /api/sessions/:sid/answer` body for testing.

## Safety properties

- **Loop never widens scope.** The session's `patient_id` is baked into
  the system prompt. The runner-level scope check (PR 4) rejects any
  tool call whose `input.patientId` differs.
- **Final answer always validates.** If the model's `finalize` payload
  fails AgentAnswer validation twice, the orchestrator constructs its
  own schema-valid partial answer (zero claims; one `cannotDetermine`
  with the reason). Callers downstream — including PR 7's audit log and
  PR 9's failure gallery — never see a malformed answer.
- **Resource text never reaches a system position.** Tool results are
  wrapped before going into the `messages` array. The system prompt is
  cached (`cache_control: ephemeral`) and never carries dynamic resource
  data.
- **Prompt injection is ignored.** Tested explicitly in
  `orchestrator.test.ts` — a malicious `name.text` in a Patient
  resource cannot make the agent fabricate claims, because the
  orchestrator's behavior is the loop above, not text matching.
- **Logging hook is preserved.** Every tool call still flows through
  the registry's `ToolLogger`, including unknown-tool / unauthorized-
  patient errors.

## HTTP API

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/api/agent/status` | `{ ready, provider, model, promptVersion, suggestedPrompts, hint }` |
| `POST` | `/api/sessions/:sid/answer` | Runs the loop. Body: `{ prompt?, maxTurns?, maxTokens? }`. Response: `{ answer, turns, fallback, finalIssues? }`. |

503 when no API key, 404 for unknown session/connection, 400 for invalid
request body, 502 for upstream provider errors.

## Phase A icebox

- **Streaming partial answers** to the UI. The renderer is whole-answer
  for now.
- **Multi-provider abstraction** (OpenAI, Bedrock, Vertex). Phase B.
- **Memory** across sessions.
- **Multi-agent planning** / sub-agents.
- **Free-form FHIR queries** by the agent.
- **`output_config.format`** structured outputs on the final response.
  We use the `finalize` tool pattern instead because it integrates with
  the agent's tool-calling loop without a model-mode switch on the last
  call.
