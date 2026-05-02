import type { FhirClient } from "@fhir-place/react-fhir";
import type { Bundle } from "fhir/r4";

// `cql-exec-fhir` ships only loose .d.ts globals, no top-level type export.
// The .js entry exposes PatientSource / FHIRWrapper as named exports; we
// shape them as `any` here and wrap behind a typed surface below.
// Loaded dynamically so it ships in the same chunk as `cql-execution`,
// fetched on-demand from `runCql`.
const loadCqlExecFhir = () => import("cql-exec-fhir");

/**
 * Builds a `cql-execution`-compatible DataProvider for a single patient by
 * fetching the patient's compartment from the active FHIR server up-front
 * and feeding the resulting Bundle into `cql-exec-fhir`. Only the seam at
 * the top of `runCql.ts` should know about cql-execution internals; this
 * file is the only place that talks FHIR REST on behalf of CQL.
 *
 * Why pre-fetch instead of streaming retrieves: cql-execution's DataProvider
 * is synchronous-ish (returns arrays from `findRecords`) and doesn't fit a
 * REST-per-retrieve pattern. `$everything` is the standard FHIR way to grab
 * a patient's compartment in one call, and HAPI / SMART both support it.
 */

export interface FhirDataSourceOptions {
  client: FhirClient;
  patientId: string;
  signal?: AbortSignal;
}

export interface BuiltDataSource {
  /** Pass directly to `Executor.exec()`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source: any;
  /** The bundle that was loaded; useful for debugging in the UI. */
  bundle: Bundle;
}

export async function buildFhirDataSource({
  client,
  patientId,
  signal,
}: FhirDataSourceOptions): Promise<BuiltDataSource> {
  const bundle = await fetchPatientEverything(client, patientId, signal);

  const cqlExecFhir = await loadCqlExecFhir();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factory = (cqlExecFhir as any).PatientSource ?? (cqlExecFhir as any).default?.PatientSource;
  if (!factory || typeof factory.FHIRv401 !== "function") {
    throw new Error(
      "cql-exec-fhir is missing PatientSource.FHIRv401 — peer dep mismatch with cql-execution?",
    );
  }
  const source = factory.FHIRv401();
  source.loadBundles([bundle]);
  return { source, bundle };
}

async function fetchPatientEverything(
  client: FhirClient,
  patientId: string,
  signal?: AbortSignal,
): Promise<Bundle> {
  // $everything returns a searchset Bundle with the Patient + compartment
  // resources. Some servers paginate; for Phase 1 a single page is enough —
  // a "no $everything" or paginated server can layer pagination later.
  try {
    return await client.request<Bundle>({
      path: `Patient/${encodeURIComponent(patientId)}/$everything`,
      method: "GET",
      signal,
    });
  } catch {
    // Fall back to a Patient read + a small compartment search if the server
    // doesn't expose $everything. Keeps the demo usable on minimal servers.
    return fallbackCompartment(client, patientId, signal);
  }
}

const FALLBACK_TYPES: ReadonlyArray<string> = [
  "Condition",
  "Observation",
  "Encounter",
  "MedicationRequest",
  "AllergyIntolerance",
  "Procedure",
  "Immunization",
];

async function fallbackCompartment(
  client: FhirClient,
  patientId: string,
  signal?: AbortSignal,
): Promise<Bundle> {
  const patient = await client.read("Patient", patientId, { signal });
  const compartments = await Promise.all(
    FALLBACK_TYPES.map((type) =>
      client
        .search(type, { patient: patientId }, { signal })
        .then((b) => b.entry ?? [])
        .catch(() => []),
    ),
  );
  const entries = [
    { resource: patient },
    ...compartments.flat().filter((e) => e.resource),
  ];
  return {
    resourceType: "Bundle",
    type: "searchset",
    entry: entries,
  } as Bundle;
}
