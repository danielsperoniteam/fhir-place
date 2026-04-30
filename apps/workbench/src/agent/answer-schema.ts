import { z } from "zod";

/**
 * The Phase A allow-listed FHIR resource types (mirrors the server-side
 * allow-list in `apps/workbench/server/schemas.ts`). An evidence reference
 * outside this list is rejected at the schema boundary.
 */
export const ANSWER_RESOURCE_TYPES = [
  "Patient",
  "Condition",
  "MedicationRequest",
  "AllergyIntolerance",
  "Encounter",
  "Observation",
] as const;
export type AnswerResourceType = (typeof ANSWER_RESOURCE_TYPES)[number];

const RESOURCE_TYPE_GROUP = `(?:${ANSWER_RESOURCE_TYPES.join("|")})`;
const FHIR_ID = String.raw`[A-Za-z0-9\-.]{1,64}`;
export const RESOURCE_REFERENCE_REGEX = new RegExp(
  `^${RESOURCE_TYPE_GROUP}/${FHIR_ID}$`,
);

/**
 * A single FHIR resource the answer cites. The reference is a relative URL
 * (`Condition/abc-123`) so it round-trips to the resource viewer in PR 3
 * without any URL rewriting.
 */
export const ResourceReference = z.object({
  reference: z
    .string()
    .regex(
      RESOURCE_REFERENCE_REGEX,
      "expected `<AllowedType>/<fhir-id>` (e.g. `Condition/abc-123`)",
    ),
  display: z.string().max(200).optional(),
});
export type ResourceReference = z.infer<typeof ResourceReference>;

/**
 * Parsed view of a `ResourceReference.reference` string. Use
 * `parseResourceReference` rather than splitting by hand — anything past
 * the first `/` is part of the id.
 */
export interface ParsedResourceReference {
  resourceType: AnswerResourceType;
  id: string;
}

export function parseResourceReference(
  ref: string,
): ParsedResourceReference | null {
  if (!RESOURCE_REFERENCE_REGEX.test(ref)) return null;
  const slash = ref.indexOf("/");
  return {
    resourceType: ref.slice(0, slash) as AnswerResourceType,
    id: ref.slice(slash + 1),
  };
}

/**
 * A claim the agent supports about the patient. Phase A's hard rule is
 * that supported claims MUST cite at least one resource — the schema
 * enforces this via `.min(1)`, so a malformed answer fails validation
 * before render rather than producing an unverified statement.
 *
 * Missing-data and cannot-determine statements live in their own
 * top-level fields, not here, so an "I don't know" cannot be smuggled
 * through as an evidence-less claim.
 */
export const EvidenceBackedClaim = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(2000),
  evidence: z
    .array(ResourceReference)
    .min(1, "supported claims must cite at least one resource"),
});
export type EvidenceBackedClaim = z.infer<typeof EvidenceBackedClaim>;

export const MissingDataEntry = z.object({
  description: z.string().min(1).max(500),
});
export type MissingDataEntry = z.infer<typeof MissingDataEntry>;

export const CannotDetermineEntry = z.object({
  question: z.string().min(1).max(500),
  why: z.string().min(1).max(500),
});
export type CannotDetermineEntry = z.infer<typeof CannotDetermineEntry>;

/**
 * A redacted summary of a single tool call from the agent loop. Mirrors
 * the shape of `ToolEnvelope` (PR 4) but excludes raw inputs and full
 * data — just the audit-relevant fields. Persistence lands in PR 7.
 */
export const ToolCallSummary = z.object({
  tool: z.string().min(1),
  toolVersion: z.string().min(1),
  ok: z.boolean(),
  reason: z.string().optional(),
  count: z.number().int().nonnegative().optional(),
  truncated: z.boolean().optional(),
  durationMs: z.number().nonnegative(),
  resourceIds: z.array(z.string()).optional(),
});
export type ToolCallSummary = z.infer<typeof ToolCallSummary>;

export const AGENT_ANSWER_SCHEMA_VERSION = "1" as const;

export const AgentAnswer = z.object({
  schemaVersion: z.literal(AGENT_ANSWER_SCHEMA_VERSION),
  sessionId: z.string().min(1),
  connectionId: z.string().min(1),
  patientId: z.string().min(1),
  prompt: z.string().min(1),
  promptVersion: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  /** Short free-text overview. May be empty / omitted. Never load-bearing. */
  summary: z.string().max(2000).optional(),
  claims: z.array(EvidenceBackedClaim),
  missingData: z.array(MissingDataEntry),
  cannotDetermine: z.array(CannotDetermineEntry),
  toolCalls: z.array(ToolCallSummary),
  createdAt: z.string().min(1),
});
export type AgentAnswer = z.infer<typeof AgentAnswer>;

export type AgentAnswerValidation =
  | { ok: true; answer: AgentAnswer }
  | { ok: false; error: string; issues: z.ZodIssue[] };

/** Parse + validate. Use this; the renderer trusts its input. */
export function parseAgentAnswer(input: unknown): AgentAnswerValidation {
  const result = AgentAnswer.safeParse(input);
  if (result.success) return { ok: true, answer: result.data };
  return {
    ok: false,
    error: "AgentAnswer failed schema validation",
    issues: result.error.issues,
  };
}
