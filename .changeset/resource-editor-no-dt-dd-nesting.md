---
"@fhir-place/react-fhir": patch
---

Fix invalid HTML nesting in `ResourceEditor` that caused React
`validateDOMNesting` warnings on the Patient edit page.

`Field` and `ChoiceField` previously rendered field labels as `<dt>` and
field values as `<dd>`. When a `BackboneElement` (e.g. `Patient.name`)
rendered a nested `FieldGroup` inside the parent `<dd>`, the child `<dt>`
and `<dd>` elements violated the HTML spec (definition list items are only
valid inside `<dl>`).

Replaced `<dt>` with `<div>` (via the renamed `FieldLabel` helper) and
replaced all `<dd>` occurrences with `<div>`. The CSS grid layout on the
`FieldGroup` container is element-agnostic, so the visual result is
unchanged.
