import type { Identifier } from "fhir/r4";
import { baseField, subLabel, type FhirTypeInput } from "./types.js";

export const IdentifierInput: FhirTypeInput<Identifier> = ({ value, onChange }) => {
  const v = value ?? {};
  const patch = (k: keyof Identifier, val: unknown) => onChange({ ...v, [k]: val });
  return (
    <div className="grid grid-cols-1 gap-2 rounded border border-[var(--border,#e2e8f0)] bg-[var(--sunken,#f8fafc)] p-2 sm:grid-cols-2">
      <label>
        <span className={subLabel}>System</span>
        <input
          className={baseField}
          value={v.system ?? ""}
          onChange={(e) => patch("system", e.target.value || undefined)}
        />
      </label>
      <label>
        <span className={subLabel}>Value</span>
        <input
          className={baseField}
          value={v.value ?? ""}
          onChange={(e) => patch("value", e.target.value || undefined)}
        />
      </label>
    </div>
  );
};
