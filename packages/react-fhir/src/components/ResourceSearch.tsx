import type {
  CapabilityStatementRestResourceSearchParam,
  CapabilityStatement,
} from "fhir/r4";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useCapabilities,
  useSearchParameter,
  useStructureDefinition,
  useValueSet,
} from "../hooks/queries.js";
import type { SearchParams } from "../client/types.js";
import { bindingFor, codesFromValueSet } from "../structure/binding.js";
import { elementPathForSearchParam } from "../structure/searchBinding.js";
import { clipSearchParamDoc } from "../structure/searchDoc.js";
import { findElement } from "../structure/walker.js";

export interface ResourceSearchProps {
  resourceType: string;
  /** Overrides the server's CapabilityStatement (useful for tests / offline mode). */
  capabilityStatement?: CapabilityStatement;
  initialParams?: Record<string, string>;
  /** Fires on every param change. */
  onChange?: (params: SearchParams) => void;
  /** Fires when the user presses Search (also on Enter in any input). */
  onSubmit?: (params: SearchParams) => void;
  /** Max number of params to show before the "Show all" toggle (default: 6). */
  initialVisible?: number;
  /** Reorders the searchParams list. Params not listed keep their original order after these. */
  priorityParams?: string[];
  className?: string;
  profile?: string;
}

type SpecType = CapabilityStatementRestResourceSearchParam["type"];

const inputPlaceholder = (type: SpecType): string => {
  switch (type) {
    case "token":
      return "code or system|code";
    case "reference":
      return "Type/id";
    case "date":
      return "YYYY-MM-DD  (prefix eq/ne/lt/gt/ge/le/ap)";
    case "number":
      return "123  (prefix eq/ne/lt/gt/ge/le)";
    case "quantity":
      return "123|system|code";
    case "uri":
      return "https://…";
    case "composite":
      return "value$value";
    case "special":
      return "";
    default:
      return "";
  }
};

const inputType = (type: SpecType): string => {
  switch (type) {
    case "uri":
      return "url";
    default:
      return "text";
  }
};

export function ResourceSearch(props: ResourceSearchProps) {
  const {
    resourceType,
    capabilityStatement,
    initialParams,
    onChange,
    onSubmit,
    initialVisible = 6,
    priorityParams = ["_id", "identifier", "name", "family", "given", "status", "code", "subject", "patient", "date"],
    className,
    profile,
  } = props;

  const capQuery = useCapabilities({ enabled: !capabilityStatement });
  const cap = capabilityStatement ?? capQuery.data;

  const params = useMemo(
    () => findSearchParamsForResource(cap, resourceType, priorityParams),
    [cap, resourceType, priorityParams.join("|")], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [values, setValues] = useState<Record<string, string>>(initialParams ?? {});
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    onChange?.(buildSearchParams(values));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)]);

  const visible = showAll ? params : params.slice(0, initialVisible);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(buildSearchParams(values));
  };

  const setParam = (name: string, val: string) => {
    setValues((prev) => {
      const next = { ...prev };
      if (val === "") delete next[name];
      else next[name] = val;
      return next;
    });
  };

  if (!cap && capQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading server capabilities…</p>;
  }
  if (params.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No searchable parameters advertised for {resourceType}.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="resource-search"
      className={className ?? "space-y-3 rounded border border-slate-200 bg-white p-3"}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">
          Search {resourceType}
        </h3>
        <span className="text-xs text-slate-400">
          {params.length} parameters available
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
          <SearchField
            profile={profile}
            key={p.name}
            base={resourceType}
            param={p}
            value={values[p.name!] ?? ""}
            onChange={(v) => setParam(p.name!, v)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        {params.length > initialVisible ? (
          <button
            type="button"
            className="text-xs text-slate-500 underline"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? `Hide ${params.length - initialVisible} extras`
              : `Show ${params.length - initialVisible} more parameters`}
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setValues({});
              // Clear is a "wipe and reload" affordance: also fire onSubmit so
              // the parent's active query resets without requiring a second
              // click on Search.
              onSubmit?.({});
            }}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Search
          </button>
        </div>
      </div>
    </form>
  );
}

interface SearchFieldProps {
  profile?: string;
  base: string;
  param: CapabilityStatementRestResourceSearchParam;
  value: string;
  onChange: (v: string) => void;
}

const fieldWrapper = (
  children: ReactNode,
  param: CapabilityStatementRestResourceSearchParam,
  base: string,
): ReactNode => {
  const doc = clipSearchParamDoc(param.documentation, base);
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{param.name}</span>
        <span className="text-[10px] uppercase text-slate-400">{param.type}</span>
      </span>
      {children}
      {doc && (
        <span className="mt-0.5 block text-[11px] text-slate-400">{doc}</span>
      )}
    </label>
  );
};

function SearchField({ base, param, value, onChange }: SearchFieldProps): ReactNode {
  if (param.type === "token") {
    return (
      <TokenSearchField base={base} param={param} value={value} onChange={onChange} />
    );
  }
  if (param.type === "date") {
    return <DateSearchField base={base} param={param} value={value} onChange={onChange} />;
  }
  return fieldWrapper(
    <input
      type={inputType(param.type)}
      aria-label={param.name}
      placeholder={inputPlaceholder(param.type)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
    />,
    param,
    base,
  );
}

/**
 * Token search field: look up the bound ValueSet via the spec (convention
 * mapping name → element → binding) and render a <select> when available.
 * Falls back to a plain text input when the binding can't be resolved or when
 * the ValueSet is too large to enumerate in a dropdown.
 */
function TokenSearchField({ base, param, value, onChange, profile }: SearchFieldProps): ReactNode {
  // Try the canonical SearchParameter first (covers custom IG params and the
  // few core params whose `expression` doesn't match the kebab→camel rule).
  // Falls through silently when the server doesn't expose SearchParameter.
  const { data: spec } = useSearchParameter(base, param.name ?? "");
  const elementPath = elementPathForSearchParam(param, base, spec ?? undefined);
  const { data: sd } = useStructureDefinition({ type: base, profile }, { enabled: Boolean(elementPath) });
  const element = elementPath && sd ? findElement(sd, elementPath) : undefined;
  const { valueSet: valueSetUrl } = bindingFor(element);
  const { data: vs, isLoading } = useValueSet(valueSetUrl);
  const codes = codesFromValueSet(vs);

  const fallbackInput = (
    <input
      type="text"
      aria-label={param.name}
      placeholder={inputPlaceholder(param.type)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
    />
  );

  if (valueSetUrl && isLoading) {
    return fieldWrapper(
      <input
        type="text"
        aria-label={param.name}
        value={value}
        readOnly
        placeholder="Loading value set…"
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm"
      />,
      param,
      base,
    );
  }

  if (codes.length === 0 || codes.length > 100) {
    return fieldWrapper(fallbackInput, param, base);
  }

  return fieldWrapper(
    <select
      aria-label={param.name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
    >
      <option value="">—</option>
      {codes.map((c) => (
        <option key={c.code} value={c.code}>
          {c.display ? `${c.display} (${c.code})` : c.code}
        </option>
      ))}
    </select>,
    param,
    base,
  );
}

/* ---------- date ---------- */

type DatePrefix = "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "ap";

interface DatePrefixOption {
  value: DatePrefix | "";
  label: string;
  title: string;
}

const DATE_PREFIXES: DatePrefixOption[] = [
  { value: "", label: "=", title: "equals (default)" },
  { value: "eq", label: "=", title: "equals" },
  { value: "ne", label: "≠", title: "not equal" },
  { value: "lt", label: "<", title: "less than" },
  { value: "le", label: "≤", title: "less than or equal" },
  { value: "gt", label: ">", title: "greater than" },
  { value: "ge", label: "≥", title: "greater than or equal" },
  { value: "ap", label: "~", title: "approximately" },
];

interface DateSearchFieldProps {
  base: string;
  param: CapabilityStatementRestResourceSearchParam;
  value: string;
  onChange: (v: string) => void;
}

/**
 * FHIR date search field: a prefix selector (eq/ne/lt/gt/ge/le/ap) paired with
 * a native date picker. Parses the incoming `value` so the two controls stay
 * in sync with whatever the parent holds — e.g. `ge2024-01-01` splits into
 * prefix="ge" + date="2024-01-01".
 */
function DateSearchField({ base, param, value, onChange }: DateSearchFieldProps): ReactNode {
  const match = value.match(/^(eq|ne|lt|le|gt|ge|ap)?(\d{4}-\d{2}-\d{2})?$/);
  const prefix = (match?.[1] ?? "") as DatePrefix | "";
  const date = match?.[2] ?? "";

  const commit = (nextPrefix: string, nextDate: string) => {
    if (!nextDate) return onChange("");
    onChange(`${nextPrefix}${nextDate}`);
  };

  return fieldWrapper(
    <div className="flex gap-1">
      <select
        aria-label={`${param.name} prefix`}
        value={prefix}
        onChange={(e) => commit(e.target.value, date)}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
      >
        {DATE_PREFIXES.map((p) => (
          <option key={`${p.value}-${p.label}`} value={p.value} title={p.title}>
            {p.label}
          </option>
        ))}
      </select>
      <input
        type="date"
        aria-label={param.name}
        value={date}
        onChange={(e) => commit(prefix, e.target.value)}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
      />
    </div>,
    param,
    base,
  );
}

/** Extract the searchParam list for a given resource type from a CapabilityStatement. */
export function findSearchParamsForResource(
  cap: CapabilityStatement | undefined,
  resourceType: string,
  priority: string[] = [],
): CapabilityStatementRestResourceSearchParam[] {
  if (!cap) return [];
  const server = cap.rest?.find((r) => r.mode === "server") ?? cap.rest?.[0];
  const resource = server?.resource?.find((r) => r.type === resourceType);
  const params = (resource?.searchParam ?? []).filter((p) => p.name);
  if (priority.length === 0) return params;
  const rank = new Map(priority.map((p, i) => [p, i]));
  return [...params].sort((a, b) => {
    const ai = rank.get(a.name!) ?? Number.POSITIVE_INFINITY;
    const bi = rank.get(b.name!) ?? Number.POSITIVE_INFINITY;
    if (ai === bi) return (a.name ?? "").localeCompare(b.name ?? "");
    return ai - bi;
  });
}

const buildSearchParams = (values: Record<string, string>): SearchParams => {
  const out: SearchParams = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== "" && v !== undefined) out[k] = v;
  }
  return out;
};
