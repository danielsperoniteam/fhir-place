import type { HumanName } from "fhir/r4";
import { baseField, subLabel, subRow, type FhirTypeInput } from "./types.js";

export const HumanNameInput: FhirTypeInput<HumanName> = ({ value, onChange }) => {
  const v = value ?? {};
  const patch = (k: keyof HumanName, val: unknown) => {
    const next = { ...v, [k]: val };
    onChange(
      val === undefined || val === ""
        ? Object.keys(next).length
          ? next
          : undefined
        : next,
    );
  };
  return (
    <div className="space-y-2 rounded border border-[var(--border,#e2e8f0)] bg-[var(--sunken,#f8fafc)] p-2">
      <div className={subRow}>
        <label>
          <span className={subLabel}>Given (comma-separated)</span>
          <input
            className={baseField}
            value={v.given?.join(", ") ?? ""}
            onChange={(e) =>
              patch(
                "given",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        </label>
        <label>
          <span className={subLabel}>Family</span>
          <input
            className={baseField}
            value={v.family ?? ""}
            onChange={(e) => patch("family", e.target.value || undefined)}
          />
        </label>
      </div>
      <label>
        <span className={subLabel}>Use</span>
        <select
          className={baseField}
          value={v.use ?? ""}
          onChange={(e) => patch("use", e.target.value || undefined)}
        >
          <option value="">—</option>
          {["usual", "official", "temp", "nickname", "anonymous", "old", "maiden"].map(
            (u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ),
          )}
        </select>
      </label>
    </div>
  );
};
