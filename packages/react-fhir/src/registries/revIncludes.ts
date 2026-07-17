/**
 * Default incoming-reference ("Referenced by") lookups per resource type
 * (#253). Each entry is a `[resourceType, searchParam]` pair: "resources of
 * type X whose search param Y points at the target resource".
 *
 * The Patient list mirrors the Direction A design's ten defaults. Other
 * types get the highest-signal subset of their compartment; unlisted types
 * resolve to an empty list, which the panel renders as an empty state.
 */

export type RevInclude = readonly [resourceType: string, searchParam: string];

const REGISTRY: Record<string, readonly RevInclude[]> = {
  Patient: [
    ["Encounter", "subject"],
    ["Observation", "subject"],
    ["Observation", "patient"],
    ["Condition", "subject"],
    ["AllergyIntolerance", "patient"],
    ["MedicationRequest", "subject"],
    ["DiagnosticReport", "subject"],
    ["Immunization", "patient"],
    ["CarePlan", "subject"],
    ["Provenance", "target"],
    ["AuditEvent", "entity"],
  ],
  Encounter: [
    ["Observation", "encounter"],
    ["Condition", "encounter"],
    ["Procedure", "encounter"],
    ["DiagnosticReport", "encounter"],
    ["MedicationRequest", "encounter"],
    ["Provenance", "target"],
  ],
  Practitioner: [
    ["PractitionerRole", "practitioner"],
    ["Encounter", "participant"],
    ["MedicationRequest", "requester"],
    ["Provenance", "agent"],
  ],
  Organization: [
    ["Patient", "organization"],
    ["PractitionerRole", "organization"],
    ["Encounter", "service-provider"],
  ],
  Medication: [
    ["MedicationRequest", "medication"],
    ["MedicationAdministration", "medication"],
    ["MedicationDispense", "medication"],
    ["MedicationStatement", "medication"],
  ],
};

/** Default `[resourceType, searchParam]` pairs for a target resource type. */
export function defaultRevIncludes(resourceType: string): readonly RevInclude[] {
  return REGISTRY[resourceType] ?? [];
}
