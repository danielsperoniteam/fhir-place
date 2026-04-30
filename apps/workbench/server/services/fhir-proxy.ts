import type { DataConnection } from "../../db/schema.js";
import {
  MAX_COUNT,
  ResourceType,
  SEARCH_PARAM_ALLOWLIST,
} from "../schemas.js";
import { authHeadersFor } from "./fhir-connection.js";

export type ProxyResult =
  | { ok: true; status: number; body: unknown }
  | {
      ok: false;
      status: number;
      error: string;
      body?: unknown;
    };

interface ProxyTarget {
  baseUrl: string;
  authType: DataConnection["authType"];
  authToken: DataConnection["authToken"];
}

/**
 * Drop any search parameter that isn't on the allow-list for this resource
 * type. Per-resource lists live in `schemas.ts` so the boundary is one
 * place to inspect.
 *
 * Multiple values per key are preserved (FHIR uses repeats and commas).
 */
export function filterSearchParams(
  resourceType: ResourceType,
  raw: URLSearchParams,
): URLSearchParams {
  const allowed = new Set(SEARCH_PARAM_ALLOWLIST[resourceType]);
  const out = new URLSearchParams();
  for (const [key, value] of raw) {
    if (!allowed.has(key)) continue;
    if (key === "_count") {
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n) || n <= 0) continue;
      out.append("_count", String(Math.min(n, MAX_COUNT)));
      continue;
    }
    out.append(key, value);
  }
  if (!out.has("_count")) out.set("_count", "20");
  return out;
}

export async function proxySearch(
  conn: ProxyTarget,
  resourceType: ResourceType,
  rawParams: URLSearchParams,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ProxyResult> {
  const params = filterSearchParams(resourceType, rawParams);
  const qs = params.toString();
  const url = `${conn.baseUrl.replace(/\/$/, "")}/${resourceType}${qs ? `?${qs}` : ""}`;
  return executeGet(url, conn, fetchFn, signal);
}

export async function proxyRead(
  conn: ProxyTarget,
  resourceType: ResourceType,
  resourceId: string,
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ProxyResult> {
  if (!isValidFhirId(resourceId)) {
    return {
      ok: false,
      status: 400,
      error: `invalid id: ${resourceId}`,
    };
  }
  const url = `${conn.baseUrl.replace(/\/$/, "")}/${resourceType}/${resourceId}`;
  return executeGet(url, conn, fetchFn, signal);
}

/**
 * FHIR `id` regex from the R4 spec — `[A-Za-z0-9\-\.]{1,64}`. Validated at
 * the proxy boundary so we never put untrusted data into a path segment.
 */
function isValidFhirId(id: string): boolean {
  return /^[A-Za-z0-9\-.]{1,64}$/.test(id);
}

async function executeGet(
  url: string,
  conn: ProxyTarget,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<ProxyResult> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "GET",
      headers: {
        Accept: "application/fhir+json",
        ...authHeadersFor(conn),
      },
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: `network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // body stays null; some FHIR errors are bodyless
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: `upstream HTTP ${response.status}`,
      body,
    };
  }

  return { ok: true, status: response.status, body };
}
