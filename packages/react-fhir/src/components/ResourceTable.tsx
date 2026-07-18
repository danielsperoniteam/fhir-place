import type { Reference, Resource, StructureDefinition } from "fhir/r4";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStructureDefinition } from "../hooks/queries.js";
import { findChoiceVariant, findElement } from "../structure/walker.js";
import {
  defaultTypeRenderers,
  type RendererContext,
  type TypeRenderers,
} from "./renderers.js";

export interface ResourceTableSort {
  by: string;
  direction: "asc" | "desc";
}

export type ResourceTableLayout = "auto" | "table" | "cards";

export interface ResourceTableProps<T extends Resource = Resource> {
  resources: T[];
  /** Dotted FHIR paths to show as columns, e.g. `["status", "code.text", "subject.display"]`. */
  columns: string[];
  /** Override the default cell renderer for specific column paths. */
  cellRenderers?: Record<string, (resource: T) => ReactNode>;
  /** Override column header labels (defaults to the StructureDefinition element's `short`). */
  columnLabels?: Record<string, string>;
  /** Row click handler — when present, rows become clickable (keyboard accessible). */
  onRowClick?: (resource: T) => void;
  /** Controlled sort state. When set, header cells become sort triggers. */
  sort?: ResourceTableSort;
  onSortChange?: (sort: ResourceTableSort) => void;
  emptyState?: ReactNode;
  /** When provided, overrides the fetched StructureDefinition (useful for tests / profiles). */
  structureDefinition?: StructureDefinition;
  /** Merged on top of `defaultTypeRenderers` for cell formatting. */
  renderers?: TypeRenderers;
  /** Click handler for Reference cells. */
  onReferenceClick?: (ref: Reference) => void;
  /**
   * Layout mode:
   * - `"auto"` (default) — renders both layouts and switches via Tailwind's
   *   `sm:` breakpoint: card stack below 640px, table at and above. The
   *   columns and cell renderers are shared.
   * - `"table"` — always table (the pre-#60 behaviour).
   * - `"cards"` — always card stack (useful for embeds in narrow sidebars).
   */
  layout?: ResourceTableLayout;
  className?: string;
}

// Tailwind's `sm` breakpoint is 640px — anything below renders the card
// stack. We default to `false` (desktop) so the first paint matches both
// the previous CSS-driven behaviour and jsdom (which has no matchMedia
// and would otherwise render the wrong tree under tests).
const NARROW_QUERY = "(max-width: 639px)";

function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(NARROW_QUERY);
    const sync = () => setNarrow(mql.matches);
    sync();
    // Older Safari only implements the deprecated addListener API.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", sync);
      return () => mql.removeEventListener("change", sync);
    }
    mql.addListener(sync);
    return () => mql.removeListener(sync);
  }, []);
  return narrow;
}

const headerFromPath = (path: string): string => {
  // Always use the last path segment as the column header. Element.short
  // descriptions from a StructureDefinition are long sentence fragments that
  // read badly as table headers ("Who the condition is about" → just "Subject").
  const last = path.split(".").pop() ?? path;
  return last
    .replace(/\[\d+\]/g, "")
    .replace(/\[x\]$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
};

export function getByPath(obj: unknown, path: string): unknown {
  if (!obj) return undefined;
  let cur: unknown = obj;
  for (const segment of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    // Support "coding[0]" segments by resolving the index separately.
    const indexMatch = segment.match(/^(\w+)\[(\d+)\]$/);
    if (indexMatch) {
      cur = (cur as Record<string, unknown>)[indexMatch[1]!];
      if (Array.isArray(cur)) cur = cur[Number(indexMatch[2])];
      continue;
    }
    // Support choice segments like "value[x]" — pick the materialised key
    // (e.g. valueQuantity, valueCodeableConcept) actually present on the object.
    if (segment.endsWith("[x]")) {
      const base = segment.slice(0, -3);
      const key = resolveChoiceKey(cur, base);
      cur = key ? (cur as Record<string, unknown>)[key] : undefined;
      if (Array.isArray(cur)) cur = cur[0];
      continue;
    }
    cur = (cur as Record<string, unknown>)[segment];
    if (Array.isArray(cur)) cur = cur[0]; // auto-pick first item for non-indexed segments
  }
  return cur;
}

function resolveChoiceKey(obj: unknown, base: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of Object.keys(obj)) {
    if (
      key.length > base.length &&
      key.startsWith(base) &&
      key[base.length] === key[base.length]!.toUpperCase() &&
      key[base.length] !== key[base.length]!.toLowerCase()
    ) {
      return key;
    }
  }
  return undefined;
}

/**
 * Generic table driven by the StructureDefinition's datatype metadata. Cells
 * format using the same `defaultTypeRenderers` map as `<ResourceView>`, so a
 * CodeableConcept in a table cell and in a detail page render identically.
 *
 * `layout="auto"` (default) renders a desktop `<table>` and a mobile card
 * stack side-by-side, switching via Tailwind's `sm:` breakpoint. Below 640px
 * each row becomes a label / value list — column squeeze and clipped values
 * (e.g. `Observation.valueQuantity`) on phone-width viewports were the
 * motivation for #60.
 */
export function ResourceTable<T extends Resource = Resource>({
  resources,
  columns,
  cellRenderers,
  columnLabels,
  onRowClick,
  sort,
  onSortChange,
  emptyState,
  structureDefinition,
  renderers: rendererOverrides,
  onReferenceClick,
  layout = "auto",
  className,
}: ResourceTableProps<T>) {
  const resourceType = resources[0]?.resourceType ?? "";
  const sdQuery = useStructureDefinition(resourceType, {
    enabled: !structureDefinition && Boolean(resourceType),
  });
  const sd = structureDefinition ?? sdQuery.data;

  const headers = useMemo(
    () =>
      columns.map((path) => {
        const label = columnLabels?.[path];
        if (label) return { path, label, typeCode: typeForPath(sd, resourceType, path) };
        return {
          path,
          label: headerFromPath(path),
          typeCode: typeForPath(sd, resourceType, path),
        };
      }),
    [columns, columnLabels, sd, resourceType],
  );

  const renderers: TypeRenderers = { ...defaultTypeRenderers, ...rendererOverrides };

  const toggleSort = (by: string) => {
    if (!onSortChange) return;
    const direction: "asc" | "desc" =
      sort?.by === by && sort.direction === "asc" ? "desc" : "asc";
    onSortChange({ by, direction });
  };

  // In `auto` mode we pick the layout from a JS-evaluated media query so
  // exactly one DOM tree renders per viewport. The earlier approach kept both
  // trees in the DOM and used Tailwind's `hidden sm:block` / `block sm:hidden`
  // to switch — but the desktop `<tr data-testid="resource-row">` rows then
  // stayed in the DOM at iPhone widths with `display: none`, and Playwright's
  // `toBeVisible()` failed on the live smoke test against the deployed demo
  // (issue #509: "Patient list shows at least one row" — locator resolved 21x
  // but every match was `hidden`). Rendering only the visible layout makes
  // `getByTestId("resource-row")` semantics match what the user sees.
  const isNarrow = useIsNarrowViewport();
  if (resources.length === 0) {
    return <>{emptyState ?? <p className="text-sm text-[var(--text-muted)]">No results.</p>}</>;
  }

  const renderTable = layout === "table" || (layout === "auto" && !isNarrow);
  const renderCards = layout === "cards" || (layout === "auto" && isNarrow);

  return (
    <div className={className ?? "rounded border border-[var(--border)] bg-[var(--surface)]"} data-testid="resource-table">
      {/* Desktop / opt-in table layout */}
      {renderTable && (
      <div
        className="overflow-x-auto"
        data-testid="resource-table-table"
      >
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--sunken)] text-left">
            <tr>
              {headers.map((h) => (
                <th
                  key={h.path}
                  scope="col"
                  className="px-3 py-2 font-medium text-[var(--text-muted)]"
                >
                  {onSortChange ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(h.path)}
                      className="flex items-center gap-1 hover:text-[var(--text)]"
                    >
                      {h.label}
                      {sort?.by === h.path && (
                        <span aria-hidden className="text-[10px]">
                          {sort.direction === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </button>
                  ) : (
                    h.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {resources.map((r) => (
              <tr
                key={`${r.resourceType}/${r.id}`}
                className={onRowClick ? "cursor-pointer hover:bg-[var(--sunken)]" : undefined}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(r);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                data-testid="resource-row"
              >
                {headers.map((h) => (
                  <Fragment key={h.path}>
                    <td className="px-3 py-2 align-top">
                      {renderCell({
                        resource: r,
                        path: h.path,
                        typeCode: h.typeCode,
                        cellRenderers,
                        renderers,
                        onReferenceClick,
                        sd,
                        resourceType,
                      })}
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* Narrow / mobile card-stack layout. Each `<li>` is also a
          `resource-row` so e2e tests that look for "a row" find the card on
          mobile viewports the same way they find the `<tr>` on desktop. The
          container testid `resource-table-cards` disambiguates layout when
          a test needs to assert which one is on screen. */}
      {renderCards && (
      <ul
        className="divide-y divide-[var(--border)]"
        data-testid="resource-table-cards"
      >
        {resources.map((r) => (
          <li
            key={`${r.resourceType}/${r.id}`}
            className={
              onRowClick
                ? "cursor-pointer p-3 hover:bg-[var(--sunken)] focus-within:bg-[var(--sunken)]"
                : "p-3"
            }
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            onKeyDown={
              onRowClick
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowClick(r);
                    }
                  }
                : undefined
            }
            tabIndex={onRowClick ? 0 : undefined}
            data-testid="resource-row"
          >
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
              {headers.map((h) => (
                <Fragment key={h.path}>
                  <dt className="text-xs font-medium text-[var(--text-muted)]">
                    {h.label}
                  </dt>
                  <dd className="break-words">
                    {renderCell({
                      resource: r,
                      path: h.path,
                      typeCode: h.typeCode,
                      cellRenderers,
                      renderers,
                      onReferenceClick,
                      sd,
                      resourceType,
                    })}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}

function typeForPath(
  sd: StructureDefinition | undefined,
  base: string,
  path: string,
): string | undefined {
  if (!sd) return undefined;
  // Strip any [index] segments and numeric indices for the SD lookup.
  const cleaned = path.replace(/\[\d+\]/g, "").replace(/\.\d+$/g, "");
  const fullPath = `${base}.${cleaned}`;
  const el = findElement(sd, fullPath);
  if (el?.type?.[0]?.code) return el.type[0].code;
  // The path may be a materialised choice variant (e.g. `valueQuantity` for
  // `Observation.value[x]`) — resolve via the choice element so cells like the
  // Observation Value column dispatch to the Quantity renderer rather than the
  // JSON fallback.
  return findChoiceVariant(sd, fullPath)?.typeCode;
}

interface RenderCellParams<T extends Resource> {
  resource: T;
  path: string;
  typeCode: string | undefined;
  cellRenderers?: Record<string, (r: T) => ReactNode>;
  renderers: TypeRenderers;
  onReferenceClick?: (ref: Reference) => void;
  sd: StructureDefinition | undefined;
  resourceType: string;
}

function renderCell<T extends Resource>({
  resource,
  path,
  typeCode,
  cellRenderers,
  renderers,
  onReferenceClick,
  sd,
  resourceType,
}: RenderCellParams<T>): ReactNode {
  const custom = cellRenderers?.[path];
  if (custom) return custom(resource);

  const value = getByPath(resource, path);
  if (value === undefined || value === null || value === "") {
    return <span className="text-[var(--text-subtle)]">—</span>;
  }

  // For choice paths (e.g. `value[x]`), the concrete variant is per-row, so the
  // typeCode resolved at header time is just the `[x]` element. Re-resolve
  // against the materialised key actually present on this resource.
  let resolvedTypeCode = typeCode;
  let resolvedPath = path;
  if (sd && path.includes("[x]")) {
    const concrete = resolveConcreteChoicePath(resource, path);
    if (concrete) {
      resolvedPath = concrete;
      // Strip array indices (`component[1]`, `name.0`) before the SD lookup —
      // StructureDefinition element paths don't carry indices, so leaving them
      // in causes findChoiceVariant to miss and fall back to the header-time
      // typeCode (often the wrong choice variant).
      const cleaned = concrete.replace(/\[\d+\]/g, "").replace(/\.\d+(?=\.|$)/g, "");
      const variant = findChoiceVariant(sd, `${resourceType}.${cleaned}`);
      if (variant?.typeCode) resolvedTypeCode = variant.typeCode;
    }
  }

  const ctx: RendererContext = {
    path: resolvedPath,
    typeCode: resolvedTypeCode,
    ...(onReferenceClick ? { onReferenceClick } : {}),
  };

  const renderer = resolvedTypeCode ? renderers[resolvedTypeCode] : undefined;
  if (renderer) return <>{renderer(value, ctx)}</>;

  // Fallback for unknown types or plain primitives.
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }
  return (
    <code className="rounded bg-[var(--sunken)] px-1 py-0.5 text-xs">
      {JSON.stringify(value).slice(0, 60)}
    </code>
  );
}

/** Walk `path` against `resource`, replacing each `name[x]` segment with the
 *  materialised key (e.g. `valueCodeableConcept`) actually present. */
function resolveConcreteChoicePath(resource: unknown, path: string): string | undefined {
  let cur: unknown = resource;
  const out: string[] = [];
  for (const segment of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (segment.endsWith("[x]")) {
      const base = segment.slice(0, -3);
      const key = resolveChoiceKey(cur, base);
      if (!key) return undefined;
      out.push(key);
      cur = (cur as Record<string, unknown>)[key];
    } else {
      const indexMatch = segment.match(/^(\w+)\[(\d+)\]$/);
      if (indexMatch) {
        cur = (cur as Record<string, unknown>)[indexMatch[1]!];
        if (Array.isArray(cur)) cur = cur[Number(indexMatch[2])];
      } else {
        cur = (cur as Record<string, unknown>)[segment];
        if (Array.isArray(cur)) cur = cur[0];
      }
      out.push(segment);
    }
  }
  return out.join(".");
}
