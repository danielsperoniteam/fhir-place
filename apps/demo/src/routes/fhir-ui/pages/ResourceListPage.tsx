import {
  ColumnPicker,
  ResourceSearch,
  ResourceTable,
  useFhirClient,
  useInfiniteSearch,
  useStructureDefinition,
} from "@fhir-place/react-fhir";
import type { Resource } from "fhir/r4";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { SearchParams } from "@fhir-place/react-fhir";
import { PatientRowCounts } from "../../../components/PatientRowCounts.js";
import { SearchRequestPreview } from "../../../components/SearchRequestPreview.js";
import {
  RESOURCE_LIST_CONFIG,
  isTopResourceType,
  type ResourceListColumn,
  type ResourceListConfig,
  type SortOption,
} from "../../../resourceListConfig.js";

type Layout = "list" | "table";
const PAGE_SIZE = 20;

const layoutKey = (rt: string) => `fhir-place-demo-${rt.toLowerCase()}-layout`;
const columnKey = (rt: string) => `fhir-place-demo-${rt.toLowerCase()}-columns`;

const readLayout = (rt: string, hasListView: boolean, scoped: boolean): Layout => {
  if (!hasListView) return "table";
  // Compartment-scoped views (e.g. Conditions for one patient) default to
  // the denser table layout — the typical use case is comparing rows.
  if (scoped) return "table";
  if (typeof window === "undefined") return "list";
  const v = window.localStorage.getItem(layoutKey(rt));
  return v === "table" ? "table" : "list";
};

const labelFromPath = (path: string): string => {
  const last = path.split(".").pop() ?? path;
  return last
    .replace(/\[\d+\]/g, "")
    .replace(/\[x\]$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
};

const summaryPathsFromStructure = (resourceType: string, paths: string[]): string[] => {
  const prefix = `${resourceType}.`;
  return paths
    .filter((path) => path.startsWith(prefix) && path.split(".").length > 2)
    .map((path) => path.slice(prefix.length))
    .filter((path) => !path.includes(".extension") && !path.includes(".modifierExtension"));
};

const collectPaths = (value: unknown, prefix = "", out = new Set<string>()): Set<string> => {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    if (value.length > 0) collectPaths(value[0], prefix, out);
    return out;
  }
  if (typeof value !== "object") {
    if (prefix) out.add(prefix);
    return out;
  }
  const record = value as Record<string, unknown>;
  for (const [key, next] of Object.entries(record)) {
    if (key === "resourceType") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (next !== null && typeof next === "object") collectPaths(next, path, out);
    else out.add(path);
  }
  return out;
};

const paramsFromUrl = (urlParams: URLSearchParams, patientId?: string): SearchParams => {
  const out: SearchParams = { _count: PAGE_SIZE };
  for (const [k, v] of urlParams.entries()) {
    if (k === "patient") continue;
    out[k] = v;
  }
  if (patientId) out.patient = patientId;
  return out;
};

const formInitialFromUrl = (urlParams: URLSearchParams): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of urlParams.entries()) {
    if (k === "patient") continue;
    out[k] = v;
  }
  return out;
};

/**
 * Generic index/list page for any FHIR resource type. Configured types
 * (top-N in the sidebar) get curated columns, priority search params, and a
 * list view; unconfigured types fall back to columns derived from the
 * StructureDefinition `isSummary` set.
 *
 * Reads `?patient=<id>` to scope the search to a Patient compartment, in
 * which case the page hides the "+ New" button and shows a back-to-patient
 * nav.
 */
export function ResourceListPage() {
  const { resourceType = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const client = useFhirClient();
  const patientId = searchParams.get("patient") ?? undefined;

  const config: ResourceListConfig | undefined = isTopResourceType(resourceType)
    ? RESOURCE_LIST_CONFIG[resourceType]
    : undefined;
  const hasListView = Boolean(config?.formatPrimary);

  const [layout, setLayout] = useState<Layout>(() =>
    readLayout(resourceType, hasListView, Boolean(patientId)),
  );
  useEffect(() => {
    setLayout(readLayout(resourceType, hasListView, Boolean(patientId)));
  }, [resourceType, hasListView, patientId]);
  useEffect(() => {
    // Don't persist the auto-chosen `table` from the scoped view — it would
    // clobber the user's unscoped preference for the same resource type.
    if (typeof window === "undefined" || !hasListView || patientId) return;
    window.localStorage.setItem(layoutKey(resourceType), layout);
  }, [layout, resourceType, hasListView, patientId]);

  const params = useMemo(
    () => paramsFromUrl(searchParams, patientId),
    [searchParams, patientId],
  );
  const [draftParams, setDraftParams] = useState<SearchParams>(params);
  useEffect(() => setDraftParams(params), [params]);
  const formInitial = useMemo(() => formInitialFromUrl(searchParams), [searchParams]);
  const formKey = searchParams.toString();

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteSearch<Resource>(resourceType, params);

  const resources = useMemo(
    () =>
      data?.pages.flatMap(
        (b) => b.entry?.flatMap((e) => (e.resource ? [e.resource] : [])) ?? [],
      ) ?? [],
    [data?.pages],
  );
  const totalAdvertised = data?.pages[0]?.total;

  const { data: structureDefinition } = useStructureDefinition(resourceType, {
    enabled: !config && Boolean(resourceType),
  });

  const derivedDefaults = useMemo(() => {
    if (config) return null;
    const summary = summaryPathsFromStructure(
      resourceType,
      structureDefinition?.snapshot?.element
        ?.filter((element) => element.isSummary)
        .map((element) => element.path ?? "") ?? [],
    );
    if (summary.length > 0) return summary.slice(0, 8);
    return ["status", "code.text", "subject.reference", "id"];
  }, [config, resourceType, structureDefinition?.snapshot?.element]);

  const tableColumns: ResourceListColumn[] = useMemo(() => {
    if (config) return config.tableColumns;
    const fromRows = resources.flatMap((resource) => Array.from(collectPaths(resource)));
    const unique = new Set<string>([...(derivedDefaults ?? []), ...fromRows]);
    return Array.from(unique).map((path) => ({ path, label: labelFromPath(path) }));
  }, [config, derivedDefaults, resources]);

  const defaultVisibleColumns = useMemo(
    () => config?.defaultVisibleColumns ?? derivedDefaults ?? [],
    [config?.defaultVisibleColumns, derivedDefaults],
  );

  const [columns, setColumns] = useState<string[]>(defaultVisibleColumns);
  useEffect(() => {
    setColumns((current) => {
      const available = new Set(tableColumns.map((c) => c.path));
      const kept = current.filter((path) => available.has(path));
      const next = kept.length > 0
        ? kept
        : defaultVisibleColumns.filter((path) => available.has(path));
      if (next.length === current.length && next.every((p, i) => p === current[i])) {
        return current;
      }
      return next;
    });
  }, [tableColumns, defaultVisibleColumns]);

  const submitFilters = (next: SearchParams) => {
    const entries: Array<[string, string]> = [];
    if (patientId) entries.push(["patient", patientId]);
    for (const [k, v] of Object.entries(next)) {
      if (k === "patient") continue;
      if (v === undefined || v === "" || v === null) continue;
      if (Array.isArray(v)) entries.push([k, v.join(",")]);
      else entries.push([k, String(v)]);
    }
    setSearchParams(Object.fromEntries(entries), { replace: true });
  };

  const heading = patientId ? resourceType : config?.title ?? resourceType;
  const singular = config?.singular ?? resourceType.toLowerCase();
  const showCreate = !patientId && Boolean(config);
  const priorityParams = config?.priorityParams;

  return (
    <div className="space-y-4">
      {patientId && (
        <nav className="text-sm">
          <Link to={`/fhir-ui/Patient/${patientId}`} className="text-slate-500 underline">
            ← Back to patient
          </Link>
        </nav>
      )}

      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{heading}</h1>
          <p className="text-sm text-slate-500">
            {data
              ? totalAdvertised !== undefined
                ? `${resources.length} of ${totalAdvertised}`
                : `${resources.length} loaded`
              : "…"}
            {patientId && (
              <>
                {" "}· scoped to{" "}
                <code className="rounded bg-slate-100 px-1">Patient/{patientId}</code>
              </>
            )}
          </p>
        </div>
        {showCreate && (
          <Link
            to={`/fhir-ui/${resourceType}/new`}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            data-testid={`create-${resourceType.toLowerCase()}`}
          >
            + New {singular}
          </Link>
        )}
      </div>

      <ResourceSearch
        key={formKey}
        resourceType={resourceType}
        initialVisible={6}
        initialParams={formInitial}
        {...(priorityParams ? { priorityParams } : {})}
        onChange={(p) =>
          setDraftParams({
            _count: PAGE_SIZE,
            ...(patientId ? { patient: patientId } : {}),
            ...p,
          })
        }
        onSubmit={submitFilters}
      />

      {config?.sortOptions && config.sortOptions.length > 0 && (
        <SortPicker
          options={config.sortOptions}
          value={searchParams.get("_sort") ?? undefined}
          onChange={(param) => {
            const entries: Array<[string, string]> = [];
            if (patientId) entries.push(["patient", patientId]);
            for (const [k, v] of searchParams.entries()) {
              if (k === "patient" || k === "_sort") continue;
              entries.push([k, v]);
            }
            if (param) entries.push(["_sort", param]);
            setSearchParams(Object.fromEntries(entries), { replace: true });
          }}
        />
      )}

      <SearchRequestPreview
        baseUrl={client.baseUrl}
        resourceType={resourceType}
        params={draftParams}
      />

      <div className="flex items-center justify-between gap-2">
        {hasListView ? (
          <div
            role="group"
            aria-label="Layout"
            className="inline-flex rounded border border-slate-300 bg-white text-sm shadow-sm"
          >
            <button
              type="button"
              onClick={() => setLayout("list")}
              aria-pressed={layout === "list"}
              data-testid="layout-list"
              className={`rounded-l px-3 py-1 ${layout === "list" ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
            >
              List view
            </button>
            <button
              type="button"
              onClick={() => setLayout("table")}
              aria-pressed={layout === "table"}
              data-testid="layout-table"
              className={`rounded-r border-l border-slate-300 px-3 py-1 ${layout === "table" ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Table view
            </button>
          </div>
        ) : (
          <div />
        )}
        {(!hasListView || layout === "table") && (
          <ColumnPicker
            options={tableColumns}
            defaultSelected={defaultVisibleColumns}
            onChange={setColumns}
            storageKey={columnKey(resourceType)}
          />
        )}
      </div>

      {isError && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error)?.message ?? "Search failed"}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      {hasListView && layout === "list" ? (
        <ResourceList
          resources={resources}
          resourceType={resourceType}
          singular={singular}
          config={config!}
          isLoading={isLoading}
        />
      ) : (
        resources.length > 0 ? (
          <ResourceTable<Resource>
            resources={resources}
            columns={tableColumns
              .map((c) => c.path)
              .filter((p) => columns.includes(p))}
            columnLabels={Object.fromEntries(tableColumns.map((c) => [c.path, c.label]))}
            cellRenderers={
              resourceType === "Patient"
                ? {
                    __counts: (patient) =>
                      patient.id ? (
                        <PatientRowCounts patientId={patient.id} />
                      ) : (
                        <span className="text-slate-400">—</span>
                      ),
                  }
                : undefined
            }
            onRowClick={(r) => r.id && navigate(`/fhir-ui/${r.resourceType}/${r.id}`)}
            emptyState={
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                No {singular} records match.
              </p>
            }
          />
        ) : (
          !isLoading && (
            <p className="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              No {singular} records match.
            </p>
          )
        )
      )}

      {hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            data-testid="load-more"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

interface SortPickerProps {
  options: SortOption[];
  value: string | undefined;
  onChange: (param: string | undefined) => void;
}

function SortPicker({ options, value, onChange }: SortPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeLabel = options.find((o) => o.param === value)?.label;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm shadow-sm ${
          value
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        <span>Sort{activeLabel ? `: ${activeLabel}` : ""}</span>
        <svg
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-max rounded border border-slate-200 bg-white p-2 shadow-md">
          <div className="flex flex-wrap gap-1.5">
            {options.map((opt) => (
              <button
                key={opt.param}
                type="button"
                onClick={() => {
                  onChange(value === opt.param ? undefined : opt.param);
                  setOpen(false);
                }}
                className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
                  value === opt.param
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(undefined); setOpen(false); }}
              className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
            >
              Clear sort
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface ResourceListProps {
  resources: Resource[];
  resourceType: string;
  singular: string;
  config: ResourceListConfig;
  isLoading: boolean;
}

function ResourceList({
  resources,
  resourceType,
  singular,
  config,
  isLoading,
}: ResourceListProps) {
  const formatPrimary = config.formatPrimary!;
  const formatMeta = config.formatMeta;
  const rowTestId = `${resourceType.toLowerCase()}-row`;

  return (
    <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
      {resources.map((r) => {
        const meta = formatMeta?.(r).filter((v): v is string => Boolean(v)) ?? [];
        return (
          <li key={r.id} data-testid={rowTestId}>
            <Link
              to={`/fhir-ui/${resourceType}/${r.id}`}
              className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium text-slate-900">{formatPrimary(r)}</span>
                <span className="text-xs text-slate-500">
                  {meta.length > 0 ? `${meta.join(" · ")} · ` : ""}
                  <code className="rounded bg-slate-100 px-1 py-0.5">{r.id}</code>
                </span>
              </div>
              {resourceType === "Patient" && r.id && <PatientRowCounts patientId={r.id} />}
            </Link>
          </li>
        );
      })}
      {!isLoading && resources.length === 0 && (
        <li className="px-4 py-6 text-center text-sm text-slate-500">
          No {singular} records match.
        </li>
      )}
    </ul>
  );
}
