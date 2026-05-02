export interface FhirQueryPlan {
  resourceType: string;
  params: Record<string, string>;
  explanation: string;
}

export const buildSearchUrl = (
  baseUrl: string,
  plan: Pick<FhirQueryPlan, "resourceType" | "params">,
): string => {
  const trimmedBase = baseUrl.replace(/\/$/, "");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(plan.params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.append(k, v);
  }
  const query = qs.toString();
  return query
    ? `${trimmedBase}/${plan.resourceType}?${query}`
    : `${trimmedBase}/${plan.resourceType}`;
};

export interface ParsedSearchUrl {
  baseUrl: string;
  resourceType: string;
  params: Record<string, string>;
}

/** Split a full FHIR search URL back into the pieces a client needs. */
export const parseSearchUrl = (url: string): ParsedSearchUrl => {
  const u = new URL(url);
  const segments = u.pathname.split("/").filter(Boolean);
  const resourceType = segments[segments.length - 1] ?? "";
  const baseUrl = `${u.origin}${segments.length > 1 ? "/" + segments.slice(0, -1).join("/") : ""}`;
  const params: Record<string, string> = {};
  u.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  return { baseUrl, resourceType, params };
};

/**
 * True when `target` resolves to the same origin as `base`. Both inputs may be
 * absolute (`https://x/fhir`) or root-relative (`/fhir`) — relative ones are
 * resolved against `referenceHref` (typically `window.location.href`).
 *
 * Used to gate sending the active FHIR server's auth headers on the /ask page,
 * since the request URL there is user-editable. Without this check, a user who
 * edits the host could leak bearer tokens to a third party.
 */
export const sameOrigin = (
  target: string,
  base: string,
  referenceHref: string,
): boolean => {
  try {
    return new URL(target, referenceHref).origin === new URL(base, referenceHref).origin;
  } catch {
    return false;
  }
};
