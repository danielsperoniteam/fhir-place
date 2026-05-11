---
"@fhir-place/react-fhir": patch
---

Delete the duplicate `StructureDefinition` walker assertion from the live
integration suite (closes #382, supersedes #336).

The integration test in `packages/react-fhir/integration/FhirClient.integration.test.ts`
was walking `StructureDefinition/Patient` over the wire and asserting on
both server-shape (`sd.kind === "resource"`) and walker behavior
(`directChildren()` produces expected Patient paths). The walker
behavior is already covered deterministically by
`packages/react-fhir/src/structure/walker.test.ts` against a vendored
fixture, so the integration version coupled the suite to whatever the
live `r4.smarthealthit.org` sandbox happened to return.

Replaced with a shape-only interop probe: read the SD, assert
`resourceType === "StructureDefinition"`. No assertions on `kind` or
specific element paths.

Test-only change — no runtime code modified.
