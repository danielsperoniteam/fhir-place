---
"@fhir-place/react-fhir": minor
---

Search-builder modifiers and prefixes (#254 PR B):

- `ResourceSearch` param fields gain a modifier menu narrowed to the modifiers FHIR R4 allows for each search type (`:exact`/`:contains` on string, `:text`/`:not`/`:above`/`:below`/`:in`/`:not-in`/`:of-type` on token, `:identifier` on reference, `:above`/`:below` on uri, `:missing` everywhere). The active modifier rewrites the submitted key (`given:exact=Ada`) and hydrates back from `initialParams`.
- `:missing` swaps the value input for a uniform true/false select.
- Number and quantity params get the same prefix selector dates already had (`eq`/`ne`/`lt`/`le`/`gt`/`ge`/`ap`), and the prefix vocabulary gains `sa`/`eb`.
- New `structure/searchModifiers` module exports `SEARCH_MODIFIERS_BY_TYPE`, `modifiersForType`, `splitModifierKey`, `joinModifierKey`. Chained keys (`subject:Patient.name`) pass through unsplit — chain support is PR C.
