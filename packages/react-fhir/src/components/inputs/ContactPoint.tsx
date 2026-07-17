import type { ContactPoint } from "fhir/r4";
import { baseField, type FhirTypeInput } from "./types.js";

export const ContactPointInput: FhirTypeInput<ContactPoint> = ({ value, onChange }) => {
  const v = value ?? {};
  const patch = (k: keyof ContactPoint, val: unknown) => onChange({ ...v, [k]: val });
  return (
    <div className="rounded border border-[var(--border,#e2e8f0)] bg-[var(--sunken,#f8fafc)] p-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr_8rem]">
        <select
          className={baseField}
          value={v.system ?? ""}
          onChange={(e) => patch("system", e.target.value || undefined)}
        >
          <option value="">system</option>
          {["phone", "fax", "email", "pager", "url", "sms", "other"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          className={baseField}
          placeholder="value"
          value={v.value ?? ""}
          onChange={(e) => patch("value", e.target.value || undefined)}
        />
        <select
          className={baseField}
          value={v.use ?? ""}
          onChange={(e) => patch("use", e.target.value || undefined)}
        >
          <option value="">use</option>
          {["home", "work", "temp", "old", "mobile"].map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
