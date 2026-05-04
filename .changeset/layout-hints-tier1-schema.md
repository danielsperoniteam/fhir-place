---
"@fhir-place/react-fhir": minor
---

Add the Tier 1 `LayoutHint` schema and `<HintedDetail>` renderer.

A `LayoutHint` is a data-only description of how a single FHIR resource
type should be displayed in list / detail / create surfaces. Hints are
JSON-serialisable (no closures, no JSX) so they can be shipped from a
server later (see #223).

New exports from `@fhir-place/react-fhir` (also available as the
subpath `@fhir-place/react-fhir/layout-hints`):

- Types: `LayoutHint`, `ListHint`, `DetailHint`, `DetailSection`,
  `CreateHint`, `SearchHint`, `BackboneCollectionHint`, `Tone`,
  `Tier`, `FieldPath`.
- Registry helpers: `getLayoutHint(resourceType)`,
  `getTier(resourceType, bespokeViewKeys?)`, `tier1ResourceTypes()`,
  `LAYOUT_HINTS`.
- Renderer: `<HintedDetail>` composes a hero row + label/value
  sections from `hint.detail`. Falls back gracefully when the hint
  has no detail block; callers should use `<ResourceView>` for Tier 0
  resources.

Ten initial Tier 1 hints ship: Patient, Observation, Condition,
Encounter, MedicationRequest, AllergyIntolerance, DiagnosticReport,
Procedure, Immunization, DocumentReference. Adding a new Tier 1
resource is a matter of dropping another entry into the registry.

This change is additive — `<ResourceView>` and the existing
`renderers.tsx` defaults are unchanged. The `BackboneCollection`
slot in `DetailHint.collections` is reserved for #251 and currently
ignored by `<HintedDetail>`.
