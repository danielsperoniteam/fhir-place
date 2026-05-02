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
 * Explicit `columnLabels` avoid "Text" showing twice when two columns end in
 * `.text` (e.g. `clinicalStatus.text` + `code.text`).
 */
export const PATIENT_COMPARTMENT: Array<
  Omit<CompartmentSectionProps, "patientId">
> = [
  {
    resourceType: "Condition",
    title: "Conditions",
    columns: ["clinicalStatus.text", "code.text", "onsetDateTime"],
    columnLabels: {
      "clinicalStatus.text": "Status",
      "code.text": "Condition",
      onsetDateTime: "Onset",
    },
  },
  {
    resourceType: "MedicationRequest",
    title: "Medication requests",
    columns: ["status", "medicationCodeableConcept.text", "authoredOn"],
    columnLabels: {
      status: "Status",
      "medicationCodeableConcept.text": "Medication",
      authoredOn: "Ordered",
    },
  },
  {
    resourceType: "AllergyIntolerance",
    title: "Allergies & intolerances",
    columns: ["clinicalStatus.text", "code.text", "reaction.manifestation.text"],
    columnLabels: {
      "clinicalStatus.text": "Status",
      "code.text": "Substance",
      "reaction.manifestation.text": "Reaction",
    },
  },
  {
    resourceType: "Observation",
    title: "Observations",
    columns: ["status", "code.text", "effectiveDateTime", "valueQuantity"],
    columnLabels: {
      status: "Status",
      "code.text": "Observation",
      effectiveDateTime: "Observed",
      valueQuantity: "Value",
    },
  },
  {
    resourceType: "Procedure",
    title: "Procedures",
    columns: ["status", "code.text", "performedDateTime"],
    columnLabels: {
      status: "Status",
      "code.text": "Procedure",
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
    columns: ["status", "vaccineCode.text", "occurrenceDateTime"],
    columnLabels: {
      status: "Status",
      "vaccineCode.text": "Vaccine",
      occurrenceDateTime: "Administered",
    },
  },
  {
    resourceType: "Goal",
    title: "Goals",
    columns: ["lifecycleStatus", "description.text", "target.dueDate"],
    columnLabels: {
      lifecycleStatus: "Status",
      "description.text": "Goal",
      "target.dueDate": "Target Date",
    },
  },
];
