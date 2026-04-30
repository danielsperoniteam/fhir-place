# Tasks — `add-patient-summary-agent`

- [x] Add `@anthropic-ai/sdk` dependency to `@fhir-place/workbench`.
- [x] Add `apps/workbench/.env.example` documenting `ANTHROPIC_API_KEY`
      and `WORKBENCH_AGENT_MODEL`.
- [x] Add `server/agent/model-config.ts` with provider/model resolution
      and an injectable `messagesCreate`.
- [x] Add `server/agent/prompts.ts` with `PHASE_A_PROMPT_VERSION`,
      `STANDARD_PATIENT_SUMMARY_PROMPT`, `patientSummarySystemPrompt`,
      and `SUGGESTED_PROMPTS`.
- [x] Add `server/agent/anthropic-tools.ts` translating PR 4's six
      tools into Anthropic SDK shape, plus the terminal `finalize`
      tool whose schema mirrors the AgentAnswer body.
- [x] Add `server/agent/orchestrator.ts` with `runPatientSummary` —
      maxTurns/maxTokens, schema retry, partial-answer fallback,
      logger pass-through, resource-data wrapping.
- [x] Update `tsconfig.node.json` to include the schema/extractor/
      fixture files from `src/agent/` so the server can import them.
- [x] Add `server/routes/answers.ts` with
      `POST /api/sessions/:sid/answer` and a sibling `agentInfoRoutes`
      for `GET /api/agent/status` (no path collision with PR 4's
      `sessionsRoutes`).
- [x] Wire both routes into `server/app.ts`; thread `modelConfig`
      through `ServerDeps`.
- [x] Boot `modelConfigFromEnv()` in `server/index.ts` and log whether
      the agent is ready.
- [x] Update `server/test-utils.ts` to accept an optional `modelConfig`.
- [x] Tests in `server/agent/orchestrator.test.ts`:
      - happy path
      - system prompt + caching
      - unauthorized-patient passthrough
      - schema retry then fallback
      - schema retry recovery
      - max-turn fallback
      - end-turn fallback
      - prompt-injection ignored
      - unknown tool name handled
- [x] Frontend `src/api/sessions.ts`: add `getAgentStatus` and
      `runPatientSummary`.
- [x] Frontend `src/pages/SessionPage.tsx`: add `AgentPanel` (Run
      button, status text, hint, validated render via PR 5's
      `AgentAnswerRenderer`).
- [x] Add `docs/agent-loop.md`.
- [x] Add OpenSpec change `add-patient-summary-agent/{proposal,
      requirements,tasks,acceptance}.md`.
- [x] `pnpm -r typecheck`, `pnpm -r test:run`, and the workbench build
      all pass.
