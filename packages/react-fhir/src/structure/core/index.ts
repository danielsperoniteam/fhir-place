import type { StructureDefinition } from "fhir/r4";
import { getCoreStructureDefinitionFetcher } from "./specFetcher.js";

export {
  coreValueSet,
  coreValueSets,
  bundledValueSetUrls,
  lookupCoreDisplay,
  lookupCoreDefinition,
  lookupCoreConcept,
  preloadCoreLookups,
} from "./valuesets.js";
export { bundledTypes } from "./sd/index.generated.js";
export {
  type SpecFetcher,
  createBundledSpecFetcher,
  createDefaultSpecFetcher,
  setCoreStructureDefinitionFetcher,
  getCoreStructureDefinitionFetcher,
  clearSpecFetcherCache,
} from "./specFetcher.js";

/**
 * Resolves the canonical R4 StructureDefinition for a resource type at
 * runtime by delegating to the configured {@link SpecFetcher}. The default
 * fetcher lazy-imports SDs from the in-package bundle (no network), so this
 * works for every core resource type without any app-side configuration.
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
