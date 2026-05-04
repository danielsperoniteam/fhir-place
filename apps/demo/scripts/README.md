# Demo scripts

## `sync-fhir-r4-sds.ts` — mirror R4 core StructureDefinitions

Downloads `https://hl7.org/fhir/R4/definitions.json.zip`, extracts the
`profiles-resources` bundle, and writes one `{lowercase-type}.profile.json`
file per resource StructureDefinition into `apps/demo/public/fhir-r4/`.

Why: the demo's library configures `setCoreStructureDefinitionFetcher` to
read core SDs from `${BASE_URL}fhir-r4/{type}.profile.json`. Mirroring the
spec locally means resource detail/edit pages work for every R4 resource
type without depending on hl7.org being CORS-friendly or reachable, and it
keeps the demo offline-capable.

### Run once after a fresh clone (or to bump the spec)

```bash
pnpm --filter @fhir-place/demo sync:fhir-spec
```

The downloaded zip and extracted bundle are gitignored under
`apps/demo/scripts/cache/`. The per-type JSON files emitted into
`apps/demo/public/fhir-r4/` **are committed** so the demo runs offline
straight after `pnpm install`.
