import type { StructureDefinition } from "fhir/r4";
import type { FhirClient } from "../client/types.js";
import { FhirError } from "../client/types.js";
import { coreStructureDefinition } from "./core/index.js";

export interface ResolveOptions {
  /** Optional profile canonical URL to resolve instead of the base type SD. */
  profile?: string | null;
  signal?: AbortSignal;
  /** Override the canonical URL derivation (defaults to `http://hl7.org/fhir/StructureDefinition/{type}`). */
  canonical?: string;
  /** When false, skip the bundled-core fallback (useful in tests). */
  useBundledFallback?: boolean;
}

const canonicalFor = (type: string) =>
  `http://hl7.org/fhir/StructureDefinition/${type}`;

/**
 * Resolves a StructureDefinition against any FHIR server using a three-step
 * fallback:
 *
 *   1. Instance read at `StructureDefinition/{type}` (cheap when stored).
 *   2. Search by canonical URL (`StructureDefinition?url=...`) — picks first hit.
 *   3. Library-bundled core SD if one ships for this type.
 *
 * Throws only when all three fail, with a message that names the type and
 * hints at the workaround (supplying an SD explicitly).
 */
export async function resolveStructureDefinition(
  client: FhirClient,
  type: string,
  options: ResolveOptions = {},
): Promise<StructureDefinition> {
  const signal = options.signal;
  const canonical = options.canonical ?? options.profile ?? canonicalFor(type);
  const canonicalType = canonicalFor(type);
  const useProfile = Boolean(options.profile);
  const canUseBundledFallback = canonical === canonicalType;

  // 1. Instance read. For profiled canonicals, attempt an ID read only when inferable.
  const readId = useProfile ? inferIdFromCanonical(canonical) : type;
  if (readId) {
    try {
      return await client.read<StructureDefinition>("StructureDefinition", readId, {
        signal,
      });
    } catch (err) {
      if (!shouldFallback(err)) throw err;
    }
  }

  // 2. Search by canonical URL.
  try {
    const bundle = await client.search<StructureDefinition>(
      "StructureDefinition",
      { url: canonical },
      { signal },
    );
    const hit = bundle.entry?.find(
      (e) => e.resource?.resourceType === "StructureDefinition",
    )?.resource;
    if (hit) return hit;
  } catch (err) {
    if (!shouldFallback(err)) throw err;
  }

  // 3. Bundled core fallback.
  if (options.useBundledFallback !== false && canUseBundledFallback) {
    const bundled = await coreStructureDefinition(type);
    if (bundled) return bundled;
  }

  throw new Error(
    `Could not resolve StructureDefinition for "${type}". ` +
      `Server does not store it at /StructureDefinition/${type}, ` +
      `does not return it via ?url=${canonical}, ` +
      `and the library does not ship a bundled copy for this type. ` +
      `Supply one explicitly via the structureDefinition prop.`,
  );
}

/**
 * We only fall back on 404 / 410 / 501 / 405 errors (server says it doesn't
 * have it). Other errors (auth, network abort, 500) bubble up so callers can
 * surface the real problem instead of silently masking it with a bundled SD.
 */
function shouldFallback(err: unknown): boolean {
  if (err instanceof FhirError) {
    return [404, 410, 405, 501].includes(err.status);
  }
  // Treat non-FhirError exceptions (TypeError, AbortError, etc.) as bubbling.
  return false;
}


function inferIdFromCanonical(canonical: string): string | null {
  try {
    const url = new URL(canonical);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
}
