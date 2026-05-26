import type { Quantity } from "fhir/r4";
import { baseField, subLabel, type FhirTypeInput } from "./types.js";

export const QuantityInput: FhirTypeInput<Quantity> = ({ value, onChange, error }) => {
  const v = value ?? {};
  const patch = (k: keyof Quantity, val: unknown) => onChange({ ...v, [k]: val });
  const codeErrorId = error ? "quantity-code-error" : undefined;
  return (
    <div className="grid grid-cols-1 gap-2 rounded border border-slate-200 bg-slate-50 p-2 sm:grid-cols-[6rem_1fr_8rem]">
      <label>
        <span className={subLabel}>Value</span>
        <input
          type="number"
          step="any"
          className={baseField}
          value={v.value === undefined ? "" : v.value}
          onChange={(e) =>
            patch(
              "value",
              e.target.value === "" ? undefined : Number(e.target.value),
            )
          }
        />
      </label>
      <label>
        <span className={subLabel}>Unit</span>
        <input
          className={baseField}
          value={v.unit ?? ""}
          onChange={(e) => patch("unit", e.target.value || undefined)}
        />
      </label>
      <label>
        <span className={subLabel}>UCUM code</span>
        <input
          className={baseField}
          value={v.code ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={codeErrorId}
          onChange={(e) => patch("code", e.target.value || undefined)}
        />
        {error && (
          <span
            id={codeErrorId}
            data-testid="resource-editor-valuequantity-code-error"
            className="mt-1 block text-xs text-red-600"
          >
            {error}
          </span>
        )}
      </label>
    </div>
  );
};
