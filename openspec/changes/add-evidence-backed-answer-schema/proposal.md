# Proposal — `add-evidence-backed-answer-schema`

## Summary

PR 5 of Phase A. Defines `AgentAnswer` (and its supporting types
`EvidenceBackedClaim`, `ResourceReference`, `MissingDataEntry`,
`CannotDetermineEntry`, `ToolCallSummary`) as the source of truth for
every agent output. Adds a renderer, evidence helpers, a known-good
fixture, and a preview page that validates pasted JSON against the
schema before rendering. No LLM yet — that lands in PR 6 against this
schema.

## Motivation

Phase A's safety story rests on three claims:

1. The agent only uses typed, patient-scoped tools (PR 4 ✓).
2. Supported claims must cite source FHIR resources.
3. Missing-data and cannot-determine are explicit, not implicit.

Claims (2) and (3) collapse if the agent's output is free Markdown —
it's trivially possible to write "the patient has diabetes" with no
citation, or to imply "no allergies" when really the data is absent.

Forcing the output through a Zod-validated structure lifts both safety
properties from prompt-engineering to schema enforcement. PR 6's
orchestrator can validate the model's JSON before rendering and either
retry or downgrade to a partial answer; the UI never sees an unvalidated
shape.

## Scope

In:

- `apps/workbench/src/agent/answer-schema.ts` with `AgentAnswer`,
  `EvidenceBackedClaim`, `ResourceReference`, `MissingDataEntry`,
  `CannotDetermineEntry`, `ToolCallSummary`, `parseAgentAnswer`, and
  `parseResourceReference`.
- Resource references restricted to the Phase A allow-list and validated
  as `<AllowedType>/<fhir-id>`.
- `EvidenceBackedClaim.evidence.min(1)` enforced by the schema —
  supported claims without citations fail validation.
- `apps/workbench/src/agent/answer-extractors.ts`:
  `citedReferences`, `dedupeReferences`, `evidenceCountsByType`,
  `unsupportedClaimCount`, `duplicateClaimIds`, `resourceViewerHref`,
  `uniqueEvidence`.
- `apps/workbench/src/agent/AgentAnswerRenderer.tsx`: top-level
  prompt + summary, supported-claims list with type-coloured evidence
  chips that link to the resource viewer, first-class missing-data and
  cannot-determine sections, tool-call timeline.
- `apps/workbench/src/agent/EvidenceChip.tsx` with per-type tones and
  resource-viewer links.
- `apps/workbench/src/agent/fixtures.ts` with `SAMPLE_AGENT_ANSWER`.
- `apps/workbench/src/pages/AnswerPreviewPage.tsx`: paste JSON, live
  validation with structured Zod issue list, render on success.
- `docs/agent-answer.md`.

Out:

- The agent loop, prompt, model wiring (PR 6).
- DB persistence of `AgentAnswer` (PR 7).
- Eval metrics (PR 8).
- Failure-gallery pages built from stored answers (PR 9).
- Confidence weights, streaming partial answers, cross-patient claims.

## Architecture decisions

- **One source of truth, one renderer.** The same `AgentAnswerRenderer`
  is used by the agent (PR 6), the failure gallery (PR 9), the audit
  detail view (PR 7), and the answer-preview page. There is no second
  rendering path.
- **References are FHIR-native, not opaque ids.** A claim points at
  `Condition/abc-123`; the renderer resolves that to
  `/connections/:cid/patients/:pid/Condition/abc-123` and the resource
  viewer (PR 3) opens immediately. PR 7 will persist references in the
  same shape so write-back is a no-op flip later.
- **Supported claims and "missing data" are different shapes.** Phase
  A's no-allergy-data eval depends on this. A claim with empty evidence
  is rejected by the schema, not silently rendered as "I don't know".
- **Renderer never validates.** Validation happens once in
  `parseAgentAnswer`. The renderer's input type is the validated shape,
  enforced by TypeScript. Defence in depth comes from the schema, not
  from defensive runtime checks in the view.
- **`summary` is free text but never load-bearing.** Counts, sections,
  and evidence chips come from structured fields. The summary is for
  humans skimming.

## Safety

- The schema is the choke-point that prevents:
  - claims without evidence,
  - claims with non-allow-listed FHIR types,
  - "missing data" being implicit absence,
  - "cannot determine" being a free-text apology buried in prose.
- The renderer trusts its parsed input; tests guarantee the renderer
  cannot be invoked with an unvalidated shape (TypeScript type) and that
  malformed JSON is caught by `parseAgentAnswer` first.
- No HTML / Markdown is interpolated into the rendered output. The
  renderer composes React elements; user input flows through React's
  default escaping. Fuzzed JSON cannot inject markup.
- `unsupportedClaimCount` is exported as a sanity metric for PR 8 evals;
  for any schema-valid answer it is always 0.

## Non-goals

- Authoring an answer by hand in the UI (the agent emits these; the
  preview page only validates / renders).
- Editing or annotating claims after creation.
- Persistence (PR 7).
- Streaming or partial-answer rendering.
- Confidence scores.
- Multi-patient or cross-patient claims.
