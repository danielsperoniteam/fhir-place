export const USE_MOCK =
  import.meta.env.VITE_USE_MOCK === "true" || import.meta.env.DEV;

/** Vite's BASE_URL — "/" locally, "/fhir-place/" on GitHub Pages. */
const BASE = import.meta.env.BASE_URL;

export type AuthMode = "none" | "bearer";

export type CustomHeader = { key: string; value: string };

export interface ServerConfig {
  id: string;
  label: string;
  baseUrl: string;
  authMode: AuthMode;
  bearerToken?: string;
  headers?: CustomHeader[];
  /** Built-in servers can't be deleted, but their auth/headers can still be edited. */
  builtin?: boolean;
}

/**
 * Built-in public FHIR R4 servers. Both support open access and CORS so the
 * browser can reach them directly. Users can layer auth/custom headers on top
 * via the Settings page (e.g. a personal access token for HAPI).
 */
export const BUILTIN_SERVERS: ReadonlyArray<ServerConfig> = [
  {
    id: "builtin-hapi",
    label: "HAPI Public Test Server",
    baseUrl: "https://hapi.fhir.org/baseR4",
    authMode: "none",
    builtin: true,
  },
  {
    id: "builtin-smart",
    label: "SMART Health IT (R4)",
    baseUrl: "https://r4.smarthealthit.org",
    authMode: "none",
    builtin: true,
  },
  {
    id: "builtin-firely",
    label: "Firely Server (R4)",
    baseUrl: "https://server.fire.ly",
    authMode: "none",
    builtin: true,
  },
  {
    id: "builtin-fhir-test",
    label: "test.fhir.org (R4)",
    baseUrl: "https://test.fhir.org/r4",
    authMode: "none",
    builtin: true,
  },
];

const SERVERS_STORAGE_KEY = "fhir-place:servers";
const ACTIVE_SERVER_STORAGE_KEY = "fhir-place:active-server";
const ANTHROPIC_API_KEY_STORAGE_KEY = "fhir-place:anthropic-api-key";
const TERMINOLOGY_BASE_URL_STORAGE_KEY = "fhir-place:terminology-base-url";

export const loadAnthropicApiKey = (): string => {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(ANTHROPIC_API_KEY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

export const saveAnthropicApiKey = (key: string): void => {
  if (typeof window === "undefined") return;
  try {
    if (key) window.localStorage.setItem(ANTHROPIC_API_KEY_STORAGE_KEY, key);
    else window.localStorage.removeItem(ANTHROPIC_API_KEY_STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const parseServer = (v: unknown): ServerConfig | null => {
  if (!isPlainObject(v)) return null;
  const { id, label, baseUrl, authMode, bearerToken, headers, builtin } = v;
  if (typeof id !== "string" || typeof label !== "string" || typeof baseUrl !== "string") {
    return null;
  }
  if (authMode !== "none" && authMode !== "bearer") return null;
  const parsedHeaders = Array.isArray(headers)
    ? headers
        .filter(isPlainObject)
        .filter((h) => typeof h.key === "string" && typeof h.value === "string")
        .map((h) => ({ key: h.key as string, value: h.value as string }))
    : undefined;
  return {
    id,
    label,
    baseUrl,
    authMode,
    ...(typeof bearerToken === "string" && bearerToken ? { bearerToken } : {}),
    ...(parsedHeaders && parsedHeaders.length > 0 ? { headers: parsedHeaders } : {}),
    ...(builtin === true ? { builtin: true } : {}),
  };
};

const readStoredServers = (): ServerConfig[] | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SERVERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const servers = parsed.map(parseServer).filter((s): s is ServerConfig => s !== null);
    return servers.length > 0 ? servers : null;
  } catch {
    return null;
  }
};

/**
 * Merge built-ins with stored config so:
 * - Built-ins always exist (even if storage is empty/corrupt).
 * - Stored edits to built-ins (auth, headers, label) survive.
 * - Custom user-added servers come through unchanged.
 */
const mergeWithBuiltins = (stored: ServerConfig[] | null): ServerConfig[] => {
  if (!stored) return BUILTIN_SERVERS.map((s) => ({ ...s }));
  const byId = new Map(stored.map((s) => [s.id, s]));
  const merged: ServerConfig[] = [];
  for (const builtin of BUILTIN_SERVERS) {
    const override = byId.get(builtin.id);
    merged.push(override ? { ...override, builtin: true } : { ...builtin });
    byId.delete(builtin.id);
  }
  for (const remaining of byId.values()) {
    merged.push({ ...remaining, builtin: false });
  }
  return merged;
};

export const loadServers = (): ServerConfig[] => mergeWithBuiltins(readStoredServers());

export const saveServers = (servers: ReadonlyArray<ServerConfig>): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SERVERS_STORAGE_KEY, JSON.stringify(servers));
  } catch {
    // localStorage unavailable (private mode, quota); changes simply don't persist.
  }
};

export const loadActiveServerId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_SERVER_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const saveActiveServerId = (id: string): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_SERVER_STORAGE_KEY, id);
  } catch {
    // see saveServers
  }
};

const FALLBACK_SERVER: ServerConfig = {
  id: "builtin-hapi",
  label: "HAPI Public Test Server",
  baseUrl: "https://hapi.fhir.org/baseR4",
  authMode: "none",
  builtin: true,
};

export const resolveActiveServer = (): ServerConfig => {
  const servers = loadServers();
  const activeId = loadActiveServerId();
  if (activeId) {
    const match = servers.find((s) => s.id === activeId);
    if (match) return match;
  }
  return servers[0] ?? { ...FALLBACK_SERVER };
};

const ACTIVE_SERVER: ServerConfig = (() => {
  if (USE_MOCK) {
    return {
      id: "mock",
      label: "Mock (MSW)",
      baseUrl: `${BASE}fhir`,
      authMode: "none",
      builtin: true,
    };
  }
  if (import.meta.env.VITE_FHIR_BASE_URL) {
    return {
      id: "env-override",
      label: "Env override",
      baseUrl: import.meta.env.VITE_FHIR_BASE_URL,
      authMode: "none",
      builtin: true,
    };
  }
  return resolveActiveServer();
})();

export const ACTIVE_SERVER_CONFIG: ServerConfig = ACTIVE_SERVER;

export const FHIR_BASE_URL: string = ACTIVE_SERVER.baseUrl;

/** Static headers derived from the active server's auth + custom headers. */
export const buildRequestHeaders = (server: ServerConfig): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (server.authMode === "bearer" && server.bearerToken) {
    headers.Authorization = `Bearer ${server.bearerToken}`;
  }
  for (const h of server.headers ?? []) {
    if (h.key.trim()) headers[h.key] = h.value;
  }
  return headers;
};

/**
 * Separate terminology server for ValueSet/$expand. Most data servers (HAPI
 * default, Aidbox without a SNOMED license, Medplum) cannot expand SNOMED,
 * LOINC, ICD-10, or BCP-47, so dropdowns bound to those code systems return
 * 4xx/5xx and stay empty. `tx.fhir.org` is the HL7 community terminology
 * service, allows browser CORS, and covers the common bindings.
 *
 * Note: embedding this URL does NOT grant any user a SNOMED license. Self-
 * hosted production deployments must use a licensed Ontoserver/Snowstorm and
 * a CORS proxy. See https://www.hl7.org/fhir/snomedct.html and IHTSDO's
 * licensing docs.
 */
export const DEFAULT_TERMINOLOGY_BASE_URL = "https://tx.fhir.org/r4";

export const loadStoredTerminologyBaseUrl = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(TERMINOLOGY_BASE_URL_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
};

export const saveTerminologyBaseUrl = (url: string): void => {
  if (typeof window === "undefined") return;
  try {
    const trimmed = url.trim();
    if (trimmed) {
      window.localStorage.setItem(TERMINOLOGY_BASE_URL_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(TERMINOLOGY_BASE_URL_STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable; changes simply don't persist.
  }
};

const TERMINOLOGY_BASE_URL_RESOLVED: string = (() => {
  if (USE_MOCK) return FHIR_BASE_URL;
  if (import.meta.env.VITE_TERMINOLOGY_BASE_URL) {
    return import.meta.env.VITE_TERMINOLOGY_BASE_URL;
  }
  return loadStoredTerminologyBaseUrl() ?? DEFAULT_TERMINOLOGY_BASE_URL;
})();

export const TERMINOLOGY_BASE_URL: string = TERMINOLOGY_BASE_URL_RESOLVED;

export const ROUTER_BASENAME: string = BASE.replace(/\/$/, "") || "/";

/**
 * Use HashRouter when the app is hosted on a static path other than the
 * server root (e.g. `/fhir-place/` on GitHub Pages). Hash-based URLs avoid
 * HTTP 404s on direct deep-link loads because static hosts only serve files
 * that exist; they have no way to know `/fhir-place/Patient` is a virtual
 * SPA route. See issue #47.
 */
export const USE_HASH_ROUTER: boolean =
  import.meta.env.VITE_USE_HASH_ROUTER === "true" ||
  (BASE !== "/" && !import.meta.env.DEV);

/**
 * Whether the in-app server picker / settings UI should be shown. Hidden in
 * mock mode and when an env override pins the base URL.
 */
export const SETTINGS_ENABLED: boolean =
  !USE_MOCK && !import.meta.env.VITE_FHIR_BASE_URL;
