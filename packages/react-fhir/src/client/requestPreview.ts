import { buildSearchParams } from "./searchParams.js";
import type { SearchParams } from "./types.js";

export interface SearchRequestPreview {
  method: "GET";
  /** Full request URL: base + path + query string. */
  url: string;
  /** Path portion the client appends to the base URL. */
  path: string;
  /** Query string without the leading `?`. */
  queryString: string;
  /** Ordered key/value pairs as they would appear on the wire. */
  params: Array<[string, string]>;
}

const trimSlash = (s: string): string => s.replace(/\/+$/, "");

/**
 * Returns the GET request that `FhirClient.search(type, params)` would issue,
 * without sending it. Useful for devtools / docs / agent prompts where you
 * want to surface the URL the user's form is generating.
 */
export function formatSearchRequest(
  baseUrl: string,
  resourceType: string,
  params?: SearchParams,
): SearchRequestPreview {
  const qs = buildSearchParams(params);
  const queryString = qs.toString();
  const path = `/${resourceType}${queryString ? `?${queryString}` : ""}`;
  return {
    method: "GET",
    url: `${trimSlash(baseUrl)}${path}`,
    path,
    queryString,
    params: Array.from(qs.entries()),
  };
}
