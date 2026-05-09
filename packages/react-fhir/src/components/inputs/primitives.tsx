import { useState } from "react";
import { useValueSet } from "../../hooks/queries.js";
import { bindingFor, codesFromValueSet, isOpenBinding } from "../../structure/binding.js";
import { baseField, type FhirInputProps, type FhirTypeInput } from "./types.js";

export const TextInput: FhirTypeInput<string> = ({ value, onChange }) => (
  <input
    type="text"
    className={baseField}
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
  />
);

export const MarkdownInput: FhirTypeInput<string> = ({ value, onChange }) => (
  <textarea
    rows={3}
    className={baseField}
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
  />
);

export const BooleanInput: FhirTypeInput<boolean> = ({ value, onChange }) => (
  <label className="inline-flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      checked={Boolean(value)}
      onChange={(e) => onChange(e.target.checked ? true : undefined)}
    />
    <span className="text-slate-500">{value ? "true" : "false"}</span>
  </label>
);

export const NumberInput: FhirTypeInput<number> = ({ value, onChange, context }) => {
  const step = context.typeCode === "decimal" ? "any" : "1";
  return (
    <input
      type="number"
      step={step}
      className={baseField}
      value={value === undefined || value === null ? "" : String(value)}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") return onChange(undefined);
        const n = Number(v);
        onChange(Number.isNaN(n) ? undefined : n);
      }}
    />
  );
};

export const DateInput: FhirTypeInput<string> = ({ value, onChange }) => (
  <input
    type="date"
    className={baseField}
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
  />
);

export const DateTimeInput: FhirTypeInput<string> = ({ value, onChange }) => {
  // <input type="datetime-local"> expects "YYYY-MM-DDTHH:mm" (no timezone).
  // FHIR accepts ISO-8601 with timezone; we convert on the fly.
  const localValue = value ? value.slice(0, 16) : "";
  return (
    <input
      type="datetime-local"
      className={baseField}
      value={localValue}
      onChange={(e) => {
        if (e.target.value === "") return onChange(undefined);
        onChange(new Date(e.target.value).toISOString());
      }}
    />
  );
};

export const TimeInput: FhirTypeInput<string> = ({ value, onChange }) => (
  <input
    type="time"
    step="1"
    className={baseField}
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
  />
);

export const UriInput: FhirTypeInput<string> = ({ value, onChange }) => (
  <input
    type="url"
    className={baseField}
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
  />
);

/**
 * Resolves a `code` element's binding to a list of acceptable values:
 *   1. If binding.valueSet is set, fetch it via useValueSet and use its codes.
 *   2. Fallback: parse pipe-separated enumeration out of element.short.
 *   3. Last resort: plain text input.
 *
 * Required bindings lock to the enumeration; extensible / preferred also
 * allow a free-text "other" entry.
 */
export const CodeInput: FhirTypeInput<string> = (props) => {
  const { element } = props.context;
  const short = element.short;
  const fieldName = element.path?.split(".").pop() ?? "code";
  const { strength, valueSet } = bindingFor(element);

  const { data: vs, isLoading } = useValueSet(valueSet);
  const boundCodes = codesFromValueSet(vs);
  // Hooks must be called in the same order on every render — keep useState
  // above any early returns.
  const [otherToggled, setOtherToggled] = useState(false);

  const options: Array<{ value: string; label: string }> = [];
  if (boundCodes.length > 0) {
    for (const c of boundCodes) {
      options.push({ value: c.code, label: c.display ? `${c.display} (${c.code})` : c.code });
    }
  } else if (short && short.includes("|")) {
    for (const raw of short.split("|")) {
      const v = raw.trim();
      if (v) options.push({ value: v, label: v });
    }
  }

  if (options.length === 0) {
    if (valueSet && isLoading) {
      return (
        <input
          aria-label={fieldName}
          className={baseField}
          value={props.value ?? ""}
          readOnly
          placeholder="Loading value set…"
        />
      );
    }
    return <TextInput {...(props as FhirInputProps<string>)} />;
  }

  const allowFreeText = isOpenBinding(strength);
  const currentValue = props.value ?? "";
  const valueMatches = options.some((o) => o.value === currentValue);
  const valueIsCustom = !valueMatches && currentValue !== "";
  const usingFreeText = allowFreeText && (otherToggled || valueIsCustom);

  return (
    <div className="flex gap-1">
      <select
        aria-label={fieldName}
        className={baseField}
        value={usingFreeText ? "__other__" : currentValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__other__") {
            setOtherToggled(true);
            return;
          }
          setOtherToggled(false);
          props.onChange(v === "" ? undefined : v);
        }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {allowFreeText && <option value="__other__">Other…</option>}
      </select>
      {usingFreeText && (
        <input
          aria-label={`${fieldName} (custom)`}
          className={baseField}
          value={currentValue}
          onChange={(e) =>
            props.onChange(e.target.value === "" ? undefined : e.target.value)
          }
        />
      )}
    </div>
  );
};
