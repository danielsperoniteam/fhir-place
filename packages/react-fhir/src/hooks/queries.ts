import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
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
import { coreValueSet } from "../structure/core/valuesets.js";
import { resolveStructureDefinition } from "../structure/resolve.js";
import { useFhirClient } from "./FhirClientProvider.js";

/** Stable query keys so callers can target them with invalidate/refetch. */
export const fhirQueryKeys = {
  all: (baseUrl: string) => ["fhir", baseUrl] as const,
  capabilities: (baseUrl: string) => [...fhirQueryKeys.all(baseUrl), "metadata"] as const,
  resource: (baseUrl: string, type: string, id: string) =>
    [...fhirQueryKeys.all(baseUrl), type, id] as const,
  search: (baseUrl: string, type: string, params?: SearchParams) =>
    [...fhirQueryKeys.all(baseUrl), type, "search", params ?? {}] as const,
  structure: (baseUrl: string, type: string) =>
    [...fhirQueryKeys.all(baseUrl), "StructureDefinition", type] as const,
  valueSet: (baseUrl: string, canonical: string) =>
    [...fhirQueryKeys.all(baseUrl), "ValueSet", canonical] as const,
  reference: (baseUrl: string, ref: string) =>
    [...fhirQueryKeys.all(baseUrl), "ref", ref] as const,
  searchParameter: (baseUrl: string, base: string, code: string) =>
    [...fhirQueryKeys.all(baseUrl), "SearchParameter", base, code] as const,
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

/** Returns the absolute URL of a Bundle's next page, or undefined when done. */
export const nextPageUrl = <T extends Resource>(
  bundle: Bundle<T> | undefined,
): string | undefined =>
  bundle?.link?.find((l) => l.relation === "next")?.url;

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

export function useStructureDefinition(
  type: string,
  options?: ReadQueryOpts<StructureDefinition>,
) {
  const client = useFhirClient();
  return useQuery({
    queryKey: fhirQueryKeys.structure(client.baseUrl, type),
    queryFn: ({ signal }) => resolveStructureDefinition(client, type, { signal }),
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
  const client = useFhirClient();
  const url = canonical ? canonical.split("|")[0]! : undefined;
  return useQuery({
    queryKey: fhirQueryKeys.valueSet(client.baseUrl, url ?? ""),
    queryFn: async ({ signal }) => {
      // 1. $expand
      try {
        return await client.request<ValueSet>({
          path: `/ValueSet/$expand?url=${encodeURIComponent(url!)}`,
          signal,
        });
      } catch {
        // fall through
      }
      // 2. search by url
      try {
        const bundle = await client.search<ValueSet>(
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
      const bundled = coreValueSet(url);
      if (bundled) return bundled;
      throw new Error(
        `ValueSet ${url} could not be resolved from this server and is not bundled in the library`,
      );
    },
    enabled: Boolean(url),
    staleTime: 24 * 60 * 60_000,
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
