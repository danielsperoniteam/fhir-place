import { useMemo, useState } from "react";
import { useFhirClient } from "@fhir-place/react-fhir";
import { CQL_EXAMPLES } from "./examples.js";
import { ErrorPanel } from "./errors/ErrorPanel.js";
import { PatientContextPicker } from "./PatientContextPicker.js";
import { CqlResult } from "./results/CqlResult.js";
import { runCql, type RunFailure, type RunOutcome } from "./runCql.js";

export function CqlRunner() {
  const client = useFhirClient();
  const [cql, setCql] = useState<string>(CQL_EXAMPLES[0]!.cql);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [failure, setFailure] = useState<RunFailure | null>(null);

  const canRun = useMemo(
    () => Boolean(cql.trim()) && Boolean(patientId) && !running,
    [cql, patientId, running],
  );

  const handleRun = async () => {
    if (!patientId) return;
    setRunning(true);
    setFailure(null);
    setOutcome(null);
    try {
      const result = await runCql({ cql, client, patientId });
      if (result.ok) setOutcome(result.outcome);
      else setFailure(result.failure);
    } finally {
      setRunning(false);
    }
  };

  const handleLoadExample = (id: string) => {
    const ex = CQL_EXAMPLES.find((e) => e.id === id);
    if (ex) {
      setCql(ex.cql);
      setOutcome(null);
      setFailure(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <PatientContextPicker
          selectedPatientId={patientId}
          onSelect={setPatientId}
        />
        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">
            Load example
          </label>
          <select
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
            onChange={(e) => handleLoadExample(e.target.value)}
            data-testid="cql-example-picker"
            defaultValue=""
          >
            <option value="" disabled>
              Choose…
            </option>
            {CQL_EXAMPLES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.label}
              </option>
            ))}
          </select>
        </div>
      </aside>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700">CQL</label>
          <textarea
            value={cql}
            onChange={(e) => setCql(e.target.value)}
            className="h-64 w-full rounded border border-slate-300 p-2 font-mono text-xs"
            spellCheck={false}
            data-testid="cql-source"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun}
            className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:bg-slate-300"
            data-testid="cql-run"
          >
            {running ? "Running…" : "Run"}
          </button>
          {!patientId && (
            <span className="text-xs text-slate-500">
              Pick a patient to scope the run.
            </span>
          )}
        </div>
        <ErrorPanel
          translation={failure?.kind === "translation" ? failure.errors : undefined}
          execution={failure?.kind === "execution" ? failure.error : null}
          fhir={failure?.kind === "fhir" ? failure.error : undefined}
        />
        {outcome && (
          <div className="space-y-3" data-testid="cql-results">
            {Object.entries(outcome.values)
              // ELM emits a synthetic "Patient" expression name from the
              // `context Patient` line; surfacing it adds noise without value.
              .filter(([name]) => name !== "Patient")
              .map(([name, value]) => (
                <CqlResult key={name} name={name} value={value} />
              ))}
            {Object.keys(outcome.values).length === 0 && (
              <p className="text-sm text-slate-500">
                Run produced no expression results.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
