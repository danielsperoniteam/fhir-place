import type { Bundle, Resource } from "fhir/r4";
import { useEffect, useMemo, useState } from "react";
import { useSearch } from "../hooks/queries.js";
import { defaultRevIncludes, type RevInclude } from "../registries/revIncludes.js";

export interface ReverseReferencesProps {
  /** Type of the resource being viewed (the reference target). */
  resourceType: string;
  /** Id of the resource being viewed. */
  id: string;
  /**
   * `[resourceType, searchParam]` pairs to surface. Defaults to the
   * per-resource registry (see `defaultRevIncludes`).
   */
  includes?: readonly RevInclude[];
  /** Builds the link for a result chip; omit to render plain text. */
  hrefFor?: (resourceType: string, id: string) => string;
  /** Rows shown per section before "Show all". Default 10. */
  pageSize?: number;
}

/**
 * "Referenced by" panel (#253): shows incoming references — resources that
 * point at the one being viewed — grouped by `[type, searchParam]`.
 *
 * Counts load upfront via `_summary=count` (cheap); section contents are
 * lazy-fetched on expand so a Patient with ten configured groups does not
 * issue ten list queries on page open. A fan-out bar (log-scaled, pure CSS)
 * summarises the counts across groups.
 */
export function ReverseReferences({
  resourceType,
  id,
  includes,
  hrefFor,
  pageSize = 10,
}: ReverseReferencesProps) {
  const pairs = includes ?? defaultRevIncludes(resourceType);
  const target = `${resourceType}/${id}`;
  const [counts, setCounts] = useState<Record<string, number>>({});

  const maxCount = useMemo(
    () => Math.max(0, ...Object.values(counts)),
    [counts],
  );

  if (pairs.length === 0) {
    return (
      <p
        data-testid="reverse-references-empty"
        className="text-xs text-[var(--text-muted,#64748b)]"
      >
        No incoming-reference lookups are configured for {resourceType}.
      </p>
    );
  }

  return (
    <div className="space-y-1" data-testid="reverse-references">
      {pairs.map(([type, param]) => (
        <RevIncludeSection
          key={`${type}|${param}`}
          type={type}
          param={param}
          target={target}
          hrefFor={hrefFor}
          pageSize={pageSize}
          maxCount={maxCount}
          onCount={(n) =>
            setCounts((prev) =>
              prev[`${type}|${param}`] === n
                ? prev
                : { ...prev, [`${type}|${param}`]: n },
            )
          }
        />
      ))}
    </div>
  );
}

interface RevIncludeSectionProps {
  type: string;
  param: string;
  target: string;
  hrefFor?: (resourceType: string, id: string) => string;
  pageSize: number;
  maxCount: number;
  onCount: (n: number) => void;
}

function RevIncludeSection({
  type,
  param,
  target,
  hrefFor,
  pageSize,
  maxCount,
  onCount,
}: RevIncludeSectionProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const countQuery = useSearch(type, {
    [param]: target,
    _summary: "count",
    _count: 0,
  });
  const total = countQuery.data?.total;
  useEffect(() => {
    if (typeof total === "number") onCount(total);
    // onCount is stable enough for this purpose (guarded setState in the
    // parent); re-running on identity churn would be harmless but noisy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const listQuery = useSearch(
    type,
    { [param]: target, _count: showAll && total ? total : pageSize },
    { enabled: open },
  );

  const entries =
    (listQuery.data as Bundle<Resource> | undefined)?.entry?.flatMap((e) =>
      e.resource ? [e.resource] : [],
    ) ?? [];
  const inlineQuery = `${type}?${param}=${target}&_count=${pageSize}`;

  // Log-scaled fan-out bar: width relative to the largest group.
  const barPct =
    typeof total === "number" && total > 0 && maxCount > 0
      ? Math.max(4, (Math.log1p(total) / Math.log1p(maxCount)) * 100)
      : 0;

  return (
    <details
      data-testid={`revref-section-${type}-${param}`}
      className="rounded border border-[var(--border,#e2e8f0)]"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-2 py-1.5 text-xs">
        <span className="font-medium text-[var(--text,#0f172a)]">
          {type} — {param}
        </span>
        <span
          data-testid={`revref-count-${type}-${param}`}
          className="rounded-full bg-[var(--chip,#f1f5f9)] px-1.5 text-[11px] text-[var(--chip-text,#475569)]"
        >
          {countQuery.isLoading ? "…" : countQuery.isError ? "!" : total ?? 0}
        </span>
        <span
          aria-hidden
          className="ml-auto h-1.5 w-24 overflow-hidden rounded bg-[var(--sunken,#f8fafc)]"
          title={typeof total === "number" ? `${total} incoming` : undefined}
        >
          <span
            data-testid={`revref-fanout-${type}-${param}`}
            className="block h-full rounded bg-[var(--accent,#4f46e5)]"
            style={{ width: `${barPct}%` }}
          />
        </span>
      </summary>
      <div className="space-y-1 border-t border-[var(--border,#e2e8f0)] px-2 py-1.5">
        <code className="block break-all font-mono text-[11px] text-[var(--text-subtle,#94a3b8)]">
          {inlineQuery}
        </code>
        {listQuery.isLoading && open && (
          <p className="text-xs text-[var(--text-muted,#64748b)]">Loading…</p>
        )}
        {listQuery.isError && (
          <p className="text-xs text-[var(--danger,#dc2626)]">
            {(listQuery.error as Error)?.message ?? "Failed to load"}
          </p>
        )}
        {open && !listQuery.isLoading && !listQuery.isError && (
          <>
            {entries.length === 0 ? (
              <p className="text-xs text-[var(--text-muted,#64748b)]">
                Nothing points at this resource via {param}.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {entries.map((r) => {
                  const label = `${r.resourceType}/${r.id}`;
                  const href = r.id && hrefFor ? hrefFor(r.resourceType, r.id) : null;
                  return (
                    <li key={label} className="font-mono text-xs">
                      {href ? (
                        <a
                          href={href}
                          className="text-[var(--accent-text,#3730a3)] underline"
                        >
                          {label}
                        </a>
                      ) : (
                        <span className="text-[var(--text,#0f172a)]">{label}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {!showAll && typeof total === "number" && total > entries.length && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                data-testid={`revref-show-all-${type}-${param}`}
                className="text-xs text-[var(--accent-text,#3730a3)] underline"
              >
                Show all {total}
              </button>
            )}
          </>
        )}
      </div>
    </details>
  );
}
