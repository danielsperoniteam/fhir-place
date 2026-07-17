---
"@fhir-place/react-fhir": minor
---

Search-builder modifiers and prefixes (#254 PR B):

- `ResourceSearch` param fields gain a modifier menu narrowed to the modifiers FHIR R4 allows for each search type (`:exact`/`:contains` on string; `:text`/`:not`/`:above`/`:below`/`:in`/`:not-in`/`:of-type` on token; `:identifier` on reference; `:above`/`:below` on uri; `:missing` everywhere). The active modifier rewrites the submitted key (`given:exact=Ada`) and hydrates back from `initialParams`. `:of-type` is offered only when the resolved element is Identifier-backed.
- Modifiers whose value grammar differs from the param's normal input swap the field accordingly and clear an incompatible stale value on switch: `:missing` → true/false select; `:in`/`:not-in` → ValueSet canonical URL; `:of-type` → `system|code|value`; `:text` → free display text; reference `:identifier` → `system|value` (lookup picker hidden). Switching between same-grammar modifiers (`:in` ↔ `:not-in`) keeps the value.
- Number and quantity params get a prefix selector (`eq`/`ne`/`lt`/`le`/`gt`/`ge`/`ap`); date params additionally offer `sa`/`eb`.
- New `structure/searchModifiers` module exports `SEARCH_MODIFIERS_BY_TYPE`, `modifiersForType`, `splitModifierKey`, `joinModifierKey`. Chained keys (`subject:Patient.name`) pass through unsplit — chain support is PR C.

v0 limit (per #254): the form renders one editable input per parameter. A URL carrying two variants of the same base name (`name=Smith&name:exact=John`) shows the last in the form; the underlying query still runs every pasted criterion until the user edits and re-submits.
