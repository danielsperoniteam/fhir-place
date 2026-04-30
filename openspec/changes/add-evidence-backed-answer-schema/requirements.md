# Requirements — `add-evidence-backed-answer-schema`

## Functional

- F1. `AgentAnswer` is a Zod schema covering: `schemaVersion: "1"`,
  `sessionId`, `connectionId`, `patientId`, `prompt`, optional
  `promptVersion`, optional `model`, optional `provider`, optional
  `summary`, `claims[]`, `missingData[]`, `cannotDetermine[]`,
  `toolCalls[]`, `createdAt`.
- F2. `EvidenceBackedClaim` is `{ id, text, evidence[] }` and the
  `evidence` array MUST contain at least one entry.
- F3. `ResourceReference.reference` is validated against the regex
  `^(Patient|Condition|MedicationRequest|AllergyIntolerance|Encounter
  |Observation)/[A-Za-z0-9\-\.]{1,64}$`. Anything else fails.
- F4. `MissingDataEntry` is `{ description }`.
  `CannotDetermineEntry` is `{ question, why }`.
- F5. `ToolCallSummary` mirrors PR 4's envelope:
  `{ tool, toolVersion, ok, reason?, count?, truncated?, durationMs,
  resourceIds? }`.
- F6. `parseAgentAnswer(input)` returns
  `{ ok: true, answer } | { ok: false, error, issues }` and never
  throws.
- F7. `parseResourceReference(ref)` returns
  `{ resourceType, id }` for valid references and `null` otherwise.
- F8. The renderer produces:
  - prompt + (optional) summary header,
  - supported-claims list with one node per claim and per-evidence
    chip,
  - first-class missing-data and cannot-determine sections,
  - tool-call timeline with status badges,
  - explicit empty-state hints for sections with zero entries.
- F9. Each evidence chip links to
  `/connections/:cid/patients/:pid/<Type>/<id>` (the PR 3 resource
  viewer URL).
- F10. The answer-preview page validates the textarea contents on every
  change and renders only when `parseAgentAnswer` succeeds.

## Non-functional

- N1. The renderer never invokes Zod or any validation logic; its
  input type is the validated `AgentAnswer`.
- N2. The renderer never interpolates HTML / Markdown — only React
  elements with default-escaped string content.
- N3. The schema is shared logic and lives at
  `apps/workbench/src/agent/answer-schema.ts`. Server-side use (PR 6,
  PR 7) imports the same module.
- N4. Tests cover both schema validation and the renderer, including
  the "no Markdown smuggled into output" property.

## Tests

- T1. `RESOURCE_REFERENCE_REGEX` accepts every Phase A resource type
  and rejects: out-of-list types, lowercase types, missing id, empty
  id, ids with `..`, and ids longer than 64 chars.
- T2. `EvidenceBackedClaim` rejects an empty `evidence` array.
- T3. `AgentAnswer` accepts the fixture, rejects:
  - `schemaVersion !== "1"`,
  - claims without evidence,
  - claims citing a Procedure (out-of-list),
  - missing top-level `missingData` field,
  - empty `prompt`.
- T4. `parseAgentAnswer` returns `ok: true` for the fixture and
  `ok: false` with an `issues` array for invalid input.
- T5. Extractors:
  - `citedReferences` is in claim order;
  - `dedupeReferences` collapses dupes preserving order;
  - `evidenceCountsByType` matches the fixture and ignores duplicates
    across claims;
  - `unsupportedClaimCount` is 0 for any schema-valid answer; matches
    the input for synthetic data;
  - `duplicateClaimIds` returns ids that appear more than once;
  - `resourceViewerHref` builds the right URL or returns null;
  - `uniqueEvidence` dedupes within a claim.
- T6. Renderer tests (SSR via `renderToStaticMarkup`):
  - prompt, summary, and section testIds appear;
  - one `[data-testid="claim"]` per supported claim;
  - every evidence chip carries a resource-viewer `href`;
  - missing-data and cannot-determine entries appear as text;
  - empty sections show an empty-state hint with `*-empty` testId;
  - tool-call badges render `ok` and error reasons + `durationMs`;
  - no Markdown markers (`**`, `#### `) appear in the output.

## Documentation

- D1. `docs/agent-answer.md` documents the shape, hard rules, file
  layout, downstream PR impact, and Phase A icebox.
- D2. The PR description points reviewers to `docs/agent-answer.md`
  and references the OpenSpec change.
