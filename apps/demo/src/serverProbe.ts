import type { CapabilityStatement } from "fhir/r4";
import { type ServerConfig, buildRequestHeaders } from "./config.js";

export type ProbeResult =
  | { ok: true; software?: string; fhirVersion?: string }
  | { ok: false; kind: "http" | "network"; message: string };

export interface ProbeOptions {
  fetchImpl?: typeof fetch;
}

/**
 * Hit `${baseUrl}/metadata` with the server's auth/custom headers and report
 * back a tiny summary (software name, FHIR version) or a typed error. Keeps
 * the SettingsPage UI dumb and lets us cover the success / HTTP / CORS /
 * network paths in a node test environment without jsdom.
 */
export async function probeFhirServer(
  server: ServerConfig,
  options: ProbeOptions = {},
): Promise<ProbeResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${server.baseUrl.replace(/\/+$/, "")}/metadata`;
  const headers: Record<string, string> = {
    Accept: "application/fhir+json",
    ...buildRequestHeaders(server),
  };

  let res: Response;
  try {
    res = await fetchImpl(url, { headers });
  } catch (err) {
    // Browsers surface CORS and offline as `TypeError: Failed to fetch`. The
    // hint nudges users toward the real fix (proxy / CORS-enabled host)
    // instead of having them stare at a generic message.
    const message = err instanceof Error ? err.message : String(err);
    const isNetwork =
      err instanceof TypeError || /failed to fetch|networkerror/i.test(message);
    return {
      ok: false,
      kind: isNetwork ? "network" : "http",
      message: isNetwork
        ? `${message} — likely a CORS or network issue. Check the browser console for details.`
        : message,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      kind: "http",
      message: `HTTP ${res.status} ${res.statusText}`,
    };
  }

  const cs = (await res.json()) as CapabilityStatement;
  return {
    ok: true,
    ...(cs.software?.name ? { software: cs.software.name } : {}),
    ...(cs.fhirVersion ? { fhirVersion: cs.fhirVersion } : {}),
  };
}
