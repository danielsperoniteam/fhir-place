import {
  ColumnPicker,
  ResourceSearch,
  ResourceTable,
  useFhirClient,
  useInfiniteSearch,
  useStructureDefinition,
} from "@fhir-place/react-fhir";
import type { Resource } from "fhir/r4";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { SearchParams } from "@fhir-place/react-fhir";
import { PATIENT_COMPARTMENT } from "../compartment.js";
import { SearchRequestPreview } from "../components/SearchRequestPreview.js";

const columnLabelFromPath = (path: string): string => {
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

/**
 * Generic index page for a resource type (non-Patient). Reads `?patient=<id>`
 * from the URL to scope searches; otherwise lists every resource of the type.
 *
 * Shows: <ResourceSearch> (driven by CapabilityStatement) → <ResourceTable>
 * with sensible default columns → Load more via useInfiniteSearch. Rows link
 * through to the generic detail page at /:resourceType/:id.
 */
export function ResourceIndexPage() {
  const { resourceType = "" } = useParams();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const client = useFhirClient();
  const patientId = query.get("patient") ?? undefined;

  const [params, setParams] = useState<SearchParams>({
    _count: 20,
    ...(patientId ? { patient: patientId } : {}),
  });
  // Live form state for the request-preview panel — updates as the user
  // types, independent of when the search is actually submitted.
  const [draftParams, setDraftParams] = useState<SearchParams>(params);

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteSearch<Resource>(resourceType, params);

  // Memoised so it has a stable reference between renders — downstream
  // useMemos/useEffects key off `resources` and a fresh array each render
  // would feed a re-render loop through the column-picker effect.
  const resources = useMemo(
    () =>
      data?.pages.flatMap(
        (b) => b.entry?.flatMap((e) => (e.resource ? [e.resource] : [])) ?? [],
      ) ?? [],
    [data?.pages],
  );
  const totalAdvertised = data?.pages[0]?.total;

  const columnConfig = PATIENT_COMPARTMENT.find(
    (c) => c.resourceType === resourceType,
  );
  const { data: structureDefinition } = useStructureDefinition(resourceType, {
    enabled: Boolean(resourceType),
  });
  const defaultColumns = useMemo(() => {
    if (columnConfig?.columns?.length) return columnConfig.columns;
    const summary = summaryPathsFromStructure(
      resourceType,
      structureDefinition?.snapshot?.element
        ?.filter((element) => element.isSummary)
        .map((element) => element.path ?? "") ?? [],
    );
    if (summary.length > 0) return summary.slice(0, 8);
    return ["status", "code.text", "subject.reference", "id"];
  }, [columnConfig?.columns, resourceType, structureDefinition?.snapshot?.element]);

  const allColumnOptions = useMemo(() => {
    const fromRows = resources.flatMap((resource) => Array.from(collectPaths(resource)));
    const unique = new Set<string>([...defaultColumns, ...fromRows]);
    return Array.from(unique).map((path) => ({
      path,
      label: columnConfig?.columnLabels?.[path] ?? columnLabelFromPath(path),
    }));
  }, [columnConfig?.columnLabels, defaultColumns, resources]);

  const columnStorageKey = `fhir-place-demo-${resourceType.toLowerCase()}-columns`;
  const [columns, setColumns] = useState<string[]>(defaultColumns);

  useEffect(() => {
    setColumns((current) => {
      const available = new Set(allColumnOptions.map((option) => option.path));
      const kept = current.filter((path) => available.has(path));
      const next = kept.length > 0
        ? kept
        : defaultColumns.filter((path) => available.has(path));
      // Bail out when nothing changed — otherwise React schedules a re-render
      // every effect tick and we feed the next allColumnOptions memo into the
      // same effect again.
      if (
        next.length === current.length &&
        next.every((path, i) => path === current[i])
      ) {
        return current;
      }
      return next;
    });
  }, [allColumnOptions, defaultColumns]);

  const columnLabels = Object.fromEntries(allColumnOptions.map((c) => [c.path, c.label]));

  return (
    <div className="space-y-4">
      <nav className="flex items-center justify-between gap-2 text-sm">
        {patientId ? (
          <Link to={`/Patient/${patientId}`} className="text-slate-500 underline">
            ← Back to patient
          </Link>
        ) : (
          <Link to="/Patient" className="text-slate-500 underline">
            ← All patients
          </Link>
        )}
      </nav>

      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{resourceType}</h1>
          <p className="text-sm text-slate-500">
            {data
              ? totalAdvertised !== undefined
                ? `${resources.length} of ${totalAdvertised}`
                : `${resources.length} loaded`
              : "…"}
            {patientId && (
              <>
                {" "}· scoped to <code className="rounded bg-slate-100 px-1">Patient/{patientId}</code>
              </>
            )}
          </p>
        </div>
      </div>

      <ResourceSearch
        resourceType={resourceType}
        initialVisible={6}
        onChange={(p) =>
          setDraftParams({ _count: 20, ...(patientId ? { patient: patientId } : {}), ...p })
        }
        onSubmit={(p) =>
          setParams({ _count: 20, ...(patientId ? { patient: patientId } : {}), ...p })
        }
      />

      <SearchRequestPreview
        baseUrl={client.baseUrl}
        resourceType={resourceType}
        params={draftParams}
      />

      <div className="flex justify-end">
        <ColumnPicker
          options={allColumnOptions}
          onChange={setColumns}
          storageKey={columnStorageKey}
        />
      </div>

      {isError && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error)?.message ?? "Search failed"}
        </p>
      )}
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      {resources.length > 0 ? (
        <ResourceTable
          resources={resources}
          columns={columns}
          columnLabels={columnLabels}
          onRowClick={(r) => r.id && navigate(`/${r.resourceType}/${r.id}`)}
        />
      ) : (
        !isLoading && (
          <p className="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No {resourceType.toLowerCase()} records match.
          </p>
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
