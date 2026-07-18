---
"@fhir-place/react-fhir": patch
---

Fix invalid `<dt>`/`<dd>` DOM nesting in `ResourceEditor`. The editor lays
fields out with CSS grid over `<div>` containers, not a `<dl>`, so the
`<dt>`/`<dd>` elements were invalid HTML — and nested `FieldGroup`s (array
items, BackboneElements) put `<dt>`/`<dd>` inside a parent `<dd>`, tripping
React's `validateDOMNesting` warnings on every edit-page render. Field
labels and values now render as plain `<div>`s; the grid layout is
unchanged.
