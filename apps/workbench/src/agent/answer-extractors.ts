import {
  parseResourceReference,
  type AgentAnswer,
  type AnswerResourceType,
  type EvidenceBackedClaim,
  type ResourceReference,
} from "./answer-schema.js";

/**
 * Flat list of every cited reference across every claim, in claim order.
 * Duplicates are preserved so callers can see "this Condition was cited
 * three times". Use `dedupeReferences` to collapse.
 */
export function citedReferences(answer: AgentAnswer): ResourceReference[] {
  return answer.claims.flatMap((c) => c.evidence);
}

export function dedupeReferences(refs: ResourceReference[]): ResourceReference[] {
  const seen = new Set<string>();
  const out: ResourceReference[] = [];
  for (const r of refs) {
    if (seen.has(r.reference)) continue;
    seen.add(r.reference);
    out.push(r);
  }
  return out;
}

/**
 * Map of resource type → number of distinct resources cited. Useful for
 * the renderer's "evidence summary" section and for PR 8's eval metrics.
 */
export function evidenceCountsByType(
  answer: AgentAnswer,
): Record<AnswerResourceType, number> {
  const initial: Record<AnswerResourceType, number> = {
    Patient: 0,
    Condition: 0,
    MedicationRequest: 0,
    AllergyIntolerance: 0,
    Encounter: 0,
    Observation: 0,
  };
  for (const ref of dedupeReferences(citedReferences(answer))) {
    const parsed = parseResourceReference(ref.reference);
    if (parsed) initial[parsed.resourceType] += 1;
  }
  return initial;
}

/**
 * The number of supported claims that don't cite any evidence. This must
 * always return 0 for a schema-valid answer — the schema enforces
 * `evidence.min(1)`. PR 8's eval harness reports this as a sanity metric
 * for non-validated outputs (e.g. raw LLM JSON before parse).
 */
export function unsupportedClaimCount(
  claims: ReadonlyArray<{ evidence: readonly unknown[] }>,
): number {
  return claims.filter((c) => c.evidence.length === 0).length;
}

/** Distinct claim ids cited by their text. Surfaces accidental dupes. */
export function duplicateClaimIds(answer: AgentAnswer): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const c of answer.claims) {
    if (seen.has(c.id)) dups.add(c.id);
    else seen.add(c.id);
  }
  return [...dups];
}

/**
 * The renderer wants to link `Condition/abc-123` to the resource viewer at
 * `/connections/:cid/patients/:pid/Condition/abc-123`. Returns null for a
 * malformed reference (which the schema would already have rejected).
 */
export function resourceViewerHref(
  answer: AgentAnswer,
  ref: ResourceReference,
): string | null {
  const parsed = parseResourceReference(ref.reference);
  if (!parsed) return null;
  return `/connections/${encodeURIComponent(answer.connectionId)}/patients/${encodeURIComponent(answer.patientId)}/${parsed.resourceType}/${encodeURIComponent(parsed.id)}`;
}

/** Convenience: the unique evidence references in citation order. */
export function uniqueEvidence(claim: EvidenceBackedClaim): ResourceReference[] {
  return dedupeReferences(claim.evidence);
}
