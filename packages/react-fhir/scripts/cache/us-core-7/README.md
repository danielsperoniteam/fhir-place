# Cached US Core 7.0 IG subset

This is a hand-trimmed subset of the [US Core 7.0.0 IG package](https://hl7.org/fhir/us/core/STU7/) used by the profile-aware codegen spike (issue #123).

The shape mirrors the `package/` layout you get after extracting `hl7.fhir.us.core-7.0.0.tgz` from the FHIR package registry, so the spike can pretend it loaded a real IG package without making any network calls.

Only the StructureDefinitions for the two profiles named in the spike scope are cached:

- `StructureDefinition-us-core-patient.json`
- `StructureDefinition-us-core-observation-lab.json`

Each file is trimmed to the elements the spike needs (must-support, slicing, fixed values, bound ValueSets). Snapshots, narrative, and the rest of the IG (capability statements, search parameters, full ValueSet expansions) are intentionally omitted — the spike only walks `differential.element`.

If/when the spike graduates to a real codegen pipeline (see `docs/spikes/profile-codegen.md`), the right answer is to consume the published IG tarball directly rather than maintain a hand-trimmed copy.
