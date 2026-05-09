---
"@fhir-place/react-fhir": minor
---

Add `pnpm sync:valuesets` script that regenerates `valuesets.generated.ts` from a cached `expansions.json` extracted from the official FHIR R4 `definitions.json.zip`. The generated map now ships ~500 pre-expanded ValueSets (those with ≤500 codes and a complete expansion). `coreValueSet()` consults hand-curated entries first so intentional overrides are preserved. Closes #163.
