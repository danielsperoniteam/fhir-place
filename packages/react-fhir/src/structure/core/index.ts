import type { StructureDefinition } from "fhir/r4";
import { getCoreStructureDefinitionFetcher } from "./specFetcher.js";

export { coreValueSet, coreValueSets, bundledValueSetUrls } from "./valuesets.js";
export {
  type SpecFetcher,
  DEFAULT_SPEC_BASE_URL,
  createDefaultSpecFetcher,
  setCoreStructureDefinitionFetcher,
  getCoreStructureDefinitionFetcher,
  clearSpecFetcherCache,
} from "./specFetcher.js";

/**
 * Resolves the canonical R4 StructureDefinition for a resource type at
 * runtime by delegating to the configured {@link SpecFetcher}. The default
 * fetcher pulls JSON straight from the published FHIR R4 spec (one file per
 * resource type), so this works for every resource type in the spec without
 * any hand-curated subset.
 *
 * Used as the last-resort fallback inside `resolveStructureDefinition` so
 * `<ResourceView>` / `<ResourceEditor>` keep working against servers (e.g.
 * public HAPI) that don't store core SDs as instances.
 */
export async function coreStructureDefinition(
  type: string,
  signal?: AbortSignal,
): Promise<StructureDefinition | undefined> {
  return getCoreStructureDefinitionFetcher()(type, signal);
}
