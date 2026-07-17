import { buildSearchParams, parseSearchRequest } from "@fhir-place/react-fhir";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Paste a FHIR search URL (absolute, relative, or bare `Type?query`) and load
 * it into the explorer (#145). Navigation targets `/fhir-ui/{type}?{query}`;
 * the list page hydrates its search form from the page URL, so this fills the
 * form and re-runs the search for same-type pastes and switches pages for
 * cross-type pastes with one code path.
 */
export function SearchUrlPaste() {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!input.trim()) return;
    try {
      const parsed = parseSearchRequest(input);
      // On the list page `?patient=<id>` doubles as compartment scoping, and
      // that machinery expects a bare id. A pasted FHIR filter often uses the
      // reference form (`patient=Patient/ada`) — normalize it so the pasted
      // search lands as a working compartment view instead of a broken
      // `Patient/Patient/ada` lookup.
      const params = { ...parsed.params };
      const bareId = (v: unknown) =>
        typeof v === "string" ? v.replace(/^Patient\//, "") : v;
      if (params.patient !== undefined) {
        params.patient = Array.isArray(params.patient)
          ? (params.patient.map(bareId) as string[])
          : (bareId(params.patient) as string);
      }
      const qs = buildSearchParams(params).toString();
      setError(null);
      setInput("");
      navigate(`/fhir-ui/${parsed.resourceType}${qs ? `?${qs}` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div data-testid="search-url-paste">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              load();
            }
          }}
          placeholder="Paste a FHIR search URL — e.g. Patient?name=smith"
          data-testid="search-url-paste-input"
          className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none"
        />
        <button
          type="button"
          onClick={load}
          data-testid="search-url-paste-load"
          className="rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface)]"
        >
          Load
        </button>
      </div>
      {error && (
        <p
          data-testid="search-url-paste-error"
          className="mt-1 text-xs"
          style={{ color: "var(--danger)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
