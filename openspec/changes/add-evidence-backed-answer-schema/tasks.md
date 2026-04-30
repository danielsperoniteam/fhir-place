# Tasks — `add-evidence-backed-answer-schema`

- [x] Add Zod schemas to `src/agent/answer-schema.ts`:
      `ResourceReference`, `EvidenceBackedClaim`, `MissingDataEntry`,
      `CannotDetermineEntry`, `ToolCallSummary`, `AgentAnswer`.
- [x] Add `RESOURCE_REFERENCE_REGEX`, `parseResourceReference`,
      `parseAgentAnswer`.
- [x] Add `src/agent/answer-extractors.ts`: `citedReferences`,
      `dedupeReferences`, `evidenceCountsByType`,
      `unsupportedClaimCount`, `duplicateClaimIds`,
      `resourceViewerHref`, `uniqueEvidence`.
- [x] Add `src/agent/fixtures.ts` with `SAMPLE_AGENT_ANSWER` covering
      supported claims, missing data, cannot-determine, and the full
      tool-call timeline.
- [x] Add `src/agent/EvidenceChip.tsx` with per-type tones and
      resource-viewer linking.
- [x] Add `src/agent/AgentAnswerRenderer.tsx` (sections + empty-state
      hints; no validation).
- [x] Add `src/pages/AnswerPreviewPage.tsx`: paste JSON, live
      validation, render on success, structured Zod issue list on
      failure.
- [x] Wire `/sessions/:sid/answer-preview` and `/answer-preview` into
      `App.tsx`; add an `AgentAnswer preview` link from the session
      page.
- [x] Tests:
      - `src/agent/answer-schema.test.ts` (~17 tests)
      - `src/agent/answer-extractors.test.ts` (~10 tests)
      - `src/agent/AgentAnswerRenderer.test.tsx` (7 tests)
- [x] `docs/agent-answer.md`.
- [x] `openspec/changes/add-evidence-backed-answer-schema/{proposal,
      requirements,tasks,acceptance}.md`.
- [x] `pnpm -r typecheck`, `pnpm -r test:run`, and the workbench build
      all pass.
