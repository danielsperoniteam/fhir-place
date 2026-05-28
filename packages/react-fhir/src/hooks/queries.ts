import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type {
  Bundle,
  CapabilityStatement,
  Reference,
  Resource,
  SearchParameter,
  StructureDefinition,
  ValueSet,
} from "fhir/r4";
import type { FhirClient, SearchParams } from "../client/types.js";
import type { SearchableResource } from "../client/searchBuilder.js";
import { SearchBuilder } from "../client/searchBuilder.js";
import { coreValueSet, lookupCoreConcept } from "../structure/core/valuesets.js";
import { resolveStructureDefinition } from "../structure/resolve.js";
import { useFhirClient, useOptionalTerminologyClient, useTerminologyClient } from "./FhirClientProvider.js";

/** Stable query keys so callers can target them with invalidate/refetch. */
export const fhirQueryKeys = {
  all: (baseUrl: string) => ["fhir", baseUrl] as const,
  capabilities: (baseUrl: string) => [...fhirQueryKeys.all(baseUrl), "metadata"] as const,
  resource: (baseUrl: string, type: string, id: string) =>
    [...fhirQueryKeys.all(baseUrl), type, id] as const,
  search: (baseUrl: string, type: string, params?: SearchParams) =>
    [...fhirQueryKeys.all(baseUrl), type, "search", params ?? {}] as const,
  structure: (baseUrl: string, type: string, profile?: string | null) =>
    [...fhirQueryKeys.all(baseUrl), "StructureDefinition", type, profile ?? ""] as const,
  valueSet: (baseUrl: string, canonical: string) =>
    [...fhirQueryKeys.all(baseUrl), "ValueSet", canonical] as const,
  valueSetExpansion: (baseUrl: string, canonical: string, filter: string, count: number) =>
    [...fhirQueryKeys.all(baseUrl), "ValueSet", canonical, "expand", filter, count] as const,
  codeLookup: (baseUrl: string, system: string, code: string) =>
    [...fhirQueryKeys.all(baseUrl), "CodeSystem", system, "lookup", code] as const,
  reference: (baseUrl: string, ref: string) =>
    [...fhirQueryKeys.all(baseUrl), "ref", ref] as const,
  searchParameter: (baseUrl: string, base: string, code: string) =>
    [...fhirQueryKeys.all(baseUrl), "SearchParameter", base, code] as const,
  batch: (baseUrl: string, type: string, sortedIds: readonly string[]) =>
    [...fhirQueryKeys.all(baseUrl), type, "batch", sortedIds] as const,
  refs: (baseUrl: string, sortedKeys: readonly string[]) =>
    [...fhirQueryKeys.all(baseUrl), "refs", sortedKeys] as const,
};

type ReadQueryOpts<T> = Omit<
  UseQueryOptions<T, Error, T, readonly unknown[]>,
  "queryKey" | "queryFn"
>;

export function useCapabilities(options?: ReadQueryOpts<CapabilityStatement>) {
  const client = useFhirClient();
  return useQuery({
    queryKey: fhirQueryKeys.capabilities(client.baseUrl),
    queryFn: ({ signal }) => client.capabilities({ signal }),
    staleTime: 5 * 60_000,
    ...options,
  });
}

export function useResource<T extends Resource = Resource>(
  type: string,
  id: string | undefined,
  options?: ReadQueryOpts<T>,
) {
  const client = useFhirClient();
  return useQuery({
    queryKey: fhirQueryKeys.resource(client.baseUrl, type, id ?? ""),
    queryFn: ({ signal }) => client.read<T>(type, id!, { signal }),
    enabled: Boolean(id),
    ...options,
  });
}

export function useSearch<T extends Resource = Resource>(
  type: string,
  params?: SearchParams,
  options?: ReadQueryOpts<Bundle<T>>,
) {
  const client = useFhirClient();
  return useQuery({
    queryKey: fhirQueryKeys.search(client.baseUrl, type, params),
    queryFn: ({ signal }) => client.search<T>(type, params, { signal }),
    ...options,
  });
}

/**
 * Typed search hook backed by a {@link SearchBuilder} instance.
 *
 * The builder supplies both the resource type and the search parameters;
 * the query key reuses {@link fhirQueryKeys}.search so that mutations via
 * {@link useUpdateResource} or {@link useCreateResource} trigger the same
 * cache invalidation path as plain {@link useSearch} calls.
 *
 * @example
 * ```tsx
 * const { data } = useTypedSearch(
 *   searchBuilder('Patient')
 *     .where('name', 'Smith')
 *     .include('Patient:general-practitioner'),
 * );
 * ```
 */
export function useTypedSearch<
  R extends SearchableResource,
  T extends Resource = Resource,
>(
  builder: SearchBuilder<R>,
  options?: ReadQueryOpts<Bundle<T>>,
) {
  const client = useFhirClient();
  // Extract (resourceType, params) from the builder so the query key is
  // structurally equivalent to fhirQueryKeys.search and invalidations work.
  const resourceType = builder.resourceType;
  const params = builderToSearchParams(builder);
  return useQuery({
    queryKey: fhirQueryKeys.search(client.baseUrl, resourceType, params),
    queryFn: ({ signal }) => client.search<T>(resourceType, params, { signal }),
    ...options,
  });
}

/** @internal Converts a SearchBuilder's entries to a SearchParams object for use as a query key and fetch arg. */
function builderToSearchParams(builder: SearchBuilder<SearchableResource>): SearchParams {
  const result: Record<string, string[]> = {};
  for (const [k, v] of builder.entries) {
    (result[k] ??= []).push(v);
  }
  // Flatten single-item arrays to bare strings (matches FetchFhirClient conventions).
  const out: SearchParams = {};
  for (const [k, arr] of Object.entries(result)) {
    out[k] = arr.length === 1 ? arr[0]! : arr;
  }
  return out;
}

/** Returns the absolute URL of a Bundle's next page, or undefined when done. */
export const nextPageUrl = <T extends Resource>(
  bundle: Bundle<T> | undefined,
): string | undefined =>
  bundle?.link?.find((l) => l.relation === "next")?.url;

/**
 * Page-navigation links a Bundle advertises. Per FHIR R4 §3.1.0.5 a server
 * MAY populate any of `first`, `previous`/`prev`, `next`, `last` — none are
 * required. Cursor servers (Epic, parts of HealthLake) typically emit `next`
 * only; offset servers (HAPI, Smile CDR) usually emit all four. URLs are
 * passed through verbatim because cursor tokens are opaque.
 */
export interface BundlePageLinks {
  first?: string;
  previous?: string;
  next?: string;
  last?: string;
}

export const bundlePageLinks = <T extends Resource>(
  bundle: Bundle<T> | undefined,
): BundlePageLinks => {
  const out: BundlePageLinks = {};
  for (const link of bundle?.link ?? []) {
    if (!link.url) continue;
    // Accept both spellings of "previous" — RFC 5988 says "prev", servers split.
    if (link.relation === "first") out.first = link.url;
    else if (link.relation === "previous" || link.relation === "prev") out.previous = link.url;
    else if (link.relation === "next") out.next = link.url;
    else if (link.relation === "last") out.last = link.url;
  }
  return out;
};

/**
 * Page-aware search. Each page is a FHIR Bundle; `fetchNextPage` follows
 * `Bundle.link[rel=next]` (an absolute URL on most servers including HAPI).
 * `hasNextPage` mirrors the presence of that link on the most recent page.
 */
export function useInfiniteSearch<T extends Resource = Resource>(
  type: string,
  params?: SearchParams,
) {
  const client = useFhirClient();
  return useInfiniteQuery({
    queryKey: [
      ...fhirQueryKeys.search(client.baseUrl, type, params),
      "infinite",
    ] as const,
    queryFn: ({ signal, pageParam }): Promise<Bundle<T>> =>
      pageParam
        ? client.request<Bundle<T>>({ path: pageParam, signal })
        : client.search<T>(type, params, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => nextPageUrl(lastPage) ?? undefined,
  });
}

export interface UsePagedSearchResult<T extends Resource> {
  bundle: Bundle<T> | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  links: BundlePageLinks;
  /** Navigate to a specific page link. No-op when the link is absent. */
  goTo: (url: string | undefined) => void;
}

/**
 * Single-page search that follows `Bundle.link` rels for navigation.
 *
 * Surfaces one Bundle at a time plus the URLs the server advertised — use
 * this when the UI exposes discrete First/Prev/Next/Last controls and needs
 * to disable buttons for rels the server didn't emit. Forward-only servers
 * degrade to a Next-only UI. Changing `type` or `params` resets to the
 * server-generated first page. See {@link useInfiniteSearch} for the
 * append-style "Load more" pattern.
 */
export function usePagedSearch<T extends Resource = Resource>(
  type: string,
  params?: SearchParams,
): UsePagedSearchResult<T> {
  const client = useFhirClient();
  const [pageUrl, setPageUrl] = useState<string | undefined>(undefined);
  const paramsKey = JSON.stringify(params ?? {});

  // Reset the cursor synchronously during render so the first render after a
  // search change never fires against a stale Bundle.link URL. A useEffect
  // would run after the render and miss that first request.
  const searchKey = `${client.baseUrl}\0${type}\0${paramsKey}`;
  const [prevSearchKey, setPrevSearchKey] = useState(searchKey);
  if (searchKey !== prevSearchKey) {
    setPrevSearchKey(searchKey);
    setPageUrl(undefined);
  }

  const query = useQuery<Bundle<T>, Error>({
    queryKey: [
      ...fhirQueryKeys.search(client.baseUrl, type, params),
      "paged",
      pageUrl ?? "__first__",
    ] as const,
    queryFn: ({ signal }) =>
      pageUrl
        ? client.request<Bundle<T>>({ path: pageUrl, signal })
        : client.search<T>(type, params, { signal }),
  });

  const goTo = useCallback((url: string | undefined) => {
    if (url) setPageUrl(url);
  }, []);

  return {
    bundle: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    links: bundlePageLinks(query.data),
    goTo,
  };
}

export type StructureDefinitionInput = string | { type: string; profile?: string | null };

const FHIR_CORE_SD_BASE = "http://hl7.org/fhir/StructureDefinition/";

function parseStructureDefinitionInput(
  input: StructureDefinitionInput,
): { type: string; profile: string | null | undefined } {
  if (typeof input !== "string") {
    return { type: input.type || "Resource", profile: input.profile };
  }
  if (!input.includes("://")) {
    return { type: input, profile: undefined };
  }
  // Canonical URL. If it points at a core R4 StructureDefinition, treat it as
  // a base type so the resolver's bundled-core fallback stays reachable.
  if (input.startsWith(FHIR_CORE_SD_BASE)) {
    const tail = input.slice(FHIR_CORE_SD_BASE.length);
    if (tail && !tail.includes("/")) {
      return { type: tail, profile: undefined };
    }
  }
  return { type: "Resource", profile: input };
}

export function useStructureDefinition(
  input: StructureDefinitionInput,
  options?: ReadQueryOpts<StructureDefinition>,
) {
  const client = useFhirClient();
  const { type, profile } = parseStructureDefinitionInput(input);
  return useQuery({
    queryKey: fhirQueryKeys.structure(client.baseUrl, type, profile),
    queryFn: ({ signal }) => resolveStructureDefinition(client, type, { signal, profile }),
    staleTime: 60 * 60_000,
    ...options,
  });
}

/**
 * Resolves a ValueSet by canonical URL.
 *
 * Three-step fallback so dropdowns work against every server:
 *   1. `ValueSet/$expand?url={canonical}` — server-computed enumeration
 *   2. `ValueSet?url={canonical}` + the first matching resource — consumers
 *      can locally expand via {@link codesFromValueSet}
 *   3. Library-bundled core R4 ValueSet (administrative-gender,
 *      observation-status, task-status, etc.) — keeps dropdowns populated
 *      even when the server serves nothing terminology-related
 *
 * A trailing `|version` suffix on the canonical is stripped before each
 * lookup. StructureDefinitions in the wild often pin a binding to a
 * versioned canonical (e.g. `…/allergy-intolerance-category|4.0.1`); the
 * bundled fallback and most servers key by the unversioned URL, so without
 * this every versioned binding would silently fall through to a free-text
 * input.
 */
export function useValueSet(
  canonical: string | undefined,
  options?: ReadQueryOpts<ValueSet>,
) {
  // useOptionalTerminologyClient avoids throwing when canonical is undefined
  // and this hook is called outside a FhirClientProvider (e.g. CodingInput
  // with no element binding, which renders free-form and never fires the query).
  const client = useOptionalTerminologyClient();
  const url = canonical ? canonical.split("|")[0]! : undefined;
  return useQuery({
    queryKey: fhirQueryKeys.valueSet(client?.baseUrl ?? "", url ?? ""),
    queryFn: async ({ signal }) => {
      // tx.fhir.org currently emits browser-visible CORS failures for this
      // core R4 ValueSet before we can fall back; use the bundled copy there.
      const bundled = coreValueSet(url);
      if (bundled && client?.baseUrl.includes("tx.fhir.org")) return bundled;
      // 1. $expand
      try {
        return await client!.request<ValueSet>({
          path: `/ValueSet/$expand?url=${encodeURIComponent(url!)}`,
          signal,
        });
      } catch {
        // fall through
      }
      // 2. search by url
      try {
        const bundle = await client!.search<ValueSet>(
          "ValueSet",
          { url: url! },
          { signal },
        );
        const hit = bundle.entry?.[0]?.resource;
        if (hit) return hit;
      } catch {
        // fall through
      }
      // 3. bundled fallback
      if (bundled) return bundled;
      throw new Error(
        `ValueSet ${url} could not be resolved from this server and is not bundled in the library`,
      );
    },
    enabled: Boolean(url) && Boolean(client),
    staleTime: 24 * 60 * 60_000,
    ...options,
  });
}

export interface UseValueSetExpansionOptions extends ReadQueryOpts<ValueSet> {
  /** Max concepts to ask the server for. Defaults to 20 (combobox-sized). */
  count?: number;
  /** When false, the query won't fire even if filter is non-empty. */
  enabled?: boolean;
}

/**
 * Server-side filtered ValueSet expansion. Wraps `ValueSet/$expand?url=...&filter=...`,
 * intended for "type-ahead against SNOMED/LOINC/ICD" style comboboxes where the
 * full ValueSet is too large to enumerate locally.
 *
 * Disabled when `filter` is empty/whitespace — pair with debouncing in the UI to
 * avoid hammering the terminology server on every keystroke.
 *
 * Cached by `(canonical, filter, count)` so repeated keystrokes that resolve to
 * the same query share results across the app.
 */
export function useValueSetExpansion(
  canonical: string | undefined,
  filter: string,
  options?: UseValueSetExpansionOptions,
) {
  const client = useTerminologyClient();
  const trimmed = filter.trim();
  const count = options?.count ?? 20;
  const enabled = (options?.enabled ?? true) && Boolean(canonical) && trimmed.length > 0;
  return useQuery({
    queryKey: fhirQueryKeys.valueSetExpansion(client.baseUrl, canonical ?? "", trimmed, count),
    queryFn: ({ signal }) => {
      const url = canonical!;
      const qs = new URLSearchParams({
        url,
        filter: trimmed,
        count: String(count),
      });
      return client.request<ValueSet>({
        path: `/ValueSet/$expand?${qs.toString()}`,
        signal,
      });
    },
    enabled,
    // Filter results are short-lived — server may cap counts and we want fresh
    // matches as the user keeps typing past previously-seen prefixes.
    staleTime: 30_000,
    ...options,
  });
}

export interface CodeLookupResult {
  display?: string;
  definition?: string;
  /** Where the result came from — "bundle" means no network call was made. */
  source: "bundle" | "server";
}

export interface UseCodeLookupOptions
  extends ReadQueryOpts<CodeLookupResult | null> {
  /** When false, skips the server fallback even if the local bundle misses. */
  enabled?: boolean;
}

/**
 * Resolves the human-readable display + definition for a `(system, code)`
 * pair. Synchronously returns a bundled hit when one exists; otherwise calls
 * `CodeSystem/$lookup` against the configured terminology server.
 *
 * Useful for tooltip/hover UIs that want to surface concept metadata for
 * codes whose `Coding.display` is missing — particularly licensed/large
 * systems like SNOMED, LOINC, ICD-10 which we don't bundle.
 *
 * Returns `null` for the "looked up but found nothing" case so consumers can
 * distinguish it from "still loading" (`undefined`).
 */
export function useCodeLookup(
  system: string | undefined,
  code: string | undefined,
  options?: UseCodeLookupOptions,
) {
  const client = useOptionalTerminologyClient();
  const local = lookupCoreConcept(system, code);
  const enabled =
    (options?.enabled ?? true) &&
    Boolean(system) &&
    Boolean(code) &&
    !local &&
    Boolean(client);
  return useQuery<CodeLookupResult | null>({
    queryKey: fhirQueryKeys.codeLookup(
      client?.baseUrl ?? "",
      system ?? "",
      code ?? "",
    ),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ system: system!, code: code! });
      try {
        const res = await client!.request<{
          parameter?: Array<{
            name: string;
            valueString?: string;
            part?: Array<{ name: string; valueString?: string }>;
          }>;
        }>({
          path: `/CodeSystem/$lookup?${params.toString()}`,
          signal,
        });
        const display = res.parameter?.find(
          (p) => p.name === "display",
        )?.valueString;
        // Definitions live under either a top-level "definition" parameter
        // (rare but spec-compliant) or inside a "designation" with a part of
        // type definition. We pick whichever the server returned.
        const topDefinition = res.parameter?.find(
          (p) => p.name === "definition",
        )?.valueString;
        const designationDefinition = res.parameter
          ?.filter((p) => p.name === "designation")
          .map((p) => p.part?.find((q) => q.name === "value")?.valueString)
          .find(Boolean);
        const definition = topDefinition ?? designationDefinition;
        if (!display && !definition) return null;
        return { display, definition, source: "server" };
      } catch {
        return null;
      }
    },
    enabled,
    initialData: local
      ? { display: local.display, definition: local.definition, source: "bundle" }
      : undefined,
    // Concept metadata is effectively immutable — cache aggressively.
    staleTime: 24 * 60 * 60_000,
    gcTime: 7 * 24 * 60 * 60_000,
    ...options,
  });
}

/**
 * Resolves the canonical `SearchParameter` resource for a `(base, code)` pair.
 *
 * Use the returned spec's `expression` to discover the actual FHIR element a
 * search param targets — necessary for custom IG params and the rare core
 * params whose code diverges from their `expression`. Falls through to
 * `undefined` when the server does not advertise the param; callers should
 * fall back to the kebab→camel naming convention.
 *
 * Implementation: searches `SearchParameter?base={base}&code={code}` and
 * returns the first hit. Cached for an hour since SearchParameter is
 * canonical metadata that changes rarely.
 */
export function useSearchParameter(
  base: string,
  code: string,
  options?: ReadQueryOpts<SearchParameter | null>,
) {
  const client = useFhirClient();
  return useQuery<SearchParameter | null>({
    queryKey: fhirQueryKeys.searchParameter(client.baseUrl, base, code),
    // TanStack Query treats `undefined` as "no data yet", so we explicitly
    // return `null` for the no-result and error-fallback cases.
    queryFn: async ({ signal }): Promise<SearchParameter | null> => {
      try {
        const bundle = await client.search<SearchParameter>(
          "SearchParameter",
          { base, code },
          { signal },
        );
        return bundle.entry?.[0]?.resource ?? null;
      } catch {
        return null;
      }
    },
    enabled: Boolean(base && code),
    staleTime: 60 * 60_000,
    ...options,
  });
}

export function useReadReference<T extends Resource = Resource>(
  reference: Reference | undefined,
  options?: ReadQueryOpts<T>,
) {
  const client = useFhirClient();
  const refKey = reference?.reference ?? "";
  return useQuery({
    queryKey: fhirQueryKeys.reference(client.baseUrl, refKey),
    queryFn: ({ signal }) => client.readReference<T>(reference!, { signal }),
    enabled: Boolean(reference?.reference),
    ...options,
  });
}

/**
 * Batch read N resources of the same type by id in a single FHIR search call
 * (`{type}?_id=a,b,c`). Returns the resolved resources as a flat array; empty
 * or undefined `ids` short-circuits with no network request.
 *
 * Order-independent caching: re-rendering with the same ids in a different
 * order does not re-fetch (ids are sorted + deduped before forming the
 * query key).
 *
 * Cache hydration: each returned resource is also written to its individual
 * read cache key, so a later `useResource(type, id)` for the same id resolves
 * from cache without an extra round-trip.
 *
 * Servers may return only a subset (e.g. one id was deleted). The hook does
 * not synthesise missing entries — the result reflects what the server
 * actually returned.
 */
export function useResources<T extends Resource = Resource>(
  type: string,
  ids: string[] | undefined,
  options?: ReadQueryOpts<T[]>,
) {
  const client = useFhirClient();
  const qc = useQueryClient();
  const sortedIds = [...new Set(ids ?? [])].sort();
  return useQuery<T[], Error, T[], readonly unknown[]>({
    queryKey: fhirQueryKeys.batch(client.baseUrl, type, sortedIds),
    queryFn: async ({ signal }): Promise<T[]> => {
      const bundle = await client.search<T>(
        type,
        { _id: sortedIds.join(",") },
        { signal },
      );
      const resources =
        bundle.entry?.flatMap((e) => (e.resource ? [e.resource] : [])) ?? [];
      for (const r of resources) {
        if (r.id) {
          qc.setQueryData(
            fhirQueryKeys.resource(client.baseUrl, type, r.id),
            r,
          );
        }
      }
      return resources;
    },
    enabled: sortedIds.length > 0,
    ...options,
  });
}

/**
 * Group references by target resource type, returning `{ [Type]: [id, ...] }`
 * with each group deduped + sorted. Skips references that can't be batched
 * via `_id=a,b,c` search:
 *   - no `.reference` (only `.identifier`)
 *   - contained refs (`#frag`)
 *   - urn-style refs (`urn:uuid:...`)
 *   - absolute URLs (different server)
 *   - versioned refs (`/_history/`) — `_id` returns the current version
 */
export function parseBatchableRefs(
  refs: Reference[] | undefined,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!refs) return result;
  for (const ref of refs) {
    const r = ref.reference;
    if (!r) continue;
    if (r.startsWith("#") || r.startsWith("urn:")) continue;
    if (/^https?:\/\//i.test(r)) continue;
    if (r.includes("/_history/")) continue;
    const [type, id] = r.split("/");
    if (!type || !id) continue;
    (result[type] ??= []).push(id);
  }
  for (const t of Object.keys(result)) {
    result[t] = [...new Set(result[t]!)].sort();
  }
  return result;
}

/**
 * Batch resolve a heterogeneous list of `Reference`s. Groups by target
 * resource type, fires one `_id=a,b,c` search per group in parallel, and
 * returns a `Map` keyed by `Type/id` ("Patient/123", "Goal/abc").
 *
 * Cache hydration mirrors {@link useResources} — each resolved resource lands
 * in `fhirQueryKeys.resource(...)` — and additionally populates the per-ref
 * cache, so later `useReadReference(...)` calls for the same refs hit cache.
 *
 * References that can't be batched ({@link parseBatchableRefs} skip rules)
 * are silently dropped from the result Map. Callers that need them should
 * fall back to {@link useReadReference} per reference.
 */
export function useReadReferences<T extends Resource = Resource>(
  refs: Reference[] | undefined,
  options?: ReadQueryOpts<Map<string, T>>,
) {
  const client = useFhirClient();
  const qc = useQueryClient();
  const grouped = parseBatchableRefs(refs);
  const sortedKeys = Object.keys(grouped)
    .sort()
    .flatMap((t) => grouped[t]!.map((id) => `${t}/${id}`));
  return useQuery<Map<string, T>, Error, Map<string, T>, readonly unknown[]>({
    queryKey: fhirQueryKeys.refs(client.baseUrl, sortedKeys),
    queryFn: async ({ signal }): Promise<Map<string, T>> => {
      const result = new Map<string, T>();
      const groups = Object.entries(grouped);
      const bundles = await Promise.all(
        groups.map(([type, ids]) =>
          client.search<T>(type, { _id: ids.join(",") }, { signal }),
        ),
      );
      bundles.forEach((bundle, i) => {
        const [type] = groups[i]!;
        for (const e of bundle.entry ?? []) {
          const r = e.resource;
          if (!r?.id) continue;
          const key = `${type}/${r.id}`;
          result.set(key, r);
          qc.setQueryData(
            fhirQueryKeys.resource(client.baseUrl, type, r.id),
            r,
          );
          qc.setQueryData(fhirQueryKeys.reference(client.baseUrl, key), r);
        }
      });
      return result;
    },
    enabled: sortedKeys.length > 0,
    ...options,
  });
}

/** Invalidates cached reads for a specific resource (e.g. after a mutation). */
const invalidateResource = (qc: ReturnType<typeof useQueryClient>, client: FhirClient, type: string, id?: string) => {
  if (id) {
    qc.invalidateQueries({ queryKey: fhirQueryKeys.resource(client.baseUrl, type, id) });
  }
  qc.invalidateQueries({ queryKey: [...fhirQueryKeys.all(client.baseUrl), type] });
};

export function useCreateResource<T extends Resource>(
  options?: UseMutationOptions<T, Error, T>,
) {
  const client = useFhirClient();
  const qc = useQueryClient();
  return useMutation<T, Error, T>({
    mutationFn: (resource) => client.create<T>(resource),
    onSuccess: (data, _vars, _ctx) => {
      invalidateResource(qc, client, data.resourceType, data.id);
    },
    ...options,
  });
}

export function useUpdateResource<T extends Resource>(
  options?: UseMutationOptions<T, Error, T & { id: string }>,
) {
  const client = useFhirClient();
  const qc = useQueryClient();
  return useMutation<T, Error, T & { id: string }>({
    mutationFn: (resource) => client.update<T>(resource),
    onSuccess: (data) => invalidateResource(qc, client, data.resourceType, data.id),
    ...options,
  });
}

export function useDeleteResource(
  options?: UseMutationOptions<void, Error, { type: string; id: string }>,
) {
  const client = useFhirClient();
  const qc = useQueryClient();
  return useMutation<void, Error, { type: string; id: string }>({
    mutationFn: ({ type, id }) => client.delete(type, id),
    onSuccess: (_data, vars) => invalidateResource(qc, client, vars.type, vars.id),
    ...options,
  });
}
