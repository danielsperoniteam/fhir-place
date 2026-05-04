import type { StructureDefinition } from "fhir/r4";

/**
 * Bundled R4 Patient StructureDefinition used as the last-resort fallback by
 * `resolveStructureDefinition` when the target server doesn't store / expose
 * the core FHIR SDs (e.g. the public HAPI instance at https://hapi.fhir.org).
 *
 * Covers the elements the generic view/edit/search components actually use.
 * Consumers who need the full official snapshot can pass their own SD via the
 * `structureDefinition` prop on `<ResourceView>` / `<ResourceEditor>`.
 */
export const PatientStructureDefinition: StructureDefinition = {
  resourceType: "StructureDefinition",
  id: "Patient",
  url: "http://hl7.org/fhir/StructureDefinition/Patient",
  name: "Patient",
  status: "active",
  kind: "resource",
  abstract: false,
  type: "Patient",
  baseDefinition: "http://hl7.org/fhir/StructureDefinition/DomainResource",
  derivation: "specialization",
  snapshot: {
    element: [
      { id: "Patient", path: "Patient", min: 0, max: "*", short: "Information about an individual or animal receiving health care services" },
      { id: "Patient.id", path: "Patient.id", min: 0, max: "1", short: "Logical id of this artifact", type: [{ code: "id" }] },
      { id: "Patient.meta", path: "Patient.meta", min: 0, max: "1", short: "Metadata about the resource", type: [{ code: "Meta" }] },
      { id: "Patient.identifier", path: "Patient.identifier", min: 0, max: "*", short: "An identifier for this patient", type: [{ code: "Identifier" }] },
      { id: "Patient.active", path: "Patient.active", min: 0, max: "1", short: "Whether this patient's record is in active use", type: [{ code: "boolean" }] },
      { id: "Patient.name", path: "Patient.name", min: 0, max: "*", short: "A name associated with the patient", type: [{ code: "HumanName" }] },
      { id: "Patient.telecom", path: "Patient.telecom", min: 0, max: "*", short: "A contact detail for the individual", type: [{ code: "ContactPoint" }] },
      { id: "Patient.gender", path: "Patient.gender", min: 0, max: "1", short: "male | female | other | unknown", type: [{ code: "code" }], binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender" } },
      { id: "Patient.birthDate", path: "Patient.birthDate", min: 0, max: "1", short: "The date of birth for the individual", type: [{ code: "date" }] },
      { id: "Patient.deceased[x]", path: "Patient.deceased[x]", min: 0, max: "1", short: "Indicates if the individual is deceased or not", type: [{ code: "boolean" }, { code: "dateTime" }] },
      { id: "Patient.address", path: "Patient.address", min: 0, max: "*", short: "An address for the individual", type: [{ code: "Address" }] },
      { id: "Patient.maritalStatus", path: "Patient.maritalStatus", min: 0, max: "1", short: "Marital (civil) status", type: [{ code: "CodeableConcept" }], binding: { strength: "extensible", valueSet: "http://hl7.org/fhir/ValueSet/marital-status" } },
      { id: "Patient.multipleBirth[x]", path: "Patient.multipleBirth[x]", min: 0, max: "1", short: "Whether patient is part of a multiple birth", type: [{ code: "boolean" }, { code: "integer" }] },
      { id: "Patient.photo", path: "Patient.photo", min: 0, max: "*", short: "Image of the patient", type: [{ code: "Attachment" }] },
      { id: "Patient.contact", path: "Patient.contact", min: 0, max: "*", short: "A contact party for the patient", type: [{ code: "BackboneElement" }] },
      { id: "Patient.contact.relationship", path: "Patient.contact.relationship", min: 0, max: "*", short: "The kind of relationship", type: [{ code: "CodeableConcept" }], binding: { strength: "extensible", valueSet: "http://hl7.org/fhir/ValueSet/patient-contactrelationship" } },
      { id: "Patient.contact.name", path: "Patient.contact.name", min: 0, max: "1", short: "A name associated with the contact person", type: [{ code: "HumanName" }] },
      { id: "Patient.contact.telecom", path: "Patient.contact.telecom", min: 0, max: "*", short: "A contact detail for the person", type: [{ code: "ContactPoint" }] },
      { id: "Patient.contact.address", path: "Patient.contact.address", min: 0, max: "1", short: "Address for the contact person", type: [{ code: "Address" }] },
      { id: "Patient.contact.gender", path: "Patient.contact.gender", min: 0, max: "1", short: "male | female | other | unknown", type: [{ code: "code" }], binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender" } },
      { id: "Patient.communication", path: "Patient.communication", min: 0, max: "*", short: "A language which may be used to communicate with the patient", type: [{ code: "BackboneElement" }] },
      { id: "Patient.communication.language", path: "Patient.communication.language", min: 1, max: "1", short: "The language which can be used", type: [{ code: "CodeableConcept" }] },
      { id: "Patient.communication.preferred", path: "Patient.communication.preferred", min: 0, max: "1", short: "Preferred language for the patient", type: [{ code: "boolean" }] },
      { id: "Patient.generalPractitioner", path: "Patient.generalPractitioner", min: 0, max: "*", short: "Patient's primary care provider", type: [{ code: "Reference" }] },
      { id: "Patient.managingOrganization", path: "Patient.managingOrganization", min: 0, max: "1", short: "Organization that is the custodian of the patient record", type: [{ code: "Reference" }] },
    ],
  },
};
