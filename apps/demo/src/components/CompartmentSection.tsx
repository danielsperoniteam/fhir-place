import { ResourceTable, useSearch } from "@fhir-place/react-fhir";
import type { Resource } from "fhir/r4";
import { Link, useNavigate } from "react-router-dom";

export interface CompartmentSectionProps {
  /** Patient id scoping the search. */
  patientId: string;
  /** Resource type to list (e.g. "Observation", "Condition"). */
  resourceType: string;
  /** Dotted FHIR paths to show as columns. */
  columns: string[];
  /** Override column header labels. Prevents collisions like two "Text" columns. */
  columnLabels?: Record<string, string>;
  /** Header shown above the table. */
  title: string;
  /**
   * Search parameter on the target type that references the patient.
   * Defaults to "patient" — works for most compartment types.
   */
  patientSearchParam?: string;
  limit?: number;
}

/**
 * One row in the Patient compartment view: fires a scoped search, renders a
 * <ResourceTable> when there are results, hides itself when there are none.
 */
export function CompartmentSection({
  patientId,
  resourceType,
  columns,
  columnLabels,
  title,
  patientSearchParam = "patient",
  limit = 5,
}: CompartmentSectionProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useSearch<Resource>(resourceType, {
    [patientSearchParam]: patientId,
    _count: limit,
  });

  const resources =
    data?.entry?.flatMap((e) => (e.resource ? [e.resource] : [])) ?? [];
  const total = data?.total ?? resources.length;

  if (!isLoading && resources.length === 0) return null;

  return (
    <section
      className="space-y-2"
      data-testid={`compartment-section-${resourceType}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        <span className="text-xs text-slate-500">
          {isLoading
            ? "Loading…"
            : total > resources.length
              ? `showing ${resources.length} of ${total}`
              : `${resources.length}`}
        </span>
      </div>
      {isLoading ? (
        <p className="rounded border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          Loading {resourceType.toLowerCase()}…
        </p>
      ) : (
        <>
          <ResourceTable
            resources={resources}
            columns={columns}
            columnLabels={columnLabels}
            onRowClick={(r) => {
              if (r.id) navigate(`/${r.resourceType}/${r.id}`);
            }}
          />
          {total > resources.length && (
            <Link
              to={`/${resourceType}?patient=${patientId}`}
              className="inline-block text-xs text-blue-700 underline"
            >
              View all {total} →
            </Link>
          )}
        </>
      )}
    </section>
  );
}
