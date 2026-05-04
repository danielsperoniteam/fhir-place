---
"@fhir-place/react-fhir": patch
---

Fix ReferenceInput always rendering the fallback text inputs when a Reference element's ElementDefinition carries no `targetProfile` (e.g. bundled core SDs). The search-and-pick ReferencePicker now renders unconditionally; when `targetProfile` is absent a default set of common types (Patient, Practitioner, Organization, Encounter, Location, Device) is offered so the user still gets the search UX rather than raw Type/id text boxes.
