export interface ResourceEditorClinicalSafetyGuardrail {
  readonly resourceType: string;
  readonly title: string;
  readonly fields: readonly string[];
  readonly warning: string;
}

export const RESOURCE_EDITOR_CLINICAL_SAFETY_GUARDRAILS = {
  AllergyIntolerance: {
    resourceType: "AllergyIntolerance",
    title: "Reactions",
    fields: ["criticality", "verificationStatus", "reaction"],
    warning:
      "Keep criticality, verificationStatus, and reaction visible together; this is a fhir-place developer-tool warning, not clinical decision support.",
  },
} as const satisfies Record<string, ResourceEditorClinicalSafetyGuardrail>;

export function resourceEditorClinicalSafetyGuardrailFor(
  resourceType: string,
): ResourceEditorClinicalSafetyGuardrail | undefined {
  return RESOURCE_EDITOR_CLINICAL_SAFETY_GUARDRAILS[
    resourceType as keyof typeof RESOURCE_EDITOR_CLINICAL_SAFETY_GUARDRAILS
  ];
}
