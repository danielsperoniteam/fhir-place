import type { Quantity } from "fhir/r4";
import { baseField, subLabel, type FhirTypeInput } from "./types.js";

const UCUM_SYSTEM = "http://unitsofmeasure.org";

/** Quantity.comparator value set (required binding, R4). */
const COMPARATORS: Quantity["comparator"][] = ["<", "<=", ">=", ">"];

/**
 * SimpleQuantity is `Quantity` with a profile that forbids `comparator`
 * (https://hl7.org/fhir/R4/datatypes.html#SimpleQuantity) — hide the field
 * entirely so the editor can't produce an invalid instance.
 */
const isSimpleQuantity = (profiles: string[] | undefined): boolean =>
  (profiles ?? []).some((p) => p.endsWith("/SimpleQuantity"));

export const QuantityInput: FhirTypeInput<Quantity> = ({
  value,
  onChange,
  context,
  error,
}) => {
  const v = value ?? {};
  const patch = (k: keyof Quantity, val: unknown) => onChange({ ...v, [k]: val });
  const codeErrorId = error ? "quantity-code-error" : undefined;
  const allowComparator = !isSimpleQuantity(
    context.element.type?.find((t) => t.code === "Quantity")?.profile,
  );
  return (
    <div className="grid grid-cols-1 gap-2 rounded border border-slate-200 bg-slate-50 p-2 sm:grid-cols-[5rem_6rem_1fr_minmax(7rem,1fr)_8rem]">
      {allowComparator && (
        <label>
          <span className={subLabel}>Comparator</span>
          <select
            className={baseField}
            data-testid="quantity-comparator"
            value={v.comparator ?? ""}
            onChange={(e) =>
              patch("comparator", e.target.value === "" ? undefined : e.target.value)
            }
          >
            <option value="">=</option>
            {COMPARATORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}
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
        <span className={subLabel}>System</span>
        <input
          className={baseField}
          data-testid="quantity-system"
          placeholder={UCUM_SYSTEM}
          value={v.system ?? ""}
          onChange={(e) => patch("system", e.target.value || undefined)}
        />
      </label>
      <label>
        <span className={subLabel}>UCUM code</span>
        <input
          className={baseField}
          value={v.code ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={codeErrorId}
          onChange={(e) => {
            const code = e.target.value || undefined;
            // Per the spec a unit code without a system is unreliable —
            // default the system to UCUM as soon as a code is entered.
            onChange({
              ...v,
              code,
              system: code && !v.system ? UCUM_SYSTEM : v.system,
            });
          }}
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
