import { useState } from "react";
import type { Patient } from "fhir/r4";
import { useSearch } from "@fhir-place/react-fhir";

/**
 * Minimal patient picker for the runner: type-to-search by name, click to
 * select. No need for the full PatientListPage feature set here — the runner
 * just needs an id to scope the CQL execution to.
 */
export interface PatientContextPickerProps {
  selectedPatientId: string | null;
  onSelect: (id: string | null) => void;
}

const formatName = (p: Patient): string => {
  const n = p.name?.[0];
  if (!n) return p.id ?? "(no name)";
  const given = (n.given ?? []).join(" ");
  return `${given} ${n.family ?? ""}`.trim() || p.id || "(no name)";
};

export function PatientContextPicker({
  selectedPatientId,
  onSelect,
}: PatientContextPickerProps) {
  const [query, setQuery] = useState("");
  const params = query.trim() ? { name: query.trim(), _count: 10 } : { _count: 10 };
  const search = useSearch<Patient>("Patient", params);

  const patients = (search.data?.entry ?? [])
    .map((e) => e.resource)
    .filter((r): r is Patient => !!r && r.resourceType === "Patient");

  return (
    <div className="space-y-2" data-testid="patient-context-picker">
      <label className="block text-sm font-medium text-slate-700">
        Patient context
      </label>
      <input
        type="search"
        placeholder="Search patients by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <div className="max-h-40 overflow-y-auto rounded border border-slate-200">
        {search.isLoading && (
          <p className="p-2 text-xs text-slate-500">Loading…</p>
        )}
        {search.error && (
          <p className="p-2 text-xs text-red-700">
            {(search.error as Error).message}
          </p>
        )}
        {!search.isLoading && patients.length === 0 && (
          <p className="p-2 text-xs text-slate-500">No matches.</p>
        )}
        <ul>
          {patients.map((p) => {
            const id = p.id!;
            const selected = id === selectedPatientId;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(selected ? null : id)}
                  className={`block w-full px-2 py-1 text-left text-sm ${
                    selected
                      ? "bg-blue-50 text-blue-900"
                      : "hover:bg-slate-50"
                  }`}
                  data-testid={`patient-option-${id}`}
                >
                  <span className="font-medium">{formatName(p)}</span>{" "}
                  <span className="text-xs text-slate-500">{id}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {selectedPatientId && (
        <p className="text-xs text-slate-600">
          Selected: <span className="font-mono">{selectedPatientId}</span>
        </p>
      )}
    </div>
  );
}
