import type { Bundle, Resource } from "fhir/r4";
import { useEffect, useMemo, useState } from "react";
import { useInfiniteSearch, useSearch } from "../hooks/queries.js";
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
  /**
   * SPA navigation handler. When set, chip clicks call this (with
   * preventDefault) instead of following the href — required under hash or
   * basename routing where a root-relative href would leave the app.
   */
  onNavigate?: (resourceType: string, id: string) => void;
  /** Rows shown per section before "Show all". Default 10. */
  pageSize?: number;
  /**
   * Safety cap on pages fetched per "Show all" click (default 100). When a
   * group is larger than `maxAutoPages × page size`, the drain pauses and
   * the Show-all control reappears to continue.
   */
  maxAutoPages?: number;
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
  onNavigate,
  pageSize = 10,
  maxAutoPages = 100,
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
          onNavigate={onNavigate}
          pageSize={pageSize}
          maxAutoPages={maxAutoPages}
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
  onNavigate?: (resourceType: string, id: string) => void;
  pageSize: number;
  maxAutoPages: number;
  maxCount: number;
  onCount: (n: number) => void;
}

function RevIncludeSection({
  type,
  param,
  target,
  hrefFor,
  onNavigate,
  pageSize,
  maxAutoPages,
  maxCount,
  onCount,
}: RevIncludeSectionProps) {
  const [open, setOpen] = useState(false);
  const [draining, setDraining] = useState(false);
  // Requested _count for the first page. Raised to `total` as a fallback
  // when a server reports more rows than it returned but omits
  // `link[rel=next]` — without paging links, one big request is the only
  // way to get the rest.
  const [countParam, setCountParam] = useState(pageSize);

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

  // Page-aware list: servers may cap `_count`, so "Show all" cannot rely on
  // one big request — after the user opts in, keep following the Bundle's
  // `next` links until every row is loaded (Codex review on #728).
  const listQuery = useInfiniteSearch(
    type,
    { [param]: target, _count: countParam },
    { enabled: open },
  );
  const { hasNextPage, fetchNextPage } = listQuery;

  // Sequentially follow next links until the server stops emitting them.
  // Driven by each fetch's returned state, not an effect on
  // isFetchingNextPage — React batches that flag's true→false transition
  // away when pages resolve quickly, which would stall an effect-based
  // drain after one page. `maxAutoPages` caps each click as a defence
  // against a server that pathologically always returns a next link; when
  // the cap pauses the drain early, `draining` resets so the Show-all
  // control reappears to continue rather than stranding an infinite
  // loading state.
  const entries =
    listQuery.data?.pages.flatMap(
      (page) =>
        (page as Bundle<Resource>).entry?.flatMap((e) =>
          e.resource ? [e.resource] : [],
        ) ?? [],
    ) ?? [];

  // A section is truncated when the server advertises a next link OR
  // reports a total beyond what it returned without any paging links (some
  // servers honor `_count` but never emit `link[rel=next]`). The latter is
  // recoverable exactly once, by re-requesting with `_count=total`.
  const truncatedWithoutLinks =
    !hasNextPage &&
    typeof total === "number" &&
    total > entries.length &&
    countParam !== total;
  const canShowAll = hasNextPage || truncatedWithoutLinks;

  const drainAll = async () => {
    if (truncatedWithoutLinks) {
      // No paging links to follow — raise the first-page _count to total.
      // The params change resets the query, which refetches while
      // `listQuery.isLoading` shows the existing loading state.
      setCountParam(total);
      return;
    }
    setDraining(true);
    try {
      let fetched = 0;
      let res = await fetchNextPage();
      fetched += 1;
      while (res.hasNextPage && !res.isError && fetched < maxAutoPages) {
        res = await fetchNextPage();
        fetched += 1;
      }
    } finally {
      setDraining(false);
    }
  };
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
                  const rid = r.id;
                  const href = rid && hrefFor ? hrefFor(r.resourceType, rid) : null;
                  const navigate =
                    rid && onNavigate
                      ? (e: React.MouseEvent) => {
                          e.preventDefault();
                          onNavigate(r.resourceType, rid);
                        }
                      : undefined;
                  return (
                    <li key={label} className="font-mono text-xs">
                      {href || navigate ? (
                        <a
                          href={href ?? "#"}
                          onClick={navigate}
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
            {!draining && canShowAll && (
              <button
                type="button"
                onClick={() => void drainAll()}
                data-testid={`revref-show-all-${type}-${param}`}
                className="text-xs text-[var(--accent-text,#3730a3)] underline"
              >
                Show all {typeof total === "number" ? total : ""}
              </button>
            )}
            {draining && (
              <p
                data-testid={`revref-loading-more-${type}-${param}`}
                className="text-xs text-[var(--text-muted,#64748b)]"
              >
                Loading all… ({entries.length}
                {typeof total === "number" ? ` of ${total}` : ""})
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
