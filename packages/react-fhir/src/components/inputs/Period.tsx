import type { Period } from "fhir/r4";
import { baseField, subLabel, type FhirTypeInput } from "./types.js";

export const PeriodInput: FhirTypeInput<Period> = ({ value, onChange }) => {
  const v = value ?? {};
  const patch = (k: keyof Period, val: unknown) => onChange({ ...v, [k]: val });
  return (
    <div className="grid grid-cols-1 gap-2 rounded border border-[var(--border,#e2e8f0)] bg-[var(--sunken,#f8fafc)] p-2 sm:grid-cols-2">
      <label>
        <span className={subLabel}>Start</span>
        <input
          type="datetime-local"
          className={baseField}
          value={v.start?.slice(0, 16) ?? ""}
          onChange={(e) =>
            patch(
              "start",
              e.target.value ? new Date(e.target.value).toISOString() : undefined,
            )
          }
        />
      </label>
      <label>
        <span className={subLabel}>End</span>
        <input
          type="datetime-local"
          className={baseField}
          value={v.end?.slice(0, 16) ?? ""}
          onChange={(e) =>
            patch(
              "end",
              e.target.value ? new Date(e.target.value).toISOString() : undefined,
            )
          }
        />
      </label>
    </div>
  );
};
