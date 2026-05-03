import type { StructureDefinition } from "fhir/r4";

/**
 * Strategy for resolving a core R4 StructureDefinition at runtime, used as the
 * last-resort step in `resolveStructureDefinition` when the FHIR server
 * doesn't store / index the core SDs.
 *
 * Receives the resource type (e.g. "Patient", "AdverseEvent") and an optional
 * AbortSignal for cancellation. Resolves with the SD or `undefined` when not
 * found. Throwing is reserved for genuine errors that callers should surface
 * (e.g. unexpected 5xx); a missing SD should be `undefined` so the resolver
 * can produce the friendly "could not resolve" message.
 */
export type SpecFetcher = (
  type: string,
  signal?: AbortSignal,
) => Promise<StructureDefinition | undefined>;

/**
 * Canonical location pattern for the published R4 spec — one JSON file per
 * resource StructureDefinition. Override via `setCoreStructureDefinitionFetcher`
 * if you mirror the spec locally (e.g. as static assets) or need a CORS-
 * friendly proxy.
 *
 * @see https://hl7.org/fhir/R4/
 */
export const DEFAULT_SPEC_BASE_URL = "https://hl7.org/fhir/R4";

const cache = new Map<string, Promise<StructureDefinition | undefined>>();

/** Drop the in-memory cache. Useful in tests; consumers rarely need this. */
export function clearSpecFetcherCache(): void {
  cache.clear();
}

/**
 * Default fetcher: GETs `{baseUrl}/{lowercase-type}.profile.json` and parses
 * the JSON. Returns `undefined` on 404 so the resolver throws a friendly
 * not-found error rather than a network error. Successful responses are
 * memoised so each type costs at most one round-trip per page load.
 */
export function createDefaultSpecFetcher(
  baseUrl: string = DEFAULT_SPEC_BASE_URL,
): SpecFetcher {
  return async (type, signal) => {
    const cacheKey = `${baseUrl}|${type}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const promise = (async (): Promise<StructureDefinition | undefined> => {
      const url = `${baseUrl.replace(/\/$/, "")}/${type.toLowerCase()}.profile.json`;
      const res = await fetch(url, { signal });
      if (res.status === 404) return undefined;
      if (!res.ok) {
        throw new Error(
          `Failed to fetch core StructureDefinition for "${type}" from ${url} (${res.status})`,
        );
      }
      const json = (await res.json()) as StructureDefinition;
      if (json.resourceType !== "StructureDefinition") {
        throw new Error(
          `Expected a StructureDefinition at ${url}, got ${(json as { resourceType?: string }).resourceType ?? "unknown"}`,
        );
      }
      return json;
    })();

    // Don't cache failures so a transient 5xx doesn't poison subsequent loads.
    promise.catch(() => cache.delete(cacheKey));
    cache.set(cacheKey, promise);
    return promise;
  };
}

let activeFetcher: SpecFetcher = createDefaultSpecFetcher();

/**
 * Override the process-global fetcher. Call once at app boot — for example to
 * point at a local mirror of the spec (`/fhir-r4/{type}.profile.json`) or a
 * CORS-friendly proxy.
 */
export function setCoreStructureDefinitionFetcher(fetcher: SpecFetcher): void {
  activeFetcher = fetcher;
  cache.clear();
}

/** Returns the currently active fetcher. */
export function getCoreStructureDefinitionFetcher(): SpecFetcher {
  return activeFetcher;
}
