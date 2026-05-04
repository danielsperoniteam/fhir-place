// AUTO-GENERATED stub by `pnpm --filter @fhir-place/react-fhir sync:sds`.
// Committed (vs the per-type modules which aren't) so `tsc` and the
// in-package fetcher always resolve this import even on a fresh clone where
// the sync hasn't been run. After running sync this file is rewritten with a
// `loaders` map populated from the published R4 spec.
import type { StructureDefinition } from "fhir/r4";

export type StructureDefinitionLoader = () => Promise<{ sd: StructureDefinition }>;

/** One lazy `import()` per core resource SD; bundlers split each into its own chunk. */
export const loaders: Record<string, StructureDefinitionLoader> = {};

/** Sorted list of every type with a bundled SD. Useful for diagnostics. */
export const bundledTypes: ReadonlyArray<string> = [];
