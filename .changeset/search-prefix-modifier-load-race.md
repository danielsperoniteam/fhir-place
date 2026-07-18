---
"@fhir-place/react-fhir": patch
---

Fix a load-race in `ResourceSearch` where a valid hydrated criterion was
silently normalized away before its target metadata resolved. The token
modifier-clear and the date/number prefix-strip effects keyed off the resolved
element / `SearchParameter`, which are undefined on the first render while the
`SearchParameter`/`StructureDefinition` queries load — so a pasted
`identifier:of-type=…` or `Encounter?date=sa2026-01-01` could be cleared before
the StructureDefinition confirmed the target was Identifier- or Period-backed.
The effects now wait until the gating metadata has settled before stripping an
unavailable modifier or prefix.
