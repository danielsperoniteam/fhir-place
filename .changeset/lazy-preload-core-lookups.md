---
"@fhir-place/react-fhir": patch
---

Add `preloadCoreLookups()` for deferred loading of bundled value-set and code-system data.

The two large auto-generated data files (`valuesets.generated` and `codesystems.generated`, ~1.8 MB combined) are no longer imported statically at module load time. They are instead fetched via dynamic imports when `preloadCoreLookups()` resolves.

Existing sync APIs (`lookupCoreDisplay`, `lookupCoreDefinition`, `lookupCoreConcept`, `coreValueSet`, `bundledValueSetUrls`) continue to work: before preload they operate on the hand-curated `coreValueSets` only; after preload they include the full generated data set. Calling `preloadCoreLookups()` at app boot (fire-and-forget with `void`) keeps behaviour identical to before for users who don't experience any latency between bootstrap and first interaction.
