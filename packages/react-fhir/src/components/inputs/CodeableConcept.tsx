import type { CodeableConcept } from "fhir/r4";
import { CodingInput } from "./Coding.js";
import { baseField, subLabel, type FhirTypeInput } from "./types.js";

export const CodeableConceptInput: FhirTypeInput<CodeableConcept> = ({
  value,
  onChange,
  context,
}) => {
  const v = value ?? {};
  const firstCoding = v.coding?.[0];
  return (
    <div className="space-y-2 rounded border border-[var(--border,#e2e8f0)] bg-[var(--sunken,#f8fafc)] p-2">
      <label>
        <span className={subLabel}>Text</span>
        <input
          className={baseField}
          value={v.text ?? ""}
          onChange={(e) => onChange({ ...v, text: e.target.value || undefined })}
        />
      </label>
      <div>
        <span className={subLabel}>Coding</span>
        <CodingInput
          value={firstCoding}
          onChange={(coding) =>
            onChange({
              ...v,
              coding: coding ? [coding] : [],
            })
          }
          context={context}
        />
      </div>
    </div>
  );
};
