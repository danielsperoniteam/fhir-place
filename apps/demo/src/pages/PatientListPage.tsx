import {
  ColumnPicker,
  ResourceSearch,
  ResourceTable,
  useInfiniteSearch,
} from "@fhir-place/react-fhir";
import type { Patient } from "fhir/r4";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { SearchParams } from "@fhir-place/react-fhir";
import { PatientRowCounts } from "../components/PatientRowCounts.js";

const formatName = (p: Patient): string => {
  const n = p.name?.[0];
  if (!n) return "(no name)";
  if (n.text) return n.text;
  return [n.given?.join(" "), n.family].filter(Boolean).join(" ");
};

type Layout = "list" | "table";
const LAYOUT_KEY = "fhir-place-demo-patient-layout";
const COLUMN_KEY = "fhir-place-demo-patient-columns";
const PAGE_SIZE = 20;

const TABLE_COLUMNS: Array<{ path: string; label: string }> = [
  { path: "name", label: "Name" },
  { path: "gender", label: "Gender" },
  { path: "birthDate", label: "Birth date" },
  { path: "address.city", label: "City" },
  { path: "id", label: "ID" },
  { path: "__counts", label: "Resources" },
  { path: "active", label: "Active" },
  { path: "identifier", label: "Identifier" },
  { path: "telecom", label: "Telecom" },
  { path: "address", label: "Address" },
  { path: "address.line", label: "Street" },
  { path: "address.state", label: "State" },
  { path: "address.postalCode", label: "Postal code" },
  { path: "address.country", label: "Country" },
  { path: "maritalStatus", label: "Marital status" },
  { path: "deceasedBoolean", label: "Deceased" },
  { path: "deceasedDateTime", label: "Deceased on" },
  { path: "multipleBirthBoolean", label: "Multiple birth" },
  { path: "multipleBirthInteger", label: "Birth order" },
  { path: "communication", label: "Communication" },
  { path: "generalPractitioner", label: "General practitioner" },
  { path: "managingOrganization", label: "Managing organization" },
  { path: "contact", label: "Contact" },
  { path: "language", label: "Language" },
];

const DEFAULT_VISIBLE_COLUMNS = [
  "name",
  "gender",
  "birthDate",
  "address.city",
  "id",
  "__counts",
];

const readLayout = (): Layout => {
  if (typeof window === "undefined") return "list";
  const v = window.localStorage.getItem(LAYOUT_KEY);
  return v === "table" ? "table" : "list";
};

/** Build the SearchParams object passed to `useInfiniteSearch` from the URL. */
const paramsFromUrl = (urlParams: URLSearchParams): SearchParams => {
  const out: SearchParams = { _count: PAGE_SIZE };
  for (const [k, v] of urlParams.entries()) out[k] = v;
  return out;
};

/** Build the form's pre-fill object from the URL (strings only — `_count` is layout, not a filter). */
const formInitialFromUrl = (urlParams: URLSearchParams): Record<string, string> =>
  Object.fromEntries(urlParams.entries());

export function PatientListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [columns, setColumns] = useState<string[]>(
    () => DEFAULT_VISIBLE_COLUMNS,
  );
  const navigate = useNavigate();

  // Derive search params from the URL so reload / share-link / browser back
  // all replay the same query. `_count` is paging metadata; we keep it out of
  // the URL so users see clean shareable links (`?name=hop`, not
  // `?name=hop&_count=20`).
  const params = useMemo(() => paramsFromUrl(searchParams), [searchParams]);
  // Snapshot the URL state for the form's `initialParams` — re-read whenever
  // the URL changes (e.g. browser back) so the form mirrors what's filtered.
  const formInitial = useMemo(
    () => formInitialFromUrl(searchParams),
    [searchParams],
  );
  // Re-mount the form when the URL changes so its internal state resets to
  // `formInitial`. Cheap (form is small) and avoids hand-syncing internal
  // state when external state moves.
  const formKey = searchParams.toString();

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteSearch<Patient>("Patient", params);

  const patients =
    data?.pages.flatMap(
      (b) => b.entry?.flatMap((e) => (e.resource ? [e.resource] : [])) ?? [],
    ) ?? [];
  const totalAdvertised = data?.pages[0]?.total;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LAYOUT_KEY, layout);
  }, [layout]);

  const submitFilters = (next: SearchParams) => {
    // Coerce the SearchParams (string | number | string[]) shape down to
    // strings for the URL. Numbers and arrays are rare in this filter form
    // and round-trip through `String()` cleanly.
    const entries: Array<[string, string]> = [];
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "" || v === null) continue;
      if (Array.isArray(v)) entries.push([k, v.join(",")]);
      else entries.push([k, String(v)]);
    }
    setSearchParams(Object.fromEntries(entries), { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Patients</h1>
          <p className="text-sm text-slate-500">
            {data
              ? totalAdvertised !== undefined
                ? `${patients.length} of ${totalAdvertised}`
                : `${patients.length} loaded`
              : "…"}
          </p>
        </div>
        <Link
          to="/Patient/new"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          data-testid="create-patient"
        >
          + New patient
        </Link>
      </div>

      <ResourceSearch
        key={formKey}
        resourceType="Patient"
        initialVisible={6}
        initialParams={formInitial}
        priorityParams={["name", "family", "given", "gender", "birthdate", "address-city"]}
        onSubmit={submitFilters}
      />

      <div className="flex items-center justify-between gap-2">
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
        {layout === "table" && (
          <ColumnPicker
            options={TABLE_COLUMNS}
            defaultSelected={DEFAULT_VISIBLE_COLUMNS}
            onChange={setColumns}
            storageKey={COLUMN_KEY}
          />
        )}
      </div>

      {isError && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error)?.message ?? "Search failed"}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      {layout === "list" ? (
        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {patients.map((p) => (
            <li key={p.id} data-testid="patient-row">
              <Link
                to={`/Patient/${p.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-slate-900">{formatName(p)}</span>
                  <span className="text-xs text-slate-500">
                    {p.gender ?? "—"} · {p.birthDate ?? "—"} ·{" "}
                    <code className="rounded bg-slate-100 px-1 py-0.5">{p.id}</code>
                  </span>
                </div>
                {p.id && <PatientRowCounts patientId={p.id} />}
              </Link>
            </li>
          ))}
          {!isLoading && patients.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">
              No patients match.
            </li>
          )}
        </ul>
      ) : (
        <ResourceTable<Patient>
          resources={patients}
          columns={TABLE_COLUMNS.map((c) => c.path).filter((p) => columns.includes(p))}
          columnLabels={Object.fromEntries(TABLE_COLUMNS.map((c) => [c.path, c.label]))}
          cellRenderers={{
            __counts: (patient) =>
              patient.id ? <PatientRowCounts patientId={patient.id} /> : <span className="text-slate-400">—</span>,
          }}
          onRowClick={(p) => navigate(`/Patient/${p.id}`)}
          emptyState={
            <p className="px-4 py-6 text-center text-sm text-slate-500">
              No patients match.
            </p>
          }
        />
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
