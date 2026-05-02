import type { Coding } from "fhir/r4";
import { baseField, subLabel, type FhirTypeInput } from "./types.js";

/**
 * Plain System / Code / Display fields. Used directly for unbound Coding
 * elements, and surfaced as a "switch to manual entry" fallback inside the
 * ValueSet-driven autocomplete when the server can't expand.
 */
export const CodingInputManual: FhirTypeInput<Coding> = ({ value, onChange }) => {
  const v = value ?? {};
  const patch = (k: keyof Coding, val: unknown) => onChange({ ...v, [k]: val });
  return (
    <div className="grid grid-cols-1 gap-2 rounded border border-slate-200 bg-slate-50 p-2 sm:grid-cols-3">
      <label>
        <span className={subLabel}>System</span>
        <input
          className={baseField}
          value={v.system ?? ""}
          onChange={(e) => patch("system", e.target.value || undefined)}
        />
      </label>
      <label>
        <span className={subLabel}>Code</span>
        <input
          className={baseField}
          value={v.code ?? ""}
          onChange={(e) => patch("code", e.target.value || undefined)}
        />
      </label>
      <label>
        <span className={subLabel}>Display</span>
        <input
          className={baseField}
          value={v.display ?? ""}
          onChange={(e) => patch("display", e.target.value || undefined)}
        />
      </label>
    </div>
  );
};
