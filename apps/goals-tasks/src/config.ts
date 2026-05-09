export const USE_MOCK =
  import.meta.env.VITE_USE_MOCK === "true" || import.meta.env.DEV;

const BASE = import.meta.env.BASE_URL;

export const FHIR_BASE_URL: string =
  import.meta.env.VITE_FHIR_BASE_URL ??
  (USE_MOCK ? `${BASE}fhir` : "https://r4.smarthealthit.org");

export const ROUTER_BASENAME: string = BASE.replace(/\/$/, "") || "/";

/**
 * Use HashRouter when hosted on a static path other than the server root
 * (e.g. `/fhir-place/goals/` on GitHub Pages). The Pages 404 fallback is at
 * the site root, so deep links into a sub-app would otherwise render the
 * sibling site instead of this one. Mirrors the demo's pattern (see #47).
 */
export const USE_HASH_ROUTER: boolean =
  import.meta.env.VITE_USE_HASH_ROUTER === "true" ||
  (BASE !== "/" && !import.meta.env.DEV);

/** Hardcoded "current" patient for this demo — in a real app this would come from SMART launch context or a picker. */
export const DEMO_PATIENT_ID = "demo-patient";
