---
"@fhir-place/react-fhir": minor
---

Add `mergeFhirPathColumns`, `topLevelColumnsFromStructureDefinition`,
`summaryColumnsFromStructureDefinition`, and `labelFromFhirPath` helpers
to the library.

`mergeFhirPathColumns` merges a curated preferred list with a
StructureDefinition-derived fallback list. It deduplicates by exact path
and also suppresses abstract `choice[x]` paths when at least one concrete
variant (e.g. `deceasedBoolean`) is already in the preferred list, so
the Patient column picker no longer shows two "Deceased" entries.

Closes #615.
