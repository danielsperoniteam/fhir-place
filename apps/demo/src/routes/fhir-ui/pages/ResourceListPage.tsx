import {
  ColumnPicker,
  ResourceSearch,
  ResourceTable,
  SortPicker,
  useFhirClient,
  useInfiniteSearch,
  useStructureDefinition,
} from "@fhir-place/react-fhir";
import type { Reference, Resource } from "fhir/r4";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { SearchParams } from "@fhir-place/react-fhir";
import { naturalLanguageToFhirQuery } from "../../../ask/anthropicQuery.js";
import { PatientRowCounts } from "../../../components/PatientRowCounts.js";
import { SearchRequestPreview } from "../../../components/SearchRequestPreview.js";
import { CC_FONT, CC_MONO, ccBtn } from "../../../components/ccStyles.js";
import { loadAnthropicApiKey } from "../../../config.js";
import {
  RESOURCE_LIST_CONFIG,
  isTopResourceType,
  type ResourceListColumn,
  type ResourceListConfig,
} from "../../../resourceListConfig.js";

type Layout = "list" | "table" | "json";
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 20;
const pageSizeStorageKey = "fhir-place-demo-page-size";

const layoutKey = (rt: string) => `fhir-place-demo-${rt.toLowerCase()}-layout`;
const columnKey = (rt: string) => `fhir-place-demo-${rt.toLowerCase()}-columns`;

const readPageSize = (): number => {
  if (typeof window === "undefined") return DEFAULT_PAGE_SIZE;
  const raw = window.localStorage.getItem(pageSizeStorageKey);
  const parsed = raw ? Number(raw) : NaN;
  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : DEFAULT_PAGE_SIZE;
};

const readLayout = (rt: string, hasListView: boolean, scoped: boolean): Layout => {
  if (!hasListView) return "table";
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

const paramsFromUrl = (
  urlParams: URLSearchParams,
  pageSize: number,
  patientId?: string,
): SearchParams => {
  const out: SearchParams = { _count: pageSize };
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

export function ResourceListPage() {
  const { resourceType = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const client = useFhirClient();

  const onReferenceClick = (ref: Reference) => {
    const r = ref.reference;
    if (!r) return;
    const match = r.match(/([A-Za-z]+)\/([^/]+)$/);
    if (match) navigate(`/fhir-ui/${match[1]}/${match[2]}`);
  };
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
    if (typeof window === "undefined" || !hasListView || patientId) return;
    window.localStorage.setItem(layoutKey(resourceType), layout);
  }, [layout, resourceType, hasListView, patientId]);

  const [pageSize, setPageSize] = useState<number>(readPageSize);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(pageSizeStorageKey, String(pageSize));
  }, [pageSize]);

  const params = useMemo(
    () => paramsFromUrl(searchParams, pageSize, patientId),
    [searchParams, pageSize, patientId],
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
      const next =
        kept.length > 0
          ? kept
          : defaultVisibleColumns.filter((path) => available.has(path));
      if (next.length === current.length && next.every((p, i) => p === current[i])) {
        return current;
      }
      return next;
    });
  }, [tableColumns, defaultVisibleColumns]);

  const askAI = useCallback(
    async (question: string): Promise<Record<string, string> | null> => {
      const apiKey = loadAnthropicApiKey();
      if (!apiKey) throw new Error("No Anthropic API key — add one in Settings first.");
      const plan = await naturalLanguageToFhirQuery(question, apiKey);
      const { _count, ...rest } = plan.params;
      void _count;
      if (plan.resourceType !== resourceType) {
        const qs = new URLSearchParams(rest);
        navigate(`/fhir-ui/${plan.resourceType}${qs.toString() ? `?${qs}` : ""}`);
        return null;
      }
      return rest;
    },
    [resourceType, navigate],
  );

  const submitFilters = (next: SearchParams) => {
    const entries: Array<[string, string]> = [];
    for (const [k, v] of Object.entries(next)) {
      // In a Patient compartment view the URL owns the `patient` filter;
      // ignore form-supplied patient values so users can't accidentally
      // navigate themselves out of the compartment they came in on.
      if (k === "patient" && patientId) continue;
      if (v === undefined || v === "" || v === null) continue;
      if (Array.isArray(v)) entries.push([k, v.join(",")]);
      else entries.push([k, String(v)]);
    }
    if (patientId && !entries.some(([k]) => k === "patient")) {
      entries.unshift(["patient", patientId]);
    }
    setSearchParams(Object.fromEntries(entries), { replace: true });
  };

  const heading = patientId ? resourceType : config?.title ?? resourceType;
  const singular = config?.singular ?? resourceType.toLowerCase();
  const showCreate = !patientId && Boolean(config);
  const priorityParams = config?.priorityParams;

  const totalStr = (() => {
    if (!data) return "…";
    if (totalAdvertised !== undefined) return `${totalAdvertised.toLocaleString()} records`;
    return `${resources.length} loaded`;
  })();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: CC_FONT,
      }}
    >
      {/* Patient compartment back-link */}
      {patientId && (
        <div style={{ padding: "12px 24px 0" }}>
          <Link
            to={`/fhir-ui/Patient/${patientId}`}
            style={{ fontSize: 12, color: "var(--text-muted)", textDecoration: "none" }}
          >
            ← Back to Patient/{patientId}
          </Link>
        </div>
      )}

      {/* Page header */}
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 600,
              margin: 0,
              letterSpacing: -0.3,
              color: "var(--text)",
            }}
          >
            {heading}
          </h1>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {totalStr}
          </span>
          {patientId && (
            <span
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: CC_MONO,
              }}
            >
              · Patient/<span style={{ color: "var(--accent-text)" }}>{patientId}</span>
            </span>
          )}
          {showCreate && (
            <Link
              to={`/fhir-ui/${resourceType}/new`}
              style={{ ...ccBtn("primary"), marginLeft: "auto" }}
              data-testid={`create-${resourceType.toLowerCase()}`}
            >
              + New {resourceType}
            </Link>
          )}
        </div>
        {config?.title && (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            {config.title}
          </p>
        )}
      </div>

      {/* Search card */}
      <div style={{ padding: "16px 24px 0" }}>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-subtle)",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Search params
            </span>
            <div style={{ flex: 1 }} />
            <button style={{ ...ccBtn("ghost"), fontSize: 12 }}>Save query</button>
            <button style={{ ...ccBtn("secondary"), fontSize: 12 }}>Clear</button>
          </div>

          <ResourceSearch
            key={formKey}
            resourceType={resourceType}
            initialVisible={6}
            initialParams={formInitial}
            {...(priorityParams ? { priorityParams } : {})}
            onChange={(p) =>
              setDraftParams({
                _count: pageSize,
                ...(patientId ? { patient: patientId } : {}),
                ...p,
              })
            }
            onSubmit={submitFilters}
            onAskAI={askAI}
          />

          {/* Request preview */}
          <div style={{ marginTop: 10 }}>
            <SearchRequestPreview
              baseUrl={client.baseUrl}
              resourceType={resourceType}
              params={draftParams}
            />
          </div>
        </div>
      </div>

      {/* Results toolbar */}
      <div
        style={{
          padding: "14px 24px 0",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {/* Layout toggle */}
        <div
          style={{
            display: "flex",
            background: "var(--sunken)",
            borderRadius: 6,
            padding: 2,
            border: "1px solid var(--border)",
          }}
        >
          {(["list", "table", "json"] as const).map((l) => {
            const labels: Record<string, string> = { list: "List", table: "Table", json: "JSON" };
            const active = layout === l || (!hasListView && l === "table");
            const disabled = l === "list" && !hasListView;
            return (
              <button
                key={l}
                onClick={() => !disabled && setLayout(l)}
                aria-pressed={active}
                data-testid={`layout-${l}`}
                disabled={disabled}
                style={{
                  ...ccBtn("ghost"),
                  padding: "4px 10px",
                  fontSize: 12,
                  background: active ? "var(--surface)" : "transparent",
                  color: active ? "var(--text)" : "var(--text-muted)",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,.04)" : "none",
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                {labels[l]}
              </button>
            );
          })}
        </div>

        <SortPicker
          resourceType={resourceType}
          value={searchParams.get("_sort") ?? undefined}
          priorityParams={priorityParams}
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

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {data
            ? `Showing ${resources.length}${totalAdvertised !== undefined ? ` of ${totalAdvertised.toLocaleString()}` : ""}`
            : "…"}
        </span>

        <PageSizePicker value={pageSize} onChange={setPageSize} />

        {(!hasListView || layout === "table") && (
          <ColumnPicker
            options={tableColumns}
            defaultSelected={defaultVisibleColumns}
            onChange={setColumns}
            storageKey={columnKey(resourceType)}
          />
        )}
      </div>

      {/* Error state */}
      {isError && (
        <div
          style={{
            margin: "12px 24px 0",
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid var(--danger)",
            background: "var(--danger-soft)",
            fontSize: 13,
            color: "var(--danger)",
          }}
        >
          {(error as Error)?.message ?? "Search failed"}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <p
          style={{ padding: "16px 24px 0", fontSize: 13, color: "var(--text-muted)" }}
          data-testid="resource-loading"
        >
          Loading…
        </p>
      )}

      {/* Results */}
      <div
        style={{
          padding: "12px 24px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 300,
        }}
      >
        {layout === "json" ? (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              flex: 1,
              overflow: "auto",
              padding: 16,
            }}
          >
            <pre
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.6,
                color: "var(--text)",
                fontFamily: CC_MONO,
                whiteSpace: "pre-wrap",
              }}
            >
              {JSON.stringify(resources, null, 2)}
            </pre>
          </div>
        ) : hasListView && layout === "list" ? (
          <ResourceList
            resources={resources}
            resourceType={resourceType}
            singular={singular}
            config={config!}
            isLoading={isLoading}
          />
        ) : resources.length > 0 ? (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <ResourceTable<Resource>
              resources={resources}
              columns={tableColumns.map((c) => c.path).filter((p) => columns.includes(p))}
              columnLabels={Object.fromEntries(tableColumns.map((c) => [c.path, c.label]))}
              cellRenderers={
                resourceType === "Patient"
                  ? {
                      name: (r) => <span>{config!.formatPrimary!(r)}</span>,
                      __counts: (patient) =>
                        patient.id ? (
                          <PatientRowCounts patientId={patient.id} />
                        ) : (
                          <span style={{ color: "var(--text-subtle)" }}>—</span>
                        ),
                    }
                  : undefined
              }
              onReferenceClick={onReferenceClick}
              onRowClick={(r) => r.id && navigate(`/fhir-ui/${r.resourceType}/${r.id}`)}
              emptyState={
                <p
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--text-muted)",
                  }}
                >
                  No {singular} records match.
                </p>
              }
            />
          </div>
        ) : (
          !isLoading && (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "24px 16px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-muted)",
              }}
            >
              No {singular} records match.
            </div>
          )
        )}

      </div>

      {/* Load more */}
      {hasNextPage && (
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 24px" }}>
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            data-testid="load-more"
            style={{
              ...ccBtn("secondary"),
              fontSize: 12,
              opacity: isFetchingNextPage ? 0.6 : 1,
            }}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page size picker ─────────────────────────────────────────────────────────

interface PageSizePickerProps {
  value: number;
  onChange: (size: number) => void;
}

function PageSizePicker({ value, onChange }: PageSizePickerProps) {
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

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="page-size-picker"
        style={{ ...ccBtn("ghost"), fontSize: 12 }}
      >
        {value} / page
        <svg
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms" }}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2 3l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 20,
            marginTop: 4,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 4,
            boxShadow: "0 4px 16px rgba(0,0,0,.08)",
            minWidth: 100,
          }}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              data-testid={`page-size-option-${size}`}
              onClick={() => {
                onChange(size);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                borderRadius: 5,
                fontSize: 13,
                cursor: "pointer",
                border: "none",
                background: value === size ? "var(--accent)" : "transparent",
                color: value === size ? "#fff" : "var(--text)",
                fontFamily: CC_FONT,
              }}
            >
              {size}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

interface ResourceListProps {
  resources: Resource[];
  resourceType: string;
  singular: string;
  config: ResourceListConfig;
  isLoading: boolean;
}

function ResourceList({ resources, resourceType, singular, config, isLoading }: ResourceListProps) {
  const formatPrimary = config.formatPrimary!;
  const formatMeta = config.formatMeta;
  const rowTestId = `${resourceType.toLowerCase()}-row`;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {resources.map((r, i) => {
        const meta = formatMeta?.(r).filter((v): v is string => Boolean(v)) ?? [];
        return (
          <Link
            key={r.id}
            to={`/fhir-ui/${resourceType}/${r.id}`}
            data-testid={rowTestId}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 16px",
              borderBottom:
                i < resources.length - 1 ? "1px solid var(--border)" : "none",
              textDecoration: "none",
              color: "var(--text)",
              transition: "background 80ms ease",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.background = "var(--sunken)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.background = "transparent")
            }
          >
            <span style={{ fontSize: 13, fontWeight: 500 }}>{formatPrimary(r)}</span>
            <span
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: CC_MONO,
                whiteSpace: "nowrap",
              }}
            >
              {meta.length > 0 ? `${meta.join(" · ")} · ` : ""}
              {r.id}
            </span>
            {resourceType === "Patient" && r.id && (
              <PatientRowCounts patientId={r.id} />
            )}
          </Link>
        );
      })}
      {!isLoading && resources.length === 0 && (
        <p
          style={{
            padding: "24px 16px",
            textAlign: "center",
            fontSize: 13,
            color: "var(--text-muted)",
          }}
        >
          No {singular} records match.
        </p>
      )}
    </div>
  );
}
