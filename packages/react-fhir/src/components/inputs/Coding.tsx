import type { Coding } from "fhir/r4";
import { useState } from "react";
import { useValueSet } from "../../hooks/queries.js";
import {
  bindingFor,
  codesFromValueSet,
  isOpenBinding,
  type ResolvedCode,
} from "../../structure/binding.js";
import { AsyncCodeCombobox } from "./AsyncCodeCombobox.js";
import {
  baseField,
  subLabel,
  type FhirInputProps,
  type FhirTypeInput,
} from "./types.js";

/**
 * Threshold above which we switch from a static `<select>` to an async
 * combobox backed by `$expand?filter=`. Sizes much larger than this make a
 * dropdown unusable; more importantly, large terminologies (SNOMED, LOINC,
 * BCP-47 languages) are typically returned as partial expansions anyway.
 */
const STATIC_OPTION_LIMIT = 100;

/**
 * Three-input free-form Coding editor (system/code/display). Used as the
 * fallback when the bound element has no resolvable ValueSet.
 */
const FreeFormCoding = ({
  value,
  onChange,
}: Pick<FhirInputProps<Coding>, "value" | "onChange">) => {
  const v = value ?? {};
  const patch = (k: keyof Coding, val: unknown) => onChange({ ...v, [k]: val });
  return (
    <div className="grid grid-cols-1 gap-2 rounded border border-[var(--border,#e2e8f0)] bg-[var(--sunken,#f8fafc)] p-2 sm:grid-cols-3">
      <label>
        <span className={subLabel}>System</span>
        <input
          className={baseField}
          value={v.system ?? ""}
          onChange={(e) => patch("system", e.target.value || undefined)}
        />
      </label>
      <label>
        <span className={subLabel}>Code</span>
        <input
          className={baseField}
          value={v.code ?? ""}
          onChange={(e) => patch("code", e.target.value || undefined)}
        />
      </label>
      <label>
        <span className={subLabel}>Display</span>
        <input
          className={baseField}
          value={v.display ?? ""}
          onChange={(e) => patch("display", e.target.value || undefined)}
        />
      </label>
    </div>
  );
};

/**
 * Coding editor that follows the same binding-driven pattern as `CodeInput`,
 * with three rendering modes chosen from the resolved ValueSet:
 *
 *   1. **Static `<select>`** when the bound ValueSet enumerates fully and is
 *      small enough (≤ {@link STATIC_OPTION_LIMIT} concepts). Required bindings
 *      lock to the enumeration; extensible/preferred also offer an "Other…"
 *      option that exposes the free-form 3-input editor.
 *   2. **Async combobox** ({@link AsyncCodeCombobox}) when the ValueSet is too
 *      big to enumerate locally (partial server expansion or > limit), or
 *      when the bundled definition has no concrete codes — typical for SNOMED,
 *      LOINC, ICD-10, and BCP-47 languages. Backed by `$expand?filter=...`.
 *   3. **Free-form 3-input** when the element has no binding, or the binding
 *      can't be resolved at all (server doesn't know it and we don't bundle it).
 */
export const CodingInput: FhirTypeInput<Coding> = ({
  value,
  onChange,
  context,
}) => {
  const v = value ?? {};
  const { strength, valueSet } = bindingFor(context.element);
  const { data: vs, isLoading, isError } = useValueSet(valueSet);
  const boundCodes = codesFromValueSet(vs);
  const fieldName = context.element.path?.split(".").pop() ?? "coding";
  const allowFreeText = isOpenBinding(strength);
  // Hooks must be called in the same order on every render — keep useState
  // above any early returns.
  const [otherToggled, setOtherToggled] = useState(false);

  // No binding at all — pure free-form.
  if (!valueSet) {
    return <FreeFormCoding value={value} onChange={onChange} />;
  }

  if (isLoading) {
    return (
      <input
        aria-label={fieldName}
        className={baseField}
        value=""
        readOnly
        placeholder="Loading value set…"
      />
    );
  }

  // Couldn't resolve the binding at all — server doesn't know it and we don't
  // bundle it. Don't strand the user; let them type freely.
  if (isError && !vs) {
    return <FreeFormCoding value={value} onChange={onChange} />;
  }

  const expansion = vs?.expansion;
  const expansionTotal = expansion?.total;
  const isPartialExpansion =
    expansionTotal !== undefined && expansionTotal > boundCodes.length;
  const tooManyForSelect = boundCodes.length > STATIC_OPTION_LIMIT;
  const useCombobox =
    boundCodes.length === 0 || isPartialExpansion || tooManyForSelect;

  if (useCombobox) {
    return (
      <div className="space-y-2">
        <AsyncCodeCombobox
          valueSet={valueSet}
          value={
            v.code !== undefined
              ? ({
                  ...(v.system !== undefined ? { system: v.system } : {}),
                  code: v.code,
                  ...(v.display !== undefined ? { display: v.display } : {}),
                } as ResolvedCode)
              : undefined
          }
          onChange={(c) =>
            c
              ? onChange({
                  ...(c.system !== undefined ? { system: c.system } : {}),
                  code: c.code,
                  ...(c.display !== undefined ? { display: c.display } : {}),
                })
              : onChange(undefined)
          }
          fieldName={fieldName}
        />
        {allowFreeText && (
          <details className="text-xs text-[var(--text-muted,#64748b)]">
            <summary className="cursor-pointer select-none">
              Enter a custom code…
            </summary>
            <div className="mt-2">
              <FreeFormCoding value={value} onChange={onChange} />
            </div>
          </details>
        )}
      </div>
    );
  }

  // Static <select> path.
  const keyOf = (system: string | undefined, code: string) =>
    `${system ?? ""}|${code}`;
  const options = boundCodes.map((c) => ({
    ...c,
    key: keyOf(c.system, c.code),
    label: c.display ? `${c.display} (${c.code})` : c.code,
  }));

  const currentKey = v.code !== undefined ? keyOf(v.system, v.code) : "";
  const matchedOption = options.find((o) => o.key === currentKey);
  const valueIsCustom = v.code !== undefined && !matchedOption;
  const usingFreeText = allowFreeText && (otherToggled || valueIsCustom);
  // (`otherToggled` is hoisted above the early returns at the top of this fn.)

  return (
    <div className="space-y-2">
      <select
        aria-label={fieldName}
        className={baseField}
        value={usingFreeText ? "__other__" : matchedOption?.key ?? ""}
        onChange={(e) => {
          const k = e.target.value;
          if (k === "__other__") {
            setOtherToggled(true);
            return;
          }
          setOtherToggled(false);
          if (k === "") {
            onChange(undefined);
            return;
          }
          const picked = options.find((o) => o.key === k);
          if (!picked) return;
          onChange({
            ...(picked.system !== undefined ? { system: picked.system } : {}),
            code: picked.code,
            ...(picked.display !== undefined
              ? { display: picked.display }
              : {}),
          });
        }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
        {allowFreeText && <option value="__other__">Other…</option>}
      </select>
      {usingFreeText && <FreeFormCoding value={value} onChange={onChange} />}
    </div>
  );
};
