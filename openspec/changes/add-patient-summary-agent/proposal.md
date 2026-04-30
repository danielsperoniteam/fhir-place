# Proposal — `add-patient-summary-agent`

## Summary

PR 6 of Phase A. Adds the first LLM workflow: a custom tool-calling
loop that produces a schema-validated `AgentAnswer` (PR 5) by composing
calls to the typed FHIR tool registry (PR 4). The loop is bounded
(`maxTurns`, `maxTokens`), patient-scoped, deny-by-default, and treats
all resource text as data, not instruction.

## Motivation

PRs 4 + 5 set up the agent's surface area without ever connecting it to
a model. PR 6 is where the surfaces meet — and it's the highest-risk
piece of Phase A. Three properties have to hold under adversarial input
or the safety story collapses:

1. The agent's actions are bounded to the typed FHIR tools.
2. Every supported claim cites a real FHIR resource.
3. Resource text cannot promote itself to instruction.

The orchestrator wraps each of these in code rather than relying on
prompt engineering: scope is enforced by the registry, evidence is
enforced by the AgentAnswer schema (the `finalize` tool's input *is*
the schema), and resource text is fenced inside `<resource_data>`
markers that the system prompt treats as data.

## Scope

In:

- `model-config.ts` — provider/model resolution, injectable
  `messagesCreate` so tests substitute a deterministic fake.
- `prompts.ts` — patient-scoped system prompt + `PHASE_A_PROMPT_VERSION`
  + the standard suggested prompt list.
- `anthropic-tools.ts` — JSON Schemas for the six PR 4 tools and the
  terminal `finalize` tool whose input is the AgentAnswer body.
- `orchestrator.ts` — the loop. `maxTurns`, `maxTokens`, schema-retry,
  partial-answer fallback, mandatory invocation of the registry's
  logger.
- `routes/answers.ts` — `POST /api/sessions/:sid/answer` (the agent
  endpoint) and `GET /api/agent/status` (frontend readiness check).
- Frontend wiring on `SessionPage`: an `AgentPanel` that calls the
  endpoint and renders the result via PR 5's `AgentAnswerRenderer`.
- Backend tests with a scripted Anthropic client covering: happy path,
  unauthorized-patient deny, schema retry + fallback, max-turn
  fallback, end-turn-without-finalize fallback, prompt-injection
  ignored, unknown tool name handled.
- `docs/agent-loop.md`.

Out:

- DB persistence of agent runs (PR 7 — audit logging).
- Eval harness + golden cases (PR 8).
- Failure gallery pages built from stored answers (PR 9).
- Streaming partial answers, memory, multi-agent planning, multi-
  provider abstraction.

## Architecture decisions

- **Custom loop, not Managed Agents.** Phase A is a local-first single-
  user research workbench. We control the harness, the tool execution
  sandbox is the workbench server itself, and we want the registry's
  logger + scope enforcement to be the chokepoint — not Anthropic's
  agent runtime. Managed Agents is the right tool for hosted multi-
  session work; not this.
- **`finalize` tool, not `output_config.format`.** Constraining the
  *last* response to JSON would require a per-call mode switch
  (tool-calling turns can't have format constraints). A terminal
  `finalize` tool whose input is the AgentAnswer schema slots cleanly
  into the existing tool-calling loop.
- **Schema validation in the orchestrator, not the SDK.** The
  Anthropic SDK accepts strict tool schemas, but the AgentAnswer's
  `evidence.min(1)` and the per-resource-type reference regex are too
  fine-grained to encode in JSON Schema cleanly. We accept a permissive
  JSON schema at the SDK level and validate the full Zod schema in
  `runPatientSummary`, returning a structured error tool_result so the
  model can correct itself once.
- **Wrap-and-tag tool results.** Resource bytes go into the `messages`
  array as `<tool_envelope … ok="…"><resource_data>…</resource_data>…`
  text. The model is told in the system prompt that anything inside
  `<resource_data>` is data, never instruction.
- **Cache the system prompt.** `cache_control: {type: "ephemeral"}` on
  the system block + the registry tools list. Both are stable across
  the run, so repeated calls inside the loop hit the cache.
- **Default model is sonnet 4.6.** Cost-bounded for Phase A; trivially
  swap-able via `WORKBENCH_AGENT_MODEL`. Skill guidance defaults to
  opus 4.7 — that's documented as the recommended swap for the failure
  gallery (PR 9).

## Safety

- **Patient scope (defense in depth).**
  - System prompt names the authorized patient id.
  - Registry runner rejects any input whose `patientId` differs.
  - Tool envelope reports the rejection back to the model with reason
    `unauthorized_patient` so the loop continues without escalating.
- **Evidence (load-bearing).** The `finalize` tool's JSON Schema sets
  `claims[].evidence.minItems: 1` *and* the orchestrator re-validates
  with the AgentAnswer Zod schema (regex-checked references). Two
  guards; one source of truth.
- **Resource text isolation.** Tool results are wrapped; the system
  prompt is frozen at the start of every run. Resource content never
  enters the system position.
- **Bounded run.** `maxTurns: 8`, `maxTokens: 4000`. Hitting either
  produces a schema-valid partial answer with a `cannotDetermine`
  entry naming the reason.
- **No silent leaks.** Auth tokens never reach the model; the model's
  context window only ever sees the redacted tool envelope (no
  `authToken`).

## Non-goals

- Streaming the answer back as it's produced.
- Multi-provider abstraction.
- Memory or cross-session continuity.
- Tool composition / sub-agents.
- Tool authorization beyond patient scope.
- Free-form FHIR queries.
- Editable / interactive answers.
