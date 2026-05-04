import type { StructureDefinition } from "fhir/r4";
import {
  loaders as bundledLoaders,
  type StructureDefinitionLoader,
} from "./sd/index.generated.js";

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

const cache = new Map<string, Promise<StructureDefinition | undefined>>();

/** Drop the in-memory cache. Useful in tests; consumers rarely need this. */
export function clearSpecFetcherCache(): void {
  cache.clear();
}

/**
 * Bundled fetcher: resolves the SD by lazy-importing the per-type module
 * generated under `src/structure/core/sd/` (one chunk per type at build
 * time). No network call. Returns `undefined` for types not in the bundle.
 *
 * This is the global default — no app-side configuration required to support
 * any core R4 resource type. Consumers who need profiles, custom SDs, or a
 * different spec version should override via `setCoreStructureDefinitionFetcher`.
 *
 * The `loaders` argument exists for tests; production callers pass nothing and
 * get the published bundle.
 */
export function createBundledSpecFetcher(
  loaders: Record<string, StructureDefinitionLoader> = bundledLoaders,
): SpecFetcher {
  return async (type) => {
    const cacheKey = `bundled|${type}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const loader = loaders[type];
    if (!loader) return undefined;
    const promise = loader().then((m) => m.sd);
    promise.catch(() => cache.delete(cacheKey));
    cache.set(cacheKey, promise);
    return promise;
  };
}

/**
 * HTTP-mirror fetcher: GETs `{baseUrl}/{lowercase-type}.profile.json` and
 * parses the JSON. Useful when consumers prefer to host the spec themselves
 * (e.g. as static assets in their app, behind a CORS-friendly proxy) rather
 * than ship the SDs in their bundle. Returns `undefined` on 404 so the
 * resolver throws a friendly not-found error rather than a network error.
 * Successful responses are memoised so each type costs at most one round-trip
 * per page load.
 *
 * `baseUrl` is required: pointing this at hl7.org from a browser is a CORS
 * and reliability footgun, so consumers must opt in to a specific mirror.
 */
export function createDefaultSpecFetcher(baseUrl: string): SpecFetcher {
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

let activeFetcher: SpecFetcher = createBundledSpecFetcher();

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
