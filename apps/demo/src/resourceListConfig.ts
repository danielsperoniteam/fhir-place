import type {
  AllergyIntolerance,
  CarePlan,
  Condition,
  DiagnosticReport,
  Encounter,
  Immunization,
  MedicationRequest,
  Observation,
  Patient,
  Procedure,
  Resource,
} from "fhir/r4";

export interface ResourceListColumn {
  path: string;
  label: string;
}

export interface ResourceListConfig<T extends Resource = Resource> {
  /** Heading on the unscoped index page, e.g. "Patients". */
  title: string;
  /** Used for "+ New {singular}" and empty-state copy. */
  singular: string;
  /** Search params surfaced first by `<ResourceSearch>`. */
  priorityParams: string[];
  /** Columns the column-picker offers. */
  tableColumns: ResourceListColumn[];
  /** Column subset shown by default. */
  defaultVisibleColumns: string[];
  /** Optional list-view title. When omitted the type only renders in table view. */
  formatPrimary?: (resource: T) => string;
  /** Optional list-view metadata items rendered after the title. */
  formatMeta?: (resource: T) => Array<string | undefined | null>;
}

/** Display order in the FHIR UI sidebar. */
export const TOP_RESOURCE_TYPES = [
  "Patient",
  "Observation",
  "Condition",
  "MedicationRequest",
  "AllergyIntolerance",
  "Procedure",
  "Encounter",
  "Immunization",
  "DiagnosticReport",
  "CarePlan",
] as const;

export type TopResourceType = (typeof TOP_RESOURCE_TYPES)[number];

const formatPatientName = (p: Patient): string => {
  const n = p.name?.[0];
  if (!n) return "(no name)";
  if (n.text) return n.text;
  return [n.given?.join(" "), n.family].filter(Boolean).join(" ") || "(no name)";
};

const codeText = (c?: { text?: string; coding?: Array<{ display?: string; code?: string }> }): string | undefined => {
  if (!c) return undefined;
  if (c.text) return c.text;
  const first = c.coding?.[0];
  return first?.display ?? first?.code;
};

const PATIENT: ResourceListConfig<Patient> = {
  title: "Patients",
  singular: "patient",
  priorityParams: ["name", "family", "given", "gender", "birthdate", "address-city"],
  tableColumns: [
    { path: "name", label: "Name" },
    { path: "gender", label: "Gender" },
    { path: "birthDate", label: "Birth date" },
    { path: "address.city", label: "City" },
    { path: "id", label: "ID" },
    { path: "__counts", label: "Resources" },
    { path: "active", label: "Active" },
    { path: "identifier", label: "Identifier" },
    { path: "telecom", label: "Telecom" },
    { path: "address", label: "Address" },
    { path: "address.line", label: "Street" },
    { path: "address.state", label: "State" },
    { path: "address.postalCode", label: "Postal code" },
    { path: "address.country", label: "Country" },
    { path: "maritalStatus", label: "Marital status" },
    { path: "deceasedBoolean", label: "Deceased" },
    { path: "deceasedDateTime", label: "Deceased on" },
    { path: "multipleBirthBoolean", label: "Multiple birth" },
    { path: "multipleBirthInteger", label: "Birth order" },
    { path: "communication", label: "Communication" },
    { path: "generalPractitioner", label: "General practitioner" },
    { path: "managingOrganization", label: "Managing organization" },
    { path: "contact", label: "Contact" },
    { path: "language", label: "Language" },
  ],
  defaultVisibleColumns: ["name", "gender", "birthDate", "address.city", "id", "__counts"],
  formatPrimary: formatPatientName,
  formatMeta: (p) => [p.gender, p.birthDate],
};

const OBSERVATION: ResourceListConfig<Observation> = {
  title: "Observations",
  singular: "observation",
  priorityParams: ["patient", "code", "category", "status", "date"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "code.text", label: "Observation" },
    { path: "category", label: "Category" },
    { path: "subject.reference", label: "Subject" },
    { path: "effectiveDateTime", label: "Observed" },
    { path: "valueQuantity", label: "Value" },
    { path: "valueString", label: "Value (string)" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "code.text", "effectiveDateTime", "valueQuantity"],
  formatPrimary: (o) => codeText(o.code) ?? "(no code)",
  formatMeta: (o) => [o.status, o.effectiveDateTime],
};

const CONDITION: ResourceListConfig<Condition> = {
  title: "Conditions",
  singular: "condition",
  priorityParams: ["patient", "code", "category", "clinical-status", "onset-date"],
  tableColumns: [
    { path: "clinicalStatus.text", label: "Status" },
    { path: "code.text", label: "Condition" },
    { path: "category", label: "Category" },
    { path: "subject.reference", label: "Subject" },
    { path: "onsetDateTime", label: "Onset" },
    { path: "recordedDate", label: "Recorded" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["clinicalStatus.text", "code.text", "onsetDateTime"],
  formatPrimary: (c) => codeText(c.code) ?? "(no code)",
  formatMeta: (c) => [codeText(c.clinicalStatus), c.onsetDateTime],
};

const MEDICATION_REQUEST: ResourceListConfig<MedicationRequest> = {
  title: "Medication requests",
  singular: "medication request",
  priorityParams: ["patient", "code", "status", "intent", "authoredon"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "intent", label: "Intent" },
    { path: "medicationCodeableConcept.text", label: "Medication" },
    { path: "subject.reference", label: "Subject" },
    { path: "authoredOn", label: "Ordered" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "medicationCodeableConcept.text", "authoredOn"],
  formatPrimary: (r) =>
    codeText(r.medicationCodeableConcept) ?? r.medicationReference?.display ?? "(no medication)",
  formatMeta: (r) => [r.status, r.authoredOn],
};

const ALLERGY_INTOLERANCE: ResourceListConfig<AllergyIntolerance> = {
  title: "Allergies & intolerances",
  singular: "allergy",
  priorityParams: ["patient", "code", "clinical-status", "type", "category"],
  tableColumns: [
    { path: "clinicalStatus.text", label: "Status" },
    { path: "code.text", label: "Substance" },
    { path: "type", label: "Type" },
    { path: "category", label: "Category" },
    { path: "criticality", label: "Criticality" },
    { path: "patient.reference", label: "Patient" },
    { path: "reaction.manifestation.text", label: "Reaction" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["clinicalStatus.text", "code.text", "reaction.manifestation.text"],
  formatPrimary: (a) => codeText(a.code) ?? "(no substance)",
  formatMeta: (a) => [codeText(a.clinicalStatus), a.criticality],
};

const PROCEDURE: ResourceListConfig<Procedure> = {
  title: "Procedures",
  singular: "procedure",
  priorityParams: ["patient", "code", "status", "date"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "code.text", label: "Procedure" },
    { path: "subject.reference", label: "Subject" },
    { path: "performedDateTime", label: "Performed" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "code.text", "performedDateTime"],
  formatPrimary: (p) => codeText(p.code) ?? "(no code)",
  formatMeta: (p) => [p.status, p.performedDateTime],
};

const ENCOUNTER: ResourceListConfig<Encounter> = {
  title: "Encounters",
  singular: "encounter",
  priorityParams: ["patient", "status", "class", "type", "date"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "class.code", label: "Class" },
    { path: "type.text", label: "Type" },
    { path: "subject.reference", label: "Subject" },
    { path: "period.start", label: "Started" },
    { path: "period.end", label: "Ended" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "class.code", "period.start"],
  formatPrimary: (e) => codeText(e.type?.[0]) ?? e.class?.code ?? "(encounter)",
  formatMeta: (e) => [e.status, e.period?.start],
};

const IMMUNIZATION: ResourceListConfig<Immunization> = {
  title: "Immunizations",
  singular: "immunization",
  priorityParams: ["patient", "vaccine-code", "status", "date"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "vaccineCode.text", label: "Vaccine" },
    { path: "patient.reference", label: "Patient" },
    { path: "occurrenceDateTime", label: "Administered" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "vaccineCode.text", "occurrenceDateTime"],
  formatPrimary: (i) => codeText(i.vaccineCode) ?? "(no vaccine)",
  formatMeta: (i) => [i.status, i.occurrenceDateTime],
};

const DIAGNOSTIC_REPORT: ResourceListConfig<DiagnosticReport> = {
  title: "Diagnostic reports",
  singular: "diagnostic report",
  priorityParams: ["patient", "code", "category", "status", "date"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "code.text", label: "Report" },
    { path: "category", label: "Category" },
    { path: "subject.reference", label: "Subject" },
    { path: "effectiveDateTime", label: "Reported" },
    { path: "issued", label: "Issued" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "code.text", "effectiveDateTime"],
  formatPrimary: (r) => codeText(r.code) ?? "(no code)",
  formatMeta: (r) => [r.status, r.effectiveDateTime ?? r.issued],
};

const CARE_PLAN: ResourceListConfig<CarePlan> = {
  title: "Care plans",
  singular: "care plan",
  priorityParams: ["patient", "category", "status", "intent", "date"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "intent", label: "Intent" },
    { path: "title", label: "Title" },
    { path: "category", label: "Category" },
    { path: "subject.reference", label: "Subject" },
    { path: "period.start", label: "Started" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "title", "period.start"],
  formatPrimary: (c) => c.title ?? codeText(c.category?.[0]) ?? "(care plan)",
  formatMeta: (c) => [c.status, c.period?.start],
};

export const RESOURCE_LIST_CONFIG: Record<TopResourceType, ResourceListConfig> = {
  Patient: PATIENT as ResourceListConfig,
  Observation: OBSERVATION as ResourceListConfig,
  Condition: CONDITION as ResourceListConfig,
  MedicationRequest: MEDICATION_REQUEST as ResourceListConfig,
  AllergyIntolerance: ALLERGY_INTOLERANCE as ResourceListConfig,
  Procedure: PROCEDURE as ResourceListConfig,
  Encounter: ENCOUNTER as ResourceListConfig,
  Immunization: IMMUNIZATION as ResourceListConfig,
  DiagnosticReport: DIAGNOSTIC_REPORT as ResourceListConfig,
  CarePlan: CARE_PLAN as ResourceListConfig,
};

export const isTopResourceType = (rt: string): rt is TopResourceType =>
  (TOP_RESOURCE_TYPES as readonly string[]).includes(rt);
