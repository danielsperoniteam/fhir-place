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
  // URLSearchParams percent-encodes `:` (modifier keys like `given:exact`)
  // even though RFC 3986 allows a literal colon in the query. Decode it for
  // readability — this preview's job is to teach FHIR search syntax, and
  // both spellings are equivalent on the wire.
  const queryString = qs.toString().replace(/%3A/g, ":");
  const path = `/${resourceType}${queryString ? `?${queryString}` : ""}`;
  return {
    method: "GET",
    url: `${trimSlash(baseUrl)}${path}`,
    path,
    queryString,
    params: Array.from(qs.entries()),
  };
}

export interface ParsedSearchRequest {
  resourceType: string;
  params: SearchParams;
  /** Base URL when the input was an absolute URL; undefined for relative paths. */
  baseUrl?: string;
}

/** FHIR resource type names: UpperCamelCase ASCII, no digits in R4. */
const RESOURCE_TYPE_RE = /^[A-Z][A-Za-z]+$/;

/**
 * Inverse of {@link formatSearchRequest}: parses a FHIR search URL back into
 * a resource type + SearchParams. Accepts an absolute URL
 * (`https://…/baseR4/Patient?name=smith`), a relative path
 * (`/Patient?name=smith`), or a bare query (`Patient?name=smith`).
 *
 * Repeated keys collapse to `string[]` (AND semantics), matching what
 * `buildSearchParams` emits; comma-joined OR values stay a single string.
 * Modifiers (`name:contains`) and chained params (`subject:Patient.name`)
 * pass through unchanged as keys.
 *
 * Throws on input with no recognisable resource type segment.
 */
export function parseSearchRequest(input: string): ParsedSearchRequest {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Empty search URL");

  let pathname: string;
  let query: string;
  let origin: string | undefined;
  if (/^https?:\/\//i.test(trimmed)) {
    const u = new URL(trimmed);
    pathname = u.pathname;
    query = u.search;
    origin = u.origin;
  } else {
    const qIdx = trimmed.indexOf("?");
    pathname = qIdx === -1 ? trimmed : trimmed.slice(0, qIdx);
    query = qIdx === -1 ? "" : trimmed.slice(qIdx);
  }

  const segments = pathname.split("/").filter(Boolean);
  const resourceType = segments.pop();
  if (!resourceType || !RESOURCE_TYPE_RE.test(resourceType)) {
    throw new Error(
      `No FHIR resource type found in "${trimmed}" — expected e.g. Patient?name=smith`,
    );
  }

  const params: SearchParams = {};
  for (const [key, value] of new URLSearchParams(query)) {
    const existing = params[key];
    if (existing === undefined) {
      params[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      params[key] = [existing, value];
    }
  }

  return {
    resourceType,
    params,
    baseUrl: origin !== undefined ? `${origin}/${segments.join("/")}`.replace(/\/$/, "") : undefined,
  };
}
