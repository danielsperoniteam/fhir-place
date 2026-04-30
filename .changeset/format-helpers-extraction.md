---
"@fhir-place/react-fhir": minor
---

Extract reusable string-formatters into `src/structure/format.ts`:
`formatHumanName`, `formatAddress`, `formatCoding`,
`formatCodeableConcept`, `formatQuantity`, `formatPeriod`, and
`formatReferenceLabel`. Now exported from
`@fhir-place/react-fhir/structure`.

`renderers.tsx` and `ReferencePicker` use these shared helpers, so a
HumanName rendered in `<ResourceView>` and the same name shown as a
picker label come out identical. Previously the two surfaces had
quietly drifted (the picker's name path didn't strip prefix/suffix).

**Breaking** (pre-1.0): the `referenceLabel` export from
`@fhir-place/react-fhir` is renamed to `formatReferenceLabel`. The new
function has the same signature and slightly broader fallback behaviour
(picks up `coding[0].display` for CodeableConcept-shaped resources, and
falls back to `.title` before `Type/id`).
