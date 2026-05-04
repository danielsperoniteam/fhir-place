---
"@fhir-place/react-fhir": minor
---

CodeInput and CodingInput now respect FHIR binding strength when deciding whether to offer a free-text escape hatch.

Previously, any binding that was not `required` showed an "Other…" option, which incorrectly treated `extensible` bindings as open. Per the FHIR spec:

- `required` and `extensible` are **closed** — the dropdown is normative and no free-text escape is offered.
- `preferred` and `example` are **open** — the dropdown is provided as a convenience but users may enter any `(system, code, display)` they choose.

The fix introduces `isOpenBinding()` in `binding.ts` and wires it through `CodeInput`, `CodingInput`, and (via context propagation) `CodeableConceptInput`. Users editing resources with `preferred` or `example` CodeableConcept fields (e.g. `Procedure.category`, `Procedure.outcome`) now see an "Other…" option that exposes the free-form three-input editor, producing a valid CodeableConcept that round-trips through FHIR servers.
