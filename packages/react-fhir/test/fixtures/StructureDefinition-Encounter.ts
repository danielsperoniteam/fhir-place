import type { StructureDefinition } from "fhir/r4";

export const EncounterStructureDefinition: StructureDefinition = {
  resourceType: "StructureDefinition",
  id: "Encounter",
  url: "http://hl7.org/fhir/StructureDefinition/Encounter",
  name: "Encounter",
  status: "active",
  kind: "resource",
  abstract: false,
  type: "Encounter",
  baseDefinition: "http://hl7.org/fhir/StructureDefinition/DomainResource",
  derivation: "specialization",
  snapshot: {
    element: [
      { id: "Encounter", path: "Encounter", min: 0, max: "*", short: "An interaction during which services are provided to the patient" },
      { id: "Encounter.id", path: "Encounter.id", min: 0, max: "1", short: "Logical id of this artifact", type: [{ code: "id" }] },
      { id: "Encounter.meta", path: "Encounter.meta", min: 0, max: "1", short: "Metadata about the resource", type: [{ code: "Meta" }] },
      { id: "Encounter.identifier", path: "Encounter.identifier", min: 0, max: "*", short: "Identifier(s) by which this encounter is known", type: [{ code: "Identifier" }] },
      { id: "Encounter.status", path: "Encounter.status", min: 1, max: "1", short: "planned | arrived | triaged | in-progress | onleave | finished | cancelled | entered-in-error | unknown", type: [{ code: "code" }], binding: { strength: "required", valueSet: "http://hl7.org/fhir/ValueSet/encounter-status" } },
      { id: "Encounter.class", path: "Encounter.class", min: 1, max: "1", short: "Classification of patient encounter", type: [{ code: "Coding" }], binding: { strength: "extensible", valueSet: "http://terminology.hl7.org/ValueSet/v3-ActEncounterCode" } },
      { id: "Encounter.type", path: "Encounter.type", min: 0, max: "*", short: "Specific type of encounter", type: [{ code: "CodeableConcept" }] },
      { id: "Encounter.serviceType", path: "Encounter.serviceType", min: 0, max: "1", short: "Specific type of service", type: [{ code: "CodeableConcept" }] },
      { id: "Encounter.priority", path: "Encounter.priority", min: 0, max: "1", short: "Indicates the urgency of the encounter", type: [{ code: "CodeableConcept" }] },
      { id: "Encounter.subject", path: "Encounter.subject", min: 0, max: "1", short: "The patient or group present at the encounter", type: [{ code: "Reference" }] },
      { id: "Encounter.participant", path: "Encounter.participant", min: 0, max: "*", short: "List of participants involved in the encounter", type: [{ code: "BackboneElement" }] },
      { id: "Encounter.period", path: "Encounter.period", min: 0, max: "1", short: "The start and end time of the encounter", type: [{ code: "Period" }] },
      { id: "Encounter.reasonCode", path: "Encounter.reasonCode", min: 0, max: "*", short: "Coded reason the encounter takes place", type: [{ code: "CodeableConcept" }] },
      { id: "Encounter.reasonReference", path: "Encounter.reasonReference", min: 0, max: "*", short: "Reason the encounter takes place (reference)", type: [{ code: "Reference" }] },
      { id: "Encounter.location", path: "Encounter.location", min: 0, max: "*", short: "List of locations where the patient has been", type: [{ code: "BackboneElement" }] },
      { id: "Encounter.serviceProvider", path: "Encounter.serviceProvider", min: 0, max: "1", short: "The organization (facility) responsible for this encounter", type: [{ code: "Reference" }] },
    ],
  },
};
