# R4 spec cache

This folder is used by `packages/react-fhir/scripts/sync-bundled-valuesets.ts`.

## Populate cache

From repo root:

```bash
node --experimental-strip-types packages/react-fhir/scripts/sync-bundled-valuesets.ts
```

The script downloads `https://hl7.org/fhir/R4/definitions.json.zip` once, then extracts `expansions.json` into this directory and regenerates `src/structure/core/valuesets.generated.ts`.

The cache artifacts are gitignored; commit only generated TS outputs.
