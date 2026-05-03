import type { Reference, Resource } from "fhir/r4";
import { useEffect, useMemo, useState } from "react";
import type { SearchParams } from "../client/types.js";
import { useSearch } from "../hooks/queries.js";
import { formatReferenceLabel } from "../structure/format.js";

export interface ReferencePickerProps {
  /** Allowed target resource types (from element.type[].targetProfile). */
  targets: string[];
  value: Reference | undefined;
  onChange: (ref: Reference | undefined) => void;
  /** Default search param used for the free-text query (default: "name"). */
  searchParam?: string;
  /** Max results shown per search (default 10). */
  limit?: number;
  /** Debounce (ms) between keystrokes and the server search (default 250). */
  debounceMs?: number;
  className?: string;
}

/** Resource types that support the `birthdate` search parameter in FHIR R4. */
const birthdateTypes = new Set([
  "Patient",
  "Practitioner",
  "RelatedPerson",
  "Person",
]);

/**
 * Debounced search-and-pick picker for FHIR References. Pairs with the
 * library's existing `<ResourceEditor>` by replacing the raw `Type/id` text
 * box currently generated for `Reference` elements.
 */
export function ReferencePicker(props: ReferencePickerProps) {
  const { targets, value, onChange, limit = 10, debounceMs = 250, className } = props;
  const [selectedType, setSelectedType] = useState<string>(
    targets[0] ?? "Resource",
  );
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), debounceMs);
    return () => clearTimeout(t);
  }, [query, debounceMs]);

  const searchField = props.searchParam ?? defaultSearchParamFor(selectedType);
  const hasFilter = Boolean(debouncedQuery);

  const searchParams = useMemo<SearchParams | undefined>(() => {
    if (!hasFilter) return undefined;
    const p: SearchParams = { _count: limit };
    if (debouncedQuery) p[searchField] = debouncedQuery;
    return p;
  }, [hasFilter, debouncedQuery, searchField, limit]);

  const { data, isFetching } = useSearch<Resource>(
    selectedType,
    searchParams,
    { enabled: hasFilter },
  );

  const results = useMemo(
    () =>
      (data?.entry ?? []).flatMap((e) => (e.resource ? [e.resource] : [])),
    [data],
  );

  const pick = (resource: Resource) => {
    onChange({
      reference: `${resource.resourceType}/${resource.id ?? ""}`,
      display: formatReferenceLabel(resource),
    });
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div
      className={className ?? "relative space-y-2 rounded border border-[var(--border)] bg-[var(--sunken)] p-2"}
      data-testid="reference-picker"
    >
      {value?.reference ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-sm">
            {value.display ?? value.reference}{" "}
            <code className="ml-1 rounded bg-[var(--surface)] px-1 py-0.5 text-xs text-[var(--text-muted)]">
              {value.reference}
            </code>
          </span>
          <button
            type="button"
            aria-label="Clear reference"
            onClick={() => onChange(undefined)}
            className="rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-xs text-[var(--text-muted)] hover:border-red-400 hover:text-red-600"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {targets.length > 1 && (
            <select
              aria-label="target type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)]"
            >
              {targets.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <input
            type="search"
            aria-label={`Search ${selectedType}`}
            placeholder={`Search ${selectedType} by ${searchField}…`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            // iOS Safari otherwise overlays its "AutoFill Contact" bar on top of
            // our results dropdown, swallowing taps on the actual options.
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            name="reference-picker-search"
            className="min-w-[12rem] flex-1 rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      {!value?.reference && isOpen && hasFilter && (
        <ul
          role="listbox"
          className="absolute left-2 right-2 z-10 max-h-64 overflow-auto rounded border border-[var(--border)] bg-[var(--surface)] shadow-lg"
        >
          {isFetching && results.length === 0 && (
            <li className="px-3 py-2 text-xs text-[var(--text-muted)]">Searching…</li>
          )}
          {!isFetching && results.length === 0 && (
            <li className="px-3 py-2 text-xs text-[var(--text-muted)]">No matches</li>
          )}
          {results.map((r) => {
            const secondary = secondaryLabel(r);
            return (
              <li key={`${r.resourceType}/${r.id}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  // `mousedown.preventDefault()` keeps the search input
                  // focused — without that, the input blurs on tap, iOS
                  // dismisses the keyboard, the page reflows, and the click
                  // event lands on whatever ends up under the user's finger.
                  // The actual selection runs from `onClick` so a touch that
                  // turns into a scroll/drag (no click event from iOS) doesn't
                  // accidentally pick the row the finger started on.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(r)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--sunken)]"
                >
                  <span className="block truncate">{formatReferenceLabel(r)}</span>
                  {secondary && (
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                      {secondary}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const namedTypes = new Set([
  "Patient",
  "Practitioner",
  "PractitionerRole",
  "RelatedPerson",
  "Person",
  "Organization",
  "HealthcareService",
  "Location",
  "Device",
]);

/**
 * Disambiguator shown beneath the primary label in dropdown items. For
 * person-shaped resources we surface DOB + gender so two patients with the
 * same name (very common) can be told apart without leaving the picker.
 */
function secondaryLabel(resource: Resource): string {
  const r = resource as unknown as Record<string, unknown>;
  if (birthdateTypes.has(resource.resourceType)) {
    const dob = typeof r.birthDate === "string" ? r.birthDate : undefined;
    const gender = typeof r.gender === "string" ? r.gender : undefined;
    return [dob && `DOB ${dob}`, gender].filter(Boolean).join(" · ");
  }
  return "";
}

function defaultSearchParamFor(type: string): string {
  if (namedTypes.has(type)) return "name";
  if (type === "Observation") return "code";
  if (type === "Medication" || type === "MedicationRequest") return "code";
  return "name"; // safe default; user can override via prop
}

export interface ReferencePickerFallbackProps {
  value: Reference | undefined;
  onChange: (ref: Reference | undefined) => void;
}

/** Plain Reference / display text inputs — used when targetProfile can't be resolved. */
export function ReferencePickerFallback({ value, onChange }: ReferencePickerFallbackProps) {
  const v = value ?? {};
  const patch = (k: keyof Reference, val: unknown) =>
    onChange({ ...v, [k]: val });
  return (
    <div
      className="grid grid-cols-1 gap-2 rounded border border-[var(--border)] bg-[var(--sunken)] p-2 sm:grid-cols-[1fr_1fr]"
      data-testid="reference-picker-fallback"
    >
      <label>
        <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
          Reference (Type/id)
        </span>
        <input
          className="w-full rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)]"
          placeholder="Patient/123"
          value={v.reference ?? ""}
          onChange={(e) => patch("reference", e.target.value || undefined)}
        />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Display</span>
        <input
          className="w-full rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)]"
          value={v.display ?? ""}
          onChange={(e) => patch("display", e.target.value || undefined)}
        />
      </label>
    </div>
  );
}
