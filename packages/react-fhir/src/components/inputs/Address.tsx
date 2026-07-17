import type { Address } from "fhir/r4";
import { baseField, subLabel, subRow, type FhirTypeInput } from "./types.js";

export const AddressInput: FhirTypeInput<Address> = ({ value, onChange }) => {
  const v = value ?? {};
  const patch = (k: keyof Address, val: unknown) => onChange({ ...v, [k]: val });
  return (
    <div className="space-y-2 rounded border border-[var(--border,#e2e8f0)] bg-[var(--sunken,#f8fafc)] p-2">
      <label>
        <span className={subLabel}>Line (comma-separated)</span>
        <input
          className={baseField}
          value={v.line?.join(", ") ?? ""}
          onChange={(e) =>
            patch(
              "line",
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      </label>
      <div className={subRow}>
        <label>
          <span className={subLabel}>City</span>
          <input
            className={baseField}
            value={v.city ?? ""}
            onChange={(e) => patch("city", e.target.value || undefined)}
          />
        </label>
        <label>
          <span className={subLabel}>Postal code</span>
          <input
            className={baseField}
            value={v.postalCode ?? ""}
            onChange={(e) => patch("postalCode", e.target.value || undefined)}
          />
        </label>
        <label>
          <span className={subLabel}>State</span>
          <input
            className={baseField}
            value={v.state ?? ""}
            onChange={(e) => patch("state", e.target.value || undefined)}
          />
        </label>
        <label>
          <span className={subLabel}>Country</span>
          <input
            className={baseField}
            value={v.country ?? ""}
            onChange={(e) => patch("country", e.target.value || undefined)}
          />
        </label>
      </div>
    </div>
  );
};
