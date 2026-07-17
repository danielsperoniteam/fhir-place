import type {
  AllergyIntolerance,
  Bundle,
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
  StructureDefinition,
} from "fhir/r4";

const patient = (
  id: string,
  overrides: Partial<Patient> = {},
): Patient => ({
  resourceType: "Patient",
  id,
  meta: { versionId: "1", lastUpdated: "2024-10-01T12:00:00Z" },
  active: true,
  text: {
    status: "generated",
    div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>Synthetic test patient ${id}</p></div>`,
  },
  ...overrides,
});

export const patients: Patient[] = [
  patient("ada", {
    name: [{ use: "official", given: ["Ada"], family: "Lovelace" }],
    gender: "female",
    birthDate: "1815-12-10",
    deceasedDateTime: "1852-11-27",
    telecom: [
      { system: "email", value: "ada@example.com", use: "home" },
      { system: "phone", value: "+44 20 7946 0123", use: "home" },
    ],
    address: [
      {
        use: "home",
        line: ["1 Workhouse Lane"],
        city: "London",
        country: "UK",
      },
    ],
    identifier: [
      {
        system: "http://hospital.example.org/mrn",
        value: "MRN-0001",
        use: "usual",
      },
    ],
  }),
  patient("turing", {
    name: [{ use: "official", given: ["Alan", "Mathison"], family: "Turing" }],
    gender: "male",
    birthDate: "1912-06-23",
    telecom: [{ system: "email", value: "alan@example.com" }],
    address: [
      { line: ["2 King's College"], city: "Cambridge", country: "UK" },
    ],
  }),
  patient("hopper", {
    name: [{ use: "official", given: ["Grace"], family: "Hopper" }],
    gender: "female",
    birthDate: "1906-12-09",
    telecom: [{ system: "phone", value: "+1 555 0100" }],
  }),
  patient("lamarr", {
    name: [{ use: "official", given: ["Hedy"], family: "Lamarr" }],
    gender: "female",
    birthDate: "1914-11-09",
  }),
  // Synthetic bulk fixtures so pagination is demonstrable (one page = _count=20).
  ...Array.from({ length: 32 }, (_, i) => {
    const idx = i + 1;
    const givens = ["Alex", "Bailey", "Casey", "Dakota", "Ellis", "Finley", "Gael", "Harper"];
    const families = ["Nguyen", "Patel", "Garcia", "Kim", "Smith", "Johnson", "Martinez", "Wilson"];
    const given = givens[idx % givens.length]!;
    const family = families[idx % families.length]!;
    return patient(`syn-${idx}`, {
      name: [{ use: "official", given: [given], family }],
      gender: idx % 2 === 0 ? "female" : "male",
      birthDate: `19${40 + (idx % 60)}-0${1 + (idx % 9)}-${10 + (idx % 18)}`,
    });
  }),
];

export const observationsFor = (patientId: string): Observation[] => {
  if (patientId !== "ada") return [];
  const subject = { reference: "Patient/ada", display: "Ada Lovelace" };
  return [
    {
      resourceType: "Observation",
      id: "obs-hr-ada",
      status: "final",
      code: {
        coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }],
        text: "Heart rate",
      },
      subject,
      effectiveDateTime: "2024-09-15T09:00:00Z",
      valueQuantity: { value: 72, unit: "beats/minute", system: "http://unitsofmeasure.org", code: "/min" },
    },
    {
      resourceType: "Observation",
      id: "obs-bp-ada",
      status: "final",
      code: {
        coding: [{ system: "http://loinc.org", code: "85354-9", display: "Blood pressure panel" }],
        text: "Blood pressure",
      },
      subject,
      effectiveDateTime: "2024-09-15T09:02:00Z",
      valueQuantity: { value: 128, unit: "mmHg", system: "http://unitsofmeasure.org", code: "mm[Hg]" },
    },
    {
      resourceType: "Observation",
      id: "obs-wt-ada",
      status: "final",
      code: {
        coding: [{ system: "http://loinc.org", code: "29463-7", display: "Body weight" }],
        text: "Body weight",
      },
      subject,
      effectiveDateTime: "2024-09-10T08:00:00Z",
      valueQuantity: { value: 68, unit: "kg", system: "http://unitsofmeasure.org", code: "kg" },
    },
  ];
};

const adaSubject = { reference: "Patient/ada", display: "Ada Lovelace" };
const adaPatientRef = { reference: "Patient/ada", display: "Ada Lovelace" };

export const conditionsFor = (patientId: string): Condition[] => {
  if (patientId !== "ada") return [];
  return [
    {
      resourceType: "Condition",
      id: "cond-htn-ada",
      clinicalStatus: { text: "active" },
      verificationStatus: { text: "confirmed" },
      // Dual-coded on purpose (#367): real-world Conditions routinely carry
      // SNOMED + ICD-10-CM in parallel; the demo needs one so multi-coding
      // rendering is visible against the mock.
      code: {
        text: "Essential hypertension",
        coding: [
          {
            system: "http://snomed.info/sct",
            code: "59621000",
            display: "Essential hypertension (disorder)",
            userSelected: true,
          },
          {
            system: "http://hl7.org/fhir/sid/icd-10-cm",
            code: "I10",
            display: "Essential (primary) hypertension",
          },
        ],
      },
      subject: adaSubject,
      onsetDateTime: "2022-03-14",
    },
    {
      resourceType: "Condition",
      id: "cond-mig-ada",
      clinicalStatus: { text: "remission" },
      code: { text: "Migraine with aura" },
      subject: adaSubject,
      onsetDateTime: "2018-08-01",
    },
  ];
};

export const medicationRequestsFor = (patientId: string): MedicationRequest[] => {
  if (patientId !== "ada") return [];
  return [
    {
      resourceType: "MedicationRequest",
      id: "mr-lis-ada",
      status: "active",
      intent: "order",
      medicationCodeableConcept: { text: "Lisinopril 20 mg oral tablet" },
      subject: adaSubject,
      authoredOn: "2024-02-05T09:00:00Z",
    },
    {
      resourceType: "MedicationRequest",
      id: "mr-sum-ada",
      status: "completed",
      intent: "order",
      medicationCodeableConcept: { text: "Sumatriptan 50 mg oral tablet" },
      subject: adaSubject,
      authoredOn: "2018-08-12T14:00:00Z",
    },
    // Reference-style order — exercises `medication[x]` choice resolution
    // in the table column. Many production EHRs reference a Medication
    // resource rather than embedding a CodeableConcept; hard-pinning the
    // column to medicationCodeableConcept used to render a blank cell here
    // (#372).
    {
      resourceType: "MedicationRequest",
      id: "mr-amox-ada",
      status: "active",
      intent: "order",
      medicationReference: {
        reference: "Medication/med-amox",
        display: "Amoxicillin 500 mg oral capsule",
      },
      subject: adaSubject,
      authoredOn: "2024-03-12T11:15:00Z",
    },
  ];
};

export const allergiesFor = (patientId: string): AllergyIntolerance[] => {
  if (patientId !== "ada") return [];
  return [
    {
      resourceType: "AllergyIntolerance",
      id: "ai-pen-ada",
      clinicalStatus: { text: "active" },
      verificationStatus: { text: "confirmed" },
      criticality: "high",
      code: { text: "Penicillin" },
      patient: adaPatientRef,
      reaction: [
        { manifestation: [{ text: "Hives" }], severity: "moderate" },
      ],
    },
  ];
};

export const proceduresFor = (patientId: string): Procedure[] => {
  if (patientId !== "ada") return [];
  return [
    {
      resourceType: "Procedure",
      id: "proc-colonoscopy-ada",
      status: "completed",
      code: { text: "Screening colonoscopy" },
      subject: adaSubject,
      performedDateTime: "2023-11-02T10:30:00Z",
    },
    // Synthea and many production servers emit `performedPeriod` instead of
    // `performedDateTime`. Keep one of each so the Procedure list view can
    // prove both choice variants render in the "Performed" column (#476).
    {
      resourceType: "Procedure",
      id: "proc-physio-ada",
      status: "completed",
      code: { text: "Physical therapy" },
      subject: adaSubject,
      performedPeriod: { start: "2022-02-01", end: "2022-06-30" },
    },
  ];
};

export const encountersFor = (patientId: string): Encounter[] => {
  if (patientId !== "ada") return [];
  return [
    {
      resourceType: "Encounter",
      id: "enc-annual-ada",
      status: "finished",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatory" },
      subject: adaSubject,
      period: { start: "2024-09-15T09:00:00Z", end: "2024-09-15T09:45:00Z" },
    },
    {
      resourceType: "Encounter",
      id: "enc-er-ada",
      status: "finished",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "EMER", display: "emergency" },
      subject: adaSubject,
      period: { start: "2018-08-12T13:30:00Z", end: "2018-08-12T17:10:00Z" },
    },
  ];
};

export const immunizationsFor = (patientId: string): Immunization[] => {
  if (patientId !== "ada") return [];
  return [
    {
      resourceType: "Immunization",
      id: "imm-flu-ada",
      status: "completed",
      vaccineCode: { text: "Influenza, seasonal" },
      patient: adaPatientRef,
      occurrenceDateTime: "2024-10-04T08:30:00Z",
    },
  ];
};

export const diagnosticReportsFor = (patientId: string): DiagnosticReport[] => {
  if (patientId !== "ada") return [];
  return [
    {
      resourceType: "DiagnosticReport",
      id: "dr-lipids-ada",
      status: "final",
      category: [{ text: "Laboratory" }],
      code: { text: "Lipid panel" },
      subject: adaSubject,
      effectiveDateTime: "2024-09-15T09:10:00Z",
      issued: "2024-09-15T11:30:00Z",
    },
    {
      resourceType: "DiagnosticReport",
      id: "dr-echo-ada",
      status: "final",
      category: [{ text: "Cardiology" }],
      code: { text: "Echocardiography report" },
      subject: adaSubject,
      effectiveDateTime: "2023-10-12T14:00:00Z",
      issued: "2023-10-12T16:45:00Z",
    },
  ];
};

export const carePlansFor = (patientId: string): CarePlan[] => {
  if (patientId !== "ada") return [];
  return [
    {
      resourceType: "CarePlan",
      id: "cp-cardiac-ada",
      status: "active",
      intent: "plan",
      title: "Cardiovascular risk reduction",
      category: [{ text: "Chronic disease management" }],
      subject: adaSubject,
      period: { start: "2024-09-15" },
    },
    {
      resourceType: "CarePlan",
      id: "cp-migraine-ada",
      status: "completed",
      intent: "plan",
      title: "Migraine self-management",
      category: [{ text: "Neurology" }],
      subject: adaSubject,
      period: { start: "2018-08-12", end: "2019-02-12" },
    },
  ];
};

export const searchBundle = <T extends Resource>(
  resources: T[],
): Bundle<T> => ({
  resourceType: "Bundle",
  type: "searchset",
  total: resources.length,
  entry: resources.map((r) => ({ resource: r, fullUrl: `${r.resourceType}/${r.id}` })),
});

/** Minimal Patient SD trimmed to the elements our fixtures populate. */
export const patientStructureDefinition: StructureDefinition = {
  resourceType: "StructureDefinition",
  id: "Patient",
  url: "http://hl7.org/fhir/StructureDefinition/Patient",
  name: "Patient",
  status: "active",
  kind: "resource",
  abstract: false,
  type: "Patient",
  snapshot: {
    element: [
      { id: "Patient", path: "Patient", min: 0, max: "*" },
      { id: "Patient.id", path: "Patient.id", min: 0, max: "1", short: "Logical id", type: [{ code: "id" }] },
      { id: "Patient.meta", path: "Patient.meta", min: 0, max: "1", short: "Metadata", type: [{ code: "Meta" }] },
      { id: "Patient.identifier", path: "Patient.identifier", min: 0, max: "*", short: "An identifier for this patient", type: [{ code: "Identifier" }] },
      { id: "Patient.active", path: "Patient.active", min: 0, max: "1", short: "Record active", type: [{ code: "boolean" }] },
      { id: "Patient.name", path: "Patient.name", min: 0, max: "*", short: "Name", type: [{ code: "HumanName" }] },
      { id: "Patient.telecom", path: "Patient.telecom", min: 0, max: "*", short: "Contact detail", type: [{ code: "ContactPoint" }] },
      { id: "Patient.gender", path: "Patient.gender", min: 0, max: "1", short: "male | female | other | unknown", type: [{ code: "code" }] },
      { id: "Patient.birthDate", path: "Patient.birthDate", min: 0, max: "1", short: "Birth date", type: [{ code: "date" }] },
      { id: "Patient.deceased[x]", path: "Patient.deceased[x]", min: 0, max: "1", short: "Deceased", type: [{ code: "boolean" }, { code: "dateTime" }] },
      { id: "Patient.address", path: "Patient.address", min: 0, max: "*", short: "Address", type: [{ code: "Address" }] },
    ],
  },
};

export const observationStructureDefinition: StructureDefinition = {
  resourceType: "StructureDefinition",
  id: "Observation",
  url: "http://hl7.org/fhir/StructureDefinition/Observation",
  name: "Observation",
  status: "active",
  kind: "resource",
  abstract: false,
  type: "Observation",
  snapshot: {
    element: [
      { id: "Observation", path: "Observation", min: 0, max: "*" },
      { id: "Observation.id", path: "Observation.id", min: 0, max: "1", type: [{ code: "id" }] },
      { id: "Observation.status", path: "Observation.status", min: 1, max: "1", short: "registered | preliminary | final | …", type: [{ code: "code" }] },
      { id: "Observation.code", path: "Observation.code", min: 1, max: "1", short: "What was observed", type: [{ code: "CodeableConcept" }] },
      { id: "Observation.subject", path: "Observation.subject", min: 0, max: "1", short: "Who / what this is about", type: [{ code: "Reference" }] },
      { id: "Observation.effective[x]", path: "Observation.effective[x]", min: 0, max: "1", short: "Clinically relevant time", type: [{ code: "dateTime" }, { code: "Period" }] },
      { id: "Observation.value[x]", path: "Observation.value[x]", min: 0, max: "1", short: "Observation value", type: [{ code: "Quantity" }, { code: "CodeableConcept" }, { code: "string" }, { code: "boolean" }, { code: "Range" }, { code: "Ratio" }] },
    ],
  },
};

const mkSd = (
  type: string,
  elements: Array<{
    path: string;
    short?: string;
    /** Single-type shorthand. Use `types` for choice elements with multiple variants. */
    type?: string;
    /** Multi-type list for choice elements (paths ending in `[x]`). */
    types?: string[];
    array?: boolean;
  }>,
): StructureDefinition => ({
  resourceType: "StructureDefinition",
  id: type,
  url: `http://hl7.org/fhir/StructureDefinition/${type}`,
  name: type,
  status: "active",
  kind: "resource",
  abstract: false,
  type,
  snapshot: {
    element: [
      { id: type, path: type, min: 0, max: "*" },
      { id: `${type}.id`, path: `${type}.id`, min: 0, max: "1", type: [{ code: "id" }] },
      { id: `${type}.meta`, path: `${type}.meta`, min: 0, max: "1", type: [{ code: "Meta" }] },
      ...elements.map((e) => {
        const types = e.types ?? (e.type ? [e.type] : undefined);
        return {
          id: `${type}.${e.path}`,
          path: `${type}.${e.path}`,
          min: 0,
          max: e.array ? "*" : "1",
          ...(e.short ? { short: e.short } : {}),
          ...(types ? { type: types.map((code) => ({ code })) } : {}),
        };
      }),
    ],
  },
});

/** Minimal SDs for the compartment resource types the demo lists under a Patient. */
export const compartmentStructureDefinitions: StructureDefinition[] = [
  mkSd("Condition", [
    { path: "clinicalStatus", short: "active | recurrence | relapse | inactive | remission | resolved", type: "CodeableConcept" },
    { path: "verificationStatus", short: "unconfirmed | provisional | differential | confirmed | refuted | entered-in-error", type: "CodeableConcept" },
    { path: "code", short: "Identification of the condition", type: "CodeableConcept" },
    { path: "subject", short: "Who the condition is about", type: "Reference" },
    // Declare onset as the FHIR `[x]` choice so columns / detail views resolve
    // every variant (#372).
    { path: "onset[x]", short: "Estimated or actual date, date-time, or age", types: ["dateTime", "Age", "Period", "Range", "string"] },
  ]),
  mkSd("MedicationRequest", [
    { path: "status", short: "active | on-hold | cancelled | completed | entered-in-error | stopped | draft | unknown", type: "code" },
    { path: "intent", short: "proposal | plan | order | original-order | reflex-order | filler-order | instance-order | option", type: "code" },
    { path: "priority", short: "routine | urgent | asap | stat", type: "code" },
    // Spec-correct choice element. Hard-pinning to medicationCodeableConcept
    // hid the active medication for any reference-style order (#372).
    { path: "medication[x]", short: "Medication to be taken", types: ["CodeableConcept", "Reference"] },
    { path: "subject", short: "Who the medication is for", type: "Reference" },
    { path: "authoredOn", short: "When the request was initially authored", type: "dateTime" },
  ]),
  mkSd("AllergyIntolerance", [
    { path: "clinicalStatus", short: "active | inactive | resolved", type: "CodeableConcept" },
    { path: "verificationStatus", short: "unconfirmed | confirmed | refuted | entered-in-error", type: "CodeableConcept" },
    { path: "criticality", short: "low | high | unable-to-assess", type: "code" },
    { path: "code", short: "Code that identifies the allergy or intolerance", type: "CodeableConcept" },
    { path: "patient", short: "Who the sensitivity is for", type: "Reference" },
    { path: "reaction", short: "Adverse reaction events linked to exposure to substance", type: "BackboneElement", array: true },
    { path: "reaction.manifestation", short: "Clinical symptoms/signs associated with the event", type: "CodeableConcept", array: true },
    { path: "reaction.severity", short: "mild | moderate | severe", type: "code" },
  ]),
  mkSd("Procedure", [
    { path: "status", short: "preparation | in-progress | not-done | on-hold | stopped | completed | entered-in-error | unknown", type: "code" },
    { path: "code", short: "Identification of the procedure", type: "CodeableConcept" },
    { path: "subject", short: "Who the procedure was performed on", type: "Reference" },
    // Choice element — performed[x] covers DateTime, Period, String, Age, Range.
    { path: "performed[x]", short: "When the procedure was performed", types: ["dateTime", "Period", "string", "Age", "Range"] },
  ]),
  mkSd("Encounter", [
    { path: "status", short: "planned | arrived | triaged | in-progress | onleave | finished | cancelled | entered-in-error | unknown", type: "code" },
    { path: "class", short: "Classification of the encounter", type: "Coding" },
    { path: "subject", short: "The patient or group present", type: "Reference" },
    { path: "period", short: "Start and end time of the encounter", type: "Period" },
  ]),
  mkSd("Immunization", [
    { path: "status", short: "completed | entered-in-error | not-done", type: "code" },
    { path: "vaccineCode", short: "Vaccine product administered", type: "CodeableConcept" },
    { path: "patient", short: "Who was immunised", type: "Reference" },
    // Choice element — occurrence[x] covers DateTime and String per FHIR R4.
    { path: "occurrence[x]", short: "When the vaccine was administered", types: ["dateTime", "string"] },
  ]),
  mkSd("DiagnosticReport", [
    { path: "status", short: "registered | partial | preliminary | final | amended | corrected | appended | cancelled | entered-in-error | unknown", type: "code" },
    { path: "category", short: "Service category", type: "CodeableConcept", array: true },
    { path: "code", short: "Name/code for this diagnostic report", type: "CodeableConcept" },
    { path: "subject", short: "The subject of the report", type: "Reference" },
    { path: "effectiveDateTime", short: "Clinically relevant time", type: "dateTime" },
    { path: "issued", short: "DateTime this version was made", type: "instant" },
  ]),
  mkSd("CarePlan", [
    { path: "status", short: "draft | active | on-hold | revoked | completed | entered-in-error | unknown", type: "code" },
    { path: "intent", short: "proposal | plan | order | option", type: "code" },
    { path: "title", short: "Human-friendly name for the care plan", type: "string" },
    { path: "category", short: "Type of plan", type: "CodeableConcept", array: true },
    { path: "subject", short: "Who the care plan is for", type: "Reference" },
    { path: "period", short: "Time period plan covers", type: "Period" },
  ]),
];
