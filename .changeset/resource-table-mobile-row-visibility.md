---
"@fhir-place/react-fhir": patch
---

`ResourceTable` in `auto` layout now picks the active layout from a JS `matchMedia` query and renders only that tree, instead of rendering both and using CSS to hide one. The previous approach left `<tr data-testid="resource-row">` rows in the DOM at iPhone widths with `display: none`, which broke `getByTestId("resource-row").toBeVisible()` in the live smoke test (issue #509, #510, #511). The mobile card list items now also carry `data-testid="resource-row"` — the user-facing "row" semantics are layout-independent. The previous card-only testid `resource-row-card` is removed; scope through the container testid (`resource-table-cards`) to disambiguate which layout is on screen.
