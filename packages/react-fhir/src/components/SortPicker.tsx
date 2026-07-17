import type {
  CapabilityStatement,
  CapabilityStatementRestResourceSearchParam,
} from "fhir/r4";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCapabilities } from "../hooks/queries.js";
import { findSearchParamsForResource } from "./ResourceSearch.js";

export type SortDirection = "asc" | "desc";

export interface SortPickerProps {
  resourceType: string;
  /** Overrides the server's CapabilityStatement (useful for tests / offline mode). */
  capabilityStatement?: CapabilityStatement;
  /** Current FHIR `_sort` value, e.g. `"family"` or `"-family"`. */
  value?: string;
  /** Fires when the sort changes. `undefined` clears the sort. */
  onChange: (value: string | undefined) => void;
  /** Reorder candidate fields — listed names appear first in the panel. */
  priorityParams?: string[];
  className?: string;
}

/** Search-param types that don't make sense as `_sort` targets. */
const UNSORTABLE_TYPES: ReadonlyArray<
  CapabilityStatementRestResourceSearchParam["type"]
> = ["composite", "special"];

const parse = (value: string | undefined): { field: string; dir: SortDirection } | undefined => {
  if (!value) return undefined;
  if (value.startsWith("-")) return { field: value.slice(1), dir: "desc" };
  return { field: value, dir: "asc" };
};

const labelFor = (name: string): string =>
  name
    .replace(/^_/, "")
    .replace(/[-_]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

/**
 * Sort picker driven by the server's CapabilityStatement: every advertised
 * search parameter (except composite / special) becomes a candidate `_sort`
 * field, with a separate asc/desc toggle. Mirrors the popover style of
 * `<ColumnPicker>`.
 */
export function SortPicker({
  resourceType,
  capabilityStatement,
  value,
  onChange,
  priorityParams,
  className,
}: SortPickerProps) {
  const capQuery = useCapabilities({ enabled: !capabilityStatement });
  const cap = capabilityStatement ?? capQuery.data;

  const fields = useMemo(() => {
    const params = findSearchParamsForResource(cap, resourceType, priorityParams ?? []);
    return params.filter((p) => p.name && !UNSORTABLE_TYPES.includes(p.type));
    // priorityParams is treated as a stable list — callers passing inline arrays
    // are expected to memoize, but key on the joined value to be defensive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cap, resourceType, (priorityParams ?? []).join("|")]);

  const parsed = parse(value);
  const activeField = parsed?.field;
  const activeDir = parsed?.dir ?? "asc";

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (fields.length === 0) return null;

  const commit = (field: string | undefined, dir: SortDirection) => {
    if (!field) return onChange(undefined);
    onChange(dir === "desc" ? `-${field}` : field);
  };

  const activeLabel = activeField ? labelFor(activeField) : undefined;

  return (
    <div
      ref={containerRef}
      className={className ?? "relative inline-block"}
      data-testid="sort-picker"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm shadow-sm ${
          activeField
            ? "border-blue-300 bg-blue-50 text-[var(--accent-text,#1d4ed8)]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--sunken)]"
        }`}
      >
        <span>
          Sort
          {activeLabel ? `: ${activeLabel} ${activeDir === "desc" ? "↓" : "↑"}` : ""}
        </span>
        <svg
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Choose sort field"
          className="absolute left-0 z-10 mt-1 w-72 rounded border border-[var(--border)] bg-[var(--surface)] p-2 shadow-md"
        >
          <div
            role="group"
            aria-label="Sort direction"
            className="mb-2 inline-flex w-full rounded border border-[var(--border)] text-sm"
          >
            <button
              type="button"
              onClick={() => commit(activeField, "asc")}
              aria-pressed={activeDir === "asc"}
              disabled={!activeField}
              className={`flex-1 rounded-l px-2 py-1 ${
                activeDir === "asc" && activeField
                  ? "bg-[var(--accent,#2563eb)] text-white"
                  : "bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--sunken)] disabled:text-[var(--text-subtle)]"
              }`}
            >
              Ascending ↑
            </button>
            <button
              type="button"
              onClick={() => commit(activeField, "desc")}
              aria-pressed={activeDir === "desc"}
              disabled={!activeField}
              className={`flex-1 rounded-r border-l border-[var(--border)] px-2 py-1 ${
                activeDir === "desc" && activeField
                  ? "bg-[var(--accent,#2563eb)] text-white"
                  : "bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--sunken)] disabled:text-[var(--text-subtle)]"
              }`}
            >
              Descending ↓
            </button>
          </div>

          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {fields.map((p) => {
              const name = p.name!;
              const selected = activeField === name;
              return (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => commit(selected ? undefined : name, activeDir)}
                    aria-pressed={selected}
                    className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm ${
                      selected
                        ? "bg-[var(--accent,#2563eb)] text-white"
                        : "text-[var(--text)] hover:bg-[var(--sunken)]"
                    }`}
                  >
                    <span>{labelFor(name)}</span>
                    <span
                      className={`text-[10px] uppercase ${
                        selected ? "text-blue-100" : "text-[var(--text-subtle)]"
                      }`}
                    >
                      {p.type}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {activeField && (
            <button
              type="button"
              onClick={() => {
                commit(undefined, "asc");
                setOpen(false);
              }}
              className="mt-2 w-full rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--sunken)]"
            >
              Clear sort
            </button>
          )}
        </div>
      )}
    </div>
  );
}
