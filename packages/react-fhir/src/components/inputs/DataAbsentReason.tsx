import type { CodeableConcept } from "fhir/r4";
import { CodeableConceptInput } from "./CodeableConcept.js";
import { baseField, type FhirTypeInput } from "./types.js";

const DAR_SYSTEM = "http://terminology.hl7.org/CodeSystem/data-absent-reason";

const STANDARD_REASONS = [
  { code: "unknown", display: "Unknown" },
  { code: "asked-unknown", display: "Asked but unknown" },
  { code: "temp-unknown", display: "Temporarily unknown" },
  { code: "not-asked", display: "Not asked" },
  { code: "asked-declined", display: "Asked but declined" },
  { code: "masked", display: "Masked" },
  { code: "not-applicable", display: "Not applicable" },
  { code: "unsupported", display: "Unsupported" },
  { code: "as-text", display: "As text" },
  { code: "error", display: "Error" },
  { code: "not-a-number", display: "Not a number (NaN)" },
  { code: "negative-infinity", display: "Negative infinity" },
  { code: "positive-infinity", display: "Positive infinity" },
  { code: "not-performed", display: "Not performed" },
  { code: "not-permitted", display: "Not permitted" },
] as const;

const STANDARD_CODES = new Set<string>(STANDARD_REASONS.map((r) => r.code));
const CUSTOM_OPTION = "__custom__";

const isStandard = (cc: CodeableConcept | undefined): boolean => {
  const c = cc?.coding?.[0];
  return !!c && c.system === DAR_SYSTEM && !!c.code && STANDARD_CODES.has(c.code);
};

const standardConcept = (code: string): CodeableConcept => {
  const display = STANDARD_REASONS.find((r) => r.code === code)?.display;
  return { coding: [{ system: DAR_SYSTEM, code, display }] };
};

export const DataAbsentReasonInput: FhirTypeInput<CodeableConcept> = ({
  value,
  onChange,
  context,
}) => {
  if (value === undefined) {
    return (
      <button
        type="button"
        data-testid="data-absent-reason-toggle"
        onClick={() => onChange(standardConcept("unknown"))}
        className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-slate-400"
      >
        + Mark result as missing
      </button>
    );
  }

  const standard = isStandard(value);
  const currentCode = value.coding?.[0]?.code ?? "";
  const selectValue = standard ? currentCode : CUSTOM_OPTION;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <select
          aria-label="Reason"
          data-testid="data-absent-reason-select"
          className={`${baseField} sm:max-w-xs`}
          value={selectValue}
          onChange={(e) => {
            const next = e.target.value;
            if (next === CUSTOM_OPTION) {
              onChange(standard ? {} : value);
            } else {
              onChange(standardConcept(next));
            }
          }}
        >
          {STANDARD_REASONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.display}
            </option>
          ))}
          <option value={CUSTOM_OPTION}>Other (custom code)…</option>
        </select>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label="Clear reason"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:border-red-400 hover:text-red-600"
        >
          ×
        </button>
      </div>
      {!standard && (
        <CodeableConceptInput value={value} onChange={onChange} context={context} />
      )}
    </div>
  );
};
