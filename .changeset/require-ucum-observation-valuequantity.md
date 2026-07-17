---
"@fhir-place/react-fhir": patch
---

Block ResourceEditor saves for Observations whose `valueQuantity.code` is not a valid UCUM code while keeping `valueQuantity.unit` as display-only text.
