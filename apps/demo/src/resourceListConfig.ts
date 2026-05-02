import type {
  AllergyIntolerance,
  Appointment,
  CarePlan,
  CareTeam,
  Condition,
  DiagnosticReport,
  DocumentReference,
  Encounter,
  Goal,
  HumanName,
  Immunization,
  Location,
  Medication,
  MedicationRequest,
  Observation,
  Organization,
  Patient,
  Practitioner,
  Procedure,
  Resource,
  ServiceRequest,
  Task,
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

/** Display order in the FHIR UI sidebar: Patient first, then alphabetical. */
export const TOP_RESOURCE_TYPES = [
  "Patient",
  "AllergyIntolerance",
  "Appointment",
  "CarePlan",
  "CareTeam",
  "Condition",
  "DiagnosticReport",
  "DocumentReference",
  "Encounter",
  "Goal",
  "Immunization",
  "Location",
  "Medication",
  "MedicationRequest",
  "Observation",
  "Organization",
  "Practitioner",
  "Procedure",
  "ServiceRequest",
  "Task",
] as const;

export type TopResourceType = (typeof TOP_RESOURCE_TYPES)[number];

const formatHumanName = (names?: HumanName[]): string => {
  const n = names?.[0];
  if (!n) return "(no name)";
  if (n.text) return n.text;
  return [n.given?.join(" "), n.family].filter(Boolean).join(" ") || "(no name)";
};

const formatPatientName = (p: Patient): string => formatHumanName(p.name);

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
    { path: "code", label: "Observation" },
    { path: "category", label: "Category" },
    { path: "subject.reference", label: "Subject" },
    { path: "effectiveDateTime", label: "Observed" },
    { path: "valueQuantity", label: "Value" },
    { path: "valueString", label: "Value (string)" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "code", "effectiveDateTime", "valueQuantity"],
  formatPrimary: (o) => codeText(o.code) ?? "(no code)",
  formatMeta: (o) => [o.status, o.effectiveDateTime],
};

const CONDITION: ResourceListConfig<Condition> = {
  title: "Conditions",
  singular: "condition",
  priorityParams: ["patient", "code", "category", "clinical-status", "onset-date"],
  tableColumns: [
    { path: "clinicalStatus", label: "Status" },
    { path: "code", label: "Condition" },
    { path: "category", label: "Category" },
    { path: "subject.reference", label: "Subject" },
    { path: "onsetDateTime", label: "Onset" },
    { path: "recordedDate", label: "Recorded" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["clinicalStatus", "code", "onsetDateTime"],
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
    { path: "medicationCodeableConcept", label: "Medication" },
    { path: "subject.reference", label: "Subject" },
    { path: "authoredOn", label: "Ordered" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "medicationCodeableConcept", "authoredOn"],
  formatPrimary: (r) =>
    codeText(r.medicationCodeableConcept) ?? r.medicationReference?.display ?? "(no medication)",
  formatMeta: (r) => [r.status, r.authoredOn],
};

const ALLERGY_INTOLERANCE: ResourceListConfig<AllergyIntolerance> = {
  title: "Allergies & intolerances",
  singular: "allergy",
  priorityParams: ["patient", "code", "clinical-status", "type", "category"],
  tableColumns: [
    { path: "clinicalStatus", label: "Status" },
    { path: "code", label: "Code" },
    { path: "type", label: "Type" },
    { path: "category", label: "Category" },
    { path: "criticality", label: "Criticality" },
    { path: "patient.reference", label: "Patient" },
    { path: "reaction.manifestation", label: "Reaction" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["clinicalStatus", "code", "reaction.manifestation"],
  formatPrimary: (a) => codeText(a.code) ?? "(no substance)",
  formatMeta: (a) => [codeText(a.clinicalStatus), a.criticality],
};

const PROCEDURE: ResourceListConfig<Procedure> = {
  title: "Procedures",
  singular: "procedure",
  priorityParams: ["patient", "code", "status", "date"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "code", label: "Procedure" },
    { path: "subject.reference", label: "Subject" },
    { path: "performedDateTime", label: "Performed" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "code", "performedDateTime"],
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
    { path: "type", label: "Type" },
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
    { path: "vaccineCode", label: "Vaccine" },
    { path: "patient.reference", label: "Patient" },
    { path: "occurrenceDateTime", label: "Administered" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "vaccineCode", "occurrenceDateTime"],
  formatPrimary: (i) => codeText(i.vaccineCode) ?? "(no vaccine)",
  formatMeta: (i) => [i.status, i.occurrenceDateTime],
};

const DIAGNOSTIC_REPORT: ResourceListConfig<DiagnosticReport> = {
  title: "Diagnostic reports",
  singular: "diagnostic report",
  priorityParams: ["patient", "code", "category", "status", "date"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "code", label: "Report" },
    { path: "category", label: "Category" },
    { path: "subject.reference", label: "Subject" },
    { path: "effectiveDateTime", label: "Reported" },
    { path: "issued", label: "Issued" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "code", "effectiveDateTime"],
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

const APPOINTMENT: ResourceListConfig<Appointment> = {
  title: "Appointments",
  singular: "appointment",
  priorityParams: ["patient", "practitioner", "status", "date", "service-type"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "serviceType", label: "Service" },
    { path: "appointmentType", label: "Type" },
    { path: "start", label: "Start" },
    { path: "end", label: "End" },
    { path: "description", label: "Description" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "serviceType", "start"],
  formatPrimary: (a) =>
    codeText(a.serviceType?.[0]) ?? codeText(a.appointmentType) ?? a.description ?? "(appointment)",
  formatMeta: (a) => [a.status, a.start],
};

const CARE_TEAM: ResourceListConfig<CareTeam> = {
  title: "Care teams",
  singular: "care team",
  priorityParams: ["patient", "subject", "status", "category"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "name", label: "Name" },
    { path: "category", label: "Category" },
    { path: "subject.reference", label: "Subject" },
    { path: "period.start", label: "Started" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "name", "period.start"],
  formatPrimary: (c) => c.name ?? codeText(c.category?.[0]) ?? "(care team)",
  formatMeta: (c) => [c.status, c.period?.start],
};

const DOCUMENT_REFERENCE: ResourceListConfig<DocumentReference> = {
  title: "Documents",
  singular: "document",
  priorityParams: ["patient", "type", "category", "status", "date"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "type", label: "Type" },
    { path: "category", label: "Category" },
    { path: "subject.reference", label: "Subject" },
    { path: "date", label: "Date" },
    { path: "description", label: "Description" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "type", "date"],
  formatPrimary: (d) => codeText(d.type) ?? d.description ?? "(document)",
  formatMeta: (d) => [d.status, d.date],
};

const GOAL: ResourceListConfig<Goal> = {
  title: "Goals",
  singular: "goal",
  priorityParams: ["patient", "subject", "lifecycle-status", "category", "start-date"],
  tableColumns: [
    { path: "lifecycleStatus", label: "Status" },
    { path: "description", label: "Goal" },
    { path: "category", label: "Category" },
    { path: "subject.reference", label: "Subject" },
    { path: "target.dueDate", label: "Target date" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["lifecycleStatus", "description", "target.dueDate"],
  formatPrimary: (g) => codeText(g.description) ?? "(goal)",
  formatMeta: (g) => [g.lifecycleStatus, g.target?.[0]?.dueDate],
};

const LOCATION: ResourceListConfig<Location> = {
  title: "Locations",
  singular: "location",
  priorityParams: ["name", "address", "address-city", "type", "status"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "name", label: "Name" },
    { path: "type", label: "Type" },
    { path: "address.city", label: "City" },
    { path: "address.state", label: "State" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "name", "address.city"],
  formatPrimary: (l) => l.name ?? "(location)",
  formatMeta: (l) => [l.status, codeText(l.type?.[0])],
};

const MEDICATION: ResourceListConfig<Medication> = {
  title: "Medications",
  singular: "medication",
  priorityParams: ["code", "status", "form", "manufacturer"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "code", label: "Medication" },
    { path: "form", label: "Form" },
    { path: "manufacturer.reference", label: "Manufacturer" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "code", "form"],
  formatPrimary: (m) => codeText(m.code) ?? "(no code)",
  formatMeta: (m) => [m.status, codeText(m.form)],
};

const ORGANIZATION: ResourceListConfig<Organization> = {
  title: "Organizations",
  singular: "organization",
  priorityParams: ["name", "address-city", "type", "active", "identifier"],
  tableColumns: [
    { path: "active", label: "Active" },
    { path: "name", label: "Name" },
    { path: "type", label: "Type" },
    { path: "address.city", label: "City" },
    { path: "telecom", label: "Telecom" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["active", "name", "type"],
  formatPrimary: (o) => o.name ?? "(organization)",
  formatMeta: (o) => [codeText(o.type?.[0]), o.active === false ? "inactive" : "active"],
};

const PRACTITIONER: ResourceListConfig<Practitioner> = {
  title: "Practitioners",
  singular: "practitioner",
  priorityParams: ["name", "family", "given", "identifier", "active"],
  tableColumns: [
    { path: "active", label: "Active" },
    { path: "name", label: "Name" },
    { path: "gender", label: "Gender" },
    { path: "qualification", label: "Qualification" },
    { path: "telecom", label: "Telecom" },
    { path: "address.city", label: "City" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["active", "name", "qualification"],
  formatPrimary: (p) => formatHumanName(p.name),
  formatMeta: (p) => [p.gender, p.active === false ? "inactive" : "active"],
};

const SERVICE_REQUEST: ResourceListConfig<ServiceRequest> = {
  title: "Service requests",
  singular: "service request",
  priorityParams: ["patient", "code", "status", "intent", "category", "authored"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "intent", label: "Intent" },
    { path: "code", label: "Service" },
    { path: "category", label: "Category" },
    { path: "subject.reference", label: "Subject" },
    { path: "authoredOn", label: "Authored" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "code", "authoredOn"],
  formatPrimary: (s) => codeText(s.code) ?? "(service request)",
  formatMeta: (s) => [s.status, s.authoredOn],
};

const TASK: ResourceListConfig<Task> = {
  title: "Tasks",
  singular: "task",
  priorityParams: ["patient", "subject", "status", "code", "authored-on"],
  tableColumns: [
    { path: "status", label: "Status" },
    { path: "intent", label: "Intent" },
    { path: "code", label: "Task" },
    { path: "for.reference", label: "For" },
    { path: "focus.reference", label: "Focus" },
    { path: "authoredOn", label: "Authored" },
    { path: "id", label: "ID" },
  ],
  defaultVisibleColumns: ["status", "code", "authoredOn"],
  formatPrimary: (t) => codeText(t.code) ?? t.description ?? "(task)",
  formatMeta: (t) => [t.status, t.authoredOn],
};

export const RESOURCE_LIST_CONFIG: Record<TopResourceType, ResourceListConfig> = {
  Patient: PATIENT as ResourceListConfig,
  AllergyIntolerance: ALLERGY_INTOLERANCE as ResourceListConfig,
  Appointment: APPOINTMENT as ResourceListConfig,
  CarePlan: CARE_PLAN as ResourceListConfig,
  CareTeam: CARE_TEAM as ResourceListConfig,
  Condition: CONDITION as ResourceListConfig,
  DiagnosticReport: DIAGNOSTIC_REPORT as ResourceListConfig,
  DocumentReference: DOCUMENT_REFERENCE as ResourceListConfig,
  Encounter: ENCOUNTER as ResourceListConfig,
  Goal: GOAL as ResourceListConfig,
  Immunization: IMMUNIZATION as ResourceListConfig,
  Location: LOCATION as ResourceListConfig,
  Medication: MEDICATION as ResourceListConfig,
  MedicationRequest: MEDICATION_REQUEST as ResourceListConfig,
  Observation: OBSERVATION as ResourceListConfig,
  Organization: ORGANIZATION as ResourceListConfig,
  Practitioner: PRACTITIONER as ResourceListConfig,
  Procedure: PROCEDURE as ResourceListConfig,
  ServiceRequest: SERVICE_REQUEST as ResourceListConfig,
  Task: TASK as ResourceListConfig,
};

export const isTopResourceType = (rt: string): rt is TopResourceType =>
  (TOP_RESOURCE_TYPES as readonly string[]).includes(rt);
