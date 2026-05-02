import type { Coding } from "fhir/r4";
import { useEffect, useMemo, useState } from "react";
import { useValueSet, useValueSetExpand } from "../../hooks/queries.js";
import {
  bindingFor,
  codesFromValueSet,
  type ResolvedCode,
} from "../../structure/binding.js";
import { CodingInputManual } from "./CodingManual.js";
import { baseField, subLabel, type FhirTypeInput } from "./types.js";

/** Max codes returned per filter call. */
const COUNT = 20;
/** Debounce (ms) between keystrokes and the server $expand call. */
const DEBOUNCE_MS = 250;

/**
 * ValueSet-driven autocomplete for `Coding`. Hits `$expand?url=...&filter=...`
 * on each (debounced) keystroke and lets the user pick from the result list;
 * the picked entry is written back as `{ system, code, display }`.
 *
 * If the server can't expand (no terminology module, 404, 501, etc.) the
 * component falls back to the bundled ValueSet for that canonical when one
 * exists, and otherwise lets the user toggle to manual System/Code/Display
 * entry. Required bindings still allow manual entry — UX over strictness; a
 * future iteration could surface a validation warning instead.
 *
 * Pairs with {@link CodingInput}: that component decides whether to render
 * this autocomplete (when the element has a binding) or the plain manual
 * fields.
 */
export const CodingAutocompleteInput: FhirTypeInput<Coding> = (props) => {
  const { value, onChange, context } = props;
  const { valueSet: canonical } = bindingFor(context.element);
  const fieldName = context.element.path?.split(".").pop() ?? "coding";

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Server-side filtered expansion (the happy path for SNOMED, LOINC, etc.).
  const expand = useValueSetExpand(canonical, debouncedQuery, {
    count: COUNT,
    enabled: isOpen && Boolean(canonical),
  });

  // Local fallback: a bundled or pre-fetched full ValueSet we can filter
  // client-side when the server's $expand is unavailable. Only fires after
  // the filtered call has errored, so we don't waste a request when $expand
  // works.
  const fullSet = useValueSet(canonical, {
    enabled: isOpen && Boolean(canonical) && Boolean(expand.error),
  });

  const usingFallback = Boolean(expand.error);
  const codes: ResolvedCode[] = useMemo(() => {
    if (!usingFallback && expand.data) return codesFromValueSet(expand.data);
    if (usingFallback && fullSet.data) {
      const all = codesFromValueSet(fullSet.data);
      const q = debouncedQuery.toLowerCase();
      const filtered = q
        ? all.filter(
            (c) =>
              c.code.toLowerCase().includes(q) ||
              (c.display?.toLowerCase().includes(q) ?? false),
          )
        : all;
      return filtered.slice(0, COUNT);
    }
    return [];
  }, [expand.data, fullSet.data, usingFallback, debouncedQuery]);

  const isLoading =
    (!usingFallback && expand.isFetching) ||
    (usingFallback && fullSet.isFetching);
  const hasUnrecoverableError = Boolean(expand.error && fullSet.error);

  const pick = (c: ResolvedCode) => {
    onChange({
      ...(c.system !== undefined ? { system: c.system } : {}),
      code: c.code,
      ...(c.display !== undefined ? { display: c.display } : {}),
    });
    setQuery("");
    setIsOpen(false);
  };

  if (manualMode) {
    return (
      <div className="space-y-1">
        <CodingInputManual {...props} />
        <button
          type="button"
          onClick={() => setManualMode(false)}
          className="text-xs text-blue-600 hover:underline"
        >
          ← Back to search
        </button>
      </div>
    );
  }

  if (value?.code) {
    return (
      <div
        className="space-y-1 rounded border border-slate-200 bg-slate-50 p-2"
        data-testid="coding-autocomplete-selected"
      >
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-sm">
            {value.display ?? value.code}
            <code className="ml-1 rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-500">
              {value.code}
            </code>
          </span>
          <button
            type="button"
            aria-label={`Clear ${fieldName}`}
            onClick={() => onChange(undefined)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:border-red-400 hover:text-red-600"
          >
            ×
          </button>
        </div>
        {value.system && (
          <div className="truncate text-xs text-slate-500">{value.system}</div>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative space-y-1 rounded border border-slate-200 bg-slate-50 p-2"
      data-testid="coding-autocomplete"
    >
      <span className={subLabel}>Search {fieldName}</span>
      <input
        type="search"
        role="combobox"
        aria-label={fieldName}
        aria-expanded={isOpen}
        aria-controls={`${fieldName}-listbox`}
        placeholder="Type to search…"
        className={baseField}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
      />

      {isOpen && (
        <ul
          id={`${fieldName}-listbox`}
          role="listbox"
          className="absolute left-2 right-2 z-10 max-h-64 overflow-auto rounded border border-slate-200 bg-white shadow-lg"
        >
          {isLoading && codes.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-500">Searching…</li>
          )}
          {!isLoading && codes.length === 0 && !hasUnrecoverableError && (
            <li className="px-3 py-2 text-xs text-slate-500">
              {debouncedQuery ? "No matches" : "Type to search"}
            </li>
          )}
          {hasUnrecoverableError && (
            <li className="px-3 py-2 text-xs text-amber-700">
              Server can&apos;t expand this value set.{" "}
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="text-blue-600 hover:underline"
              >
                Enter manually
              </button>
            </li>
          )}
          {codes.map((c) => (
            <li key={`${c.system ?? ""}|${c.code}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => pick(c)}
                className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="truncate">{c.display ?? c.code}</span>
                <code className="shrink-0 text-xs text-slate-500">{c.code}</code>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!hasUnrecoverableError && (
        <button
          type="button"
          onClick={() => setManualMode(true)}
          className="text-xs text-slate-500 hover:underline"
        >
          Enter manually
        </button>
      )}
    </div>
  );
};

