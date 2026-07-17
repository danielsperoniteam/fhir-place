import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ResolvedCode } from "../../structure/binding.js";
import { useValueSetExpansion } from "../../hooks/queries.js";
import { baseField } from "./types.js";

export interface AsyncCodeComboboxProps {
  /** Canonical URL of the bound ValueSet to filter against. */
  valueSet: string;
  /** Currently-selected concept (display rendered in the input). */
  value: ResolvedCode | undefined;
  onChange: (next: ResolvedCode | undefined) => void;
  /** Used as `aria-label` for the input. */
  fieldName: string;
  /** Debounce in ms before firing `$expand?filter=`. Default 200. */
  debounceMs?: number;
  /** Max suggestions to ask the server for. Default 20. */
  count?: number;
  /** Disabled when true; renders a read-only locked input. */
  disabled?: boolean;
  /** Placeholder for the search input. */
  placeholder?: string;
}

/**
 * Type-ahead combobox backed by `ValueSet/$expand?url=...&filter=...`.
 *
 * Used in place of a plain `<select>` when a binding's ValueSet is too large
 * to enumerate locally (SNOMED, LOINC, ICD-10, BCP-47 languages, etc.).
 *
 * Implementation notes:
 *  - WAI-ARIA 1.2 combobox pattern (input + listbox, no native `<select>`),
 *    with `role="listbox"`/`option`, `aria-activedescendant`, and keyboard
 *    arrow / Enter / Escape handling.
 *  - The query is debounced via `debounceMs`; the underlying `useValueSetExpansion`
 *    is also disabled until at least one non-whitespace character is typed.
 *  - Outside-click closes the popup; the selection is preserved.
 */
export const AsyncCodeCombobox = ({
  valueSet,
  value,
  onChange,
  fieldName,
  debounceMs = 200,
  count = 20,
  disabled = false,
  placeholder = "Search…",
}: AsyncCodeComboboxProps) => {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Debounce the user's keystrokes before firing the server query.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => clearTimeout(t);
  }, [query, debounceMs]);

  const { data, isFetching, isError } = useValueSetExpansion(
    valueSet,
    debouncedQuery,
    { count },
  );

  const options = useMemo<ResolvedCode[]>(() => {
    const contains = data?.expansion?.contains ?? [];
    return contains
      .filter((c): c is ResolvedCode & { code: string } => Boolean(c.code))
      .map((c) => ({
        ...(c.system !== undefined ? { system: c.system } : {}),
        code: c.code,
        ...(c.display !== undefined ? { display: c.display } : {}),
      }));
  }, [data]);

  // Clamp the active index when the option list changes.
  useEffect(() => {
    if (activeIndex >= options.length) setActiveIndex(0);
  }, [options.length, activeIndex]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const select = useCallback(
    (concept: ResolvedCode) => {
      onChange(concept);
      setQuery("");
      setOpen(false);
    },
    [onChange],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && options[activeIndex]) {
        e.preventDefault();
        select(options[activeIndex]!);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const inputDisplay = open
    ? query
    : value?.display ?? value?.code ?? query;

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1">
        <input
          aria-label={fieldName}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={
            open && options[activeIndex]
              ? `${listboxId}-opt-${activeIndex}`
              : undefined
          }
          role="combobox"
          className={baseField}
          value={inputDisplay}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
        />
        {value && !open && (
          <button
            type="button"
            aria-label={`Clear ${fieldName}`}
            className="rounded border border-[var(--border-strong,#cbd5e1)] bg-[var(--surface,#ffffff)] px-2 py-1 text-xs text-[var(--text-muted,#475569)] hover:bg-[var(--chip,#f1f5f9)]"
            onClick={() => onChange(undefined)}
          >
            Clear
          </button>
        )}
      </div>
      {isError && options.length === 0 && (
        <p role="alert" className="mt-1 text-xs text-amber-700">
          Terminology server unreachable. Code lookup is unavailable; enter a
          code manually or check the terminology server in Settings.
        </p>
      )}
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`${fieldName} suggestions`}
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border border-[var(--border,#e2e8f0)] bg-[var(--surface,#ffffff)] text-sm shadow-md"
        >
          {debouncedQuery.trim().length === 0 ? (
            <li className="px-2 py-1 text-[var(--text-subtle,#94a3b8)]">Type to search…</li>
          ) : isFetching ? (
            <li className="px-2 py-1 text-[var(--text-subtle,#94a3b8)]">Searching…</li>
          ) : isError && options.length === 0 ? (
            <li className="px-2 py-1 text-amber-700">
              Terminology server unreachable
            </li>
          ) : options.length === 0 ? (
            <li className="px-2 py-1 text-[var(--text-subtle,#94a3b8)]">No matches</li>
          ) : (
            options.map((o, i) => (
              <li
                key={`${o.system ?? ""}|${o.code}`}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={
                  i === activeIndex
                    ? "cursor-pointer bg-[var(--accent-soft,#eff6ff)] px-2 py-1"
                    : "cursor-pointer px-2 py-1 hover:bg-[var(--sunken,#f8fafc)]"
                }
                onMouseDown={(e) => {
                  // mousedown so we beat the input's blur handler
                  e.preventDefault();
                  select(o);
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="font-medium">{o.display ?? o.code}</span>
                <span className="ml-2 text-xs text-[var(--text-subtle,#94a3b8)]">{o.code}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};
