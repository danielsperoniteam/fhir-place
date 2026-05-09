---
"@fhir-place/react-fhir": patch
---

Add regression tests for `[x]` choice column resolution in `ResourceTable` covering `medication[x]` (MedicationRequest Reference variant), `onset[x]` (Condition dateTime/Period/Age), `performed[x]` (Procedure dateTime/Period), and `occurrence[x]` (Immunization dateTime/string). Fixes a test fixture bug where the `medicationReference` test resource omitted `authoredOn`, causing the missing-field dash to trigger a false assertion failure. Closes #232.
