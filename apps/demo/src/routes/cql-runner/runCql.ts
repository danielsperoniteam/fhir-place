import type { FhirClient } from "@fhir-place/react-fhir";
import { buildFhirDataSource } from "./fhirDataSource.js";
import { translateCql, type TranslationError } from "./translator.js";

// Dynamically imported so the ~2.5 MB `cql-execution` package is only
// fetched when the user actually runs CQL — keeps the editor lightweight
// when someone just opens the runner page.
const loadCqlExecution = () => import("cql-execution");

/**
 * Single seam between the UI and the CQL runtime. Long-term, swapping in a
 * server-side execution path means replacing the body of this file without
 * touching any component code.
 */

export interface RunOutcome {
  /** ELM expression name → evaluated value. */
  values: Record<string, unknown>;
  patientId: string;
}

export type RunFailure =
  | { kind: "translation"; errors: TranslationError[] }
  | { kind: "execution"; error: Error }
  | { kind: "fhir"; error: unknown };

export type RunResult =
  | { ok: true; outcome: RunOutcome }
  | { ok: false; failure: RunFailure };

export interface RunCqlOptions {
  cql: string;
  client: FhirClient;
  patientId: string;
  signal?: AbortSignal;
}

export async function runCql({
  cql,
  client,
  patientId,
  signal,
}: RunCqlOptions): Promise<RunResult> {
  const translation = await translateCql(cql, { signal });
  if (!translation.ok) {
    return { ok: false, failure: { kind: "translation", errors: translation.errors } };
  }

  let dataSource;
  try {
    dataSource = await buildFhirDataSource({ client, patientId, signal });
  } catch (error) {
    return { ok: false, failure: { kind: "fhir", error } };
  }

  try {
    const cqlExecution = await loadCqlExecution();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Library, Executor } = cqlExecution as any;
    const library = new Library(translation.elm);
    const executor = new Executor(library);
    const results = await executor.exec(dataSource.source);
    const values = extractPatientResults(results, patientId);
    return { ok: true, outcome: { values, patientId } };
  } catch (err) {
    return {
      ok: false,
      failure: {
        kind: "execution",
        error: err instanceof Error ? err : new Error(String(err)),
      },
    };
  }
}

/**
 * `Executor.exec` returns a `Results` object with `patientResults[patientId]`
 * keyed by ELM expression name. Phase 1 only supports single-patient runs,
 * so collapse to one expression-name → value map.
 */
const extractPatientResults = (
  results: unknown,
  patientId: string,
): Record<string, unknown> => {
  if (!results || typeof results !== "object") return {};
  const r = results as { patientResults?: Record<string, Record<string, unknown>> };
  const byPatient = r.patientResults ?? {};
  return byPatient[patientId] ?? Object.values(byPatient)[0] ?? {};
};
