import type { CompartmentSectionProps } from "./components/CompartmentSection.js";

/**
 * Ordered list of resource types shown under a Patient's detail view, with the
 * columns + explicit headers we want for each. Derived from FHIR R4's Patient
 * compartment — the clinically-useful subset, not every compartment member.
 *
 * Keeping this config local to the demo rather than in the library: it's an
 * app-level editorial decision (which types matter, which columns, what order,
 * how to label them) that every real app will want to tailor.
 *
 * Explicit `columnLabels` override the auto-generated header from the path segment.
 */
export const PATIENT_COMPARTMENT: Array<
  Omit<CompartmentSectionProps, "patientId">
> = [
  {
    resourceType: "Condition",
    title: "Conditions",
    columns: ["clinicalStatus", "code", "onsetDateTime"],
    columnLabels: {
      clinicalStatus: "Status",
      code: "Condition",
      onsetDateTime: "Onset",
    },
  },
  {
    resourceType: "MedicationRequest",
    title: "Medication requests",
    columns: ["status", "medicationCodeableConcept", "authoredOn"],
    columnLabels: {
      status: "Status",
      medicationCodeableConcept: "Medication",
      authoredOn: "Ordered",
    },
  },
  {
    resourceType: "AllergyIntolerance",
    title: "Allergies & intolerances",
    columns: ["clinicalStatus", "code", "reaction.manifestation"],
    columnLabels: {
      clinicalStatus: "Status",
      code: "Code",
      "reaction.manifestation": "Reaction",
    },
  },
  {
    resourceType: "Observation",
    title: "Observations",
    columns: ["status", "code", "effectiveDateTime", "valueQuantity"],
    columnLabels: {
      status: "Status",
      code: "Observation",
      effectiveDateTime: "Observed",
      valueQuantity: "Value",
    },
  },
  {
    resourceType: "Procedure",
    title: "Procedures",
    columns: ["status", "code", "performedDateTime"],
    columnLabels: {
      status: "Status",
      code: "Procedure",
      performedDateTime: "Performed",
    },
  },
  {
    resourceType: "Encounter",
    title: "Encounters",
    columns: ["status", "class.code", "period.start"],
    columnLabels: {
      status: "Status",
      "class.code": "Class",
      "period.start": "Started",
    },
  },
  {
    resourceType: "Immunization",
    title: "Immunizations",
    columns: ["status", "vaccineCode", "occurrenceDateTime"],
    columnLabels: {
      status: "Status",
      vaccineCode: "Vaccine",
      occurrenceDateTime: "Administered",
    },
  },
  {
    resourceType: "Goal",
    title: "Goals",
    columns: ["lifecycleStatus", "description", "target.dueDate"],
    columnLabels: {
      lifecycleStatus: "Status",
      description: "Goal",
      "target.dueDate": "Target Date",
    },
  },
];
