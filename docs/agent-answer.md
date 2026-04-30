# AgentAnswer — the Source of Truth for Agent Output

Phase A's hard constraint is that the agent's output is a structured,
validated, evidence-backed object — never raw Markdown. PR 5 ships the
schema, the renderer, and the helpers. PR 6 will produce instances of
this shape from an LLM; PR 7 will persist them.

## The shape

```ts
interface AgentAnswer {
  schemaVersion: "1";
  sessionId: string;
  connectionId: string;
  patientId: string;
  prompt: string;
  promptVersion?: string;
  model?: string;
  provider?: string;
  summary?: string;                       // never load-bearing
  claims: EvidenceBackedClaim[];          // supported claims (must cite resources)
  missingData: MissingDataEntry[];        // first-class, not an absence
  cannotDetermine: CannotDetermineEntry[]; // first-class, not "I don't know" in prose
  toolCalls: ToolCallSummary[];           // mirror of PR 4 envelopes
  createdAt: string;
}

interface EvidenceBackedClaim {
  id: string;
  text: string;
  evidence: ResourceReference[];   // .min(1) — load-bearing
}

interface ResourceReference {
  reference: string;               // `<AllowedType>/<fhir-id>` only
  display?: string;
}

interface MissingDataEntry { description: string; }
interface CannotDetermineEntry { question: string; why: string; }

interface ToolCallSummary {
  tool: string;
  toolVersion: string;
  ok: boolean;
  reason?: string;       // ToolErrorReason if not ok
  count?: number;        // for searches
  truncated?: boolean;
  durationMs: number;
  resourceIds?: string[];
}
```

## Hard rules (enforced by Zod)

1. **Supported claims must cite at least one resource.**
   `EvidenceBackedClaim.evidence.min(1)` is non-optional. A claim without
   evidence fails validation before render.
2. **Evidence references must be FHIR-style relative URLs against the
   Phase A allow-list.** The regex is `(<AllowedType>)/(<fhir-id>)`
   where `<AllowedType>` is one of:
   `Patient | Condition | MedicationRequest | AllergyIntolerance |
   Encounter | Observation`. Anything else → invalid.
3. **`missingData` and `cannotDetermine` are required top-level arrays.**
   Even when empty, the keys must be present. "I don't know" cannot be
   smuggled in as a free-text claim.
4. **`schemaVersion` is `"1"` exactly.** Older or future versions are
   rejected. Bumping the version is an explicit breaking change.

## Why this shape

- **Refs are FHIR-native, not opaque ids.** `Condition/abc-123` round-
  trips into the resource viewer (PR 3) without URL rewriting. Click an
  evidence chip → see the underlying resource.
- **Audit shape mirrors `Provenance` / `AuditEvent`.** PR 7 will persist
  these as is, plus a row that maps each `claim.id` to its supporting
  resource ids — same vocab the FHIR audit-log resources use, even
  though we never write them back.
- **Missing / cannot-determine are first-class.** A blank `missingData`
  array is meaningfully different from "the agent didn't think about
  it". Fixed schema → comparable evals (PR 8).
- **Free-text `summary` is allowed but never load-bearing.** The
  evaluator never reads it; the renderer never branches on it. It exists
  so a quick scroll yields a readable paragraph.

## Files

| File | What it is |
| --- | --- |
| `src/agent/answer-schema.ts` | Zod schemas + `parseAgentAnswer`. Ground truth. |
| `src/agent/answer-extractors.ts` | `citedReferences`, `dedupeReferences`, `evidenceCountsByType`, `unsupportedClaimCount`, `resourceViewerHref`, etc. |
| `src/agent/AgentAnswerRenderer.tsx` | Renders a *validated* `AgentAnswer`. Never sees raw input. |
| `src/agent/EvidenceChip.tsx` | Type-coloured chip linking to the resource viewer. |
| `src/agent/fixtures.ts` | A known-good `SAMPLE_AGENT_ANSWER`. Used by tests, the preview page, and (in PR 8) golden snapshots. |
| `src/pages/AnswerPreviewPage.tsx` | Paste / edit JSON → live validate → render. |

## How the renderer is invoked

```tsx
const v = parseAgentAnswer(rawJson);
if (!v.ok) return <ValidationErrors issues={v.issues} />;
return <AgentAnswerRenderer answer={v.answer} />;
```

The renderer does not validate, does not parse, does not branch on
shape mismatches. Anything that reaches the renderer has already passed
schema validation; anything that fails goes through the
`AnswerPreviewPage` validation-error UI.

## Phase A icebox

- Free-text Markdown rendering of model output without validation.
- A "natural-language only" answer mode without claims / refs.
- Confidence weights on claims — could be a Phase B addition; not now.
- Streaming partial answers — the renderer is designed for whole answers.
- Cross-patient claims — every reference is patient-scoped.

## What this changes for downstream PRs

- **PR 6 (agent loop):** the model is constrained to emit JSON that
  parses against `AgentAnswer`. The orchestrator validates before
  render; on failure, retries or partial-answer fallback.
- **PR 7 (audit log):** each `AgentAnswer` is persisted as-is on
  `agent_session`; `evidence_claim` and `tool_call` rows map back to
  the structured fields.
- **PR 8 (evals):** `unsupportedClaimCount`, `evidenceCountsByType`, and
  schema validity are cheap metrics that ride this schema.
- **PR 9 (failure gallery):** every gallery case is a stored
  `AgentAnswer` rendered by the same component the live agent uses.
