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
    columns: ["clinicalStatus", "code", "onset[x]"],
    columnLabels: {
      clinicalStatus: "Status",
      code: "Condition",
      "onset[x]": "Onset",
    },
  },
  {
    resourceType: "MedicationRequest",
    title: "Medication requests",
    columns: ["status", "medication[x]", "authoredOn"],
    columnLabels: {
      status: "Status",
      "medication[x]": "Medication",
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
    columns: ["status", "code", "effectiveDateTime", "value[x]"],
    columnLabels: {
      status: "Status",
      code: "Observation",
      effectiveDateTime: "Observed",
      "value[x]": "Value",
    },
  },
  {
    resourceType: "Procedure",
    title: "Procedures",
    columns: ["status", "code", "performed[x]"],
    columnLabels: {
      status: "Status",
      code: "Procedure",
      "performed[x]": "Performed",
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
    columns: ["status", "vaccineCode", "occurrence[x]"],
    columnLabels: {
      status: "Status",
      vaccineCode: "Vaccine",
      "occurrence[x]": "Administered",
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
