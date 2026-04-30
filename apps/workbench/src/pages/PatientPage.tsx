import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  bundleEntries,
  getPatient,
  searchByPatient,
  type AllowedResourceType,
} from "../api/fhir.js";
import { getConnection } from "../api/connections.js";
import { createSession } from "../api/sessions.js";
import { patientDisplayName } from "../components/PatientName.js";
import type { Resource } from "fhir/r4";

const COMPARTMENT_TYPES: ReadonlyArray<Exclude<AllowedResourceType, "Patient">> = [
  "Condition",
  "MedicationRequest",
  "AllergyIntolerance",
  "Encounter",
  "Observation",
];

export function PatientPage() {
  const { cid, pid } = useParams<{ cid: string; pid: string }>();
  const navigate = useNavigate();

  const conn = useQuery({
    queryKey: ["connections", cid],
    queryFn: () => getConnection(cid!),
    enabled: Boolean(cid),
  });

  const startSession = useMutation({
    mutationFn: () => createSession(cid!, pid!),
    onSuccess: (s) => navigate(`/sessions/${s.id}`),
  });

  const patient = useQuery({
    queryKey: ["patient", cid, pid],
    queryFn: () => getPatient(cid!, pid!),
    enabled: Boolean(cid && pid),
  });

  const compartments = useQueries({
    queries: COMPARTMENT_TYPES.map((rt) => ({
      queryKey: ["compartment", cid, pid, rt],
      queryFn: () => searchByPatient(cid!, rt, pid!),
      enabled: Boolean(cid && pid),
    })),
  });

  if (!cid || !pid) return null;

  return (
    <section className="space-y-4">
      <Link
        to={`/connections/${cid}/patients`}
        className="text-sm text-slate-600 hover:underline"
      >
        ← All patients{conn.data ? ` · ${conn.data.name}` : ""}
      </Link>

      {patient.isLoading && <p className="text-sm text-slate-500">Loading patient…</p>}
      {patient.isError && (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {(patient.error as Error).message}
        </p>
      )}

      {patient.data && (
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              {patientDisplayName(patient.data)}
            </h1>
            <Link
              to={`/connections/${cid}/patients/${pid}/Patient/${pid}`}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              raw JSON
            </Link>
            <button
              type="button"
              onClick={() => startSession.mutate()}
              disabled={startSession.isPending}
              data-testid="start-session"
              className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {startSession.isPending ? "Starting…" : "Start agent session"}
            </button>
          </div>
          {startSession.isError && (
            <p className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">
              {(startSession.error as Error).message}
            </p>
          )}
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-slate-500">Patient id</dt>
            <dd className="font-mono">{patient.data.id}</dd>
            <dt className="text-slate-500">Gender</dt>
            <dd>{patient.data.gender ?? "—"}</dd>
            <dt className="text-slate-500">Birthdate</dt>
            <dd>{patient.data.birthDate ?? "—"}</dd>
            <dt className="text-slate-500">Identifier(s)</dt>
            <dd>
              {patient.data.identifier && patient.data.identifier.length > 0
                ? patient.data.identifier
                    .map(
                      (i) =>
                        `${i.system ? `${i.system}|` : ""}${i.value ?? "—"}`,
                    )
                    .join(", ")
                : "—"}
            </dd>
          </dl>
        </header>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {COMPARTMENT_TYPES.map((rt, i) => (
          <CompartmentCard
            key={rt}
            cid={cid}
            pid={pid}
            resourceType={rt}
            isLoading={compartments[i]?.isLoading ?? false}
            error={compartments[i]?.error as Error | null | undefined}
            resources={bundleEntries(compartments[i]?.data)}
          />
        ))}
      </div>
    </section>
  );
}

function CompartmentCard({
  cid,
  pid,
  resourceType,
  isLoading,
  error,
  resources,
}: {
  cid: string;
  pid: string;
  resourceType: AllowedResourceType;
  isLoading: boolean;
  error: Error | null | undefined;
  resources: Resource[];
}) {
  return (
    <section
      data-testid={`compartment-${resourceType}`}
      className="rounded-md border border-slate-200 bg-white p-4 text-sm"
    >
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{resourceType}</h2>
        <span className="text-xs text-slate-500">
          {isLoading ? "…" : `${resources.length}`}
        </span>
      </header>
      {error && (
        <p className="text-rose-700" data-testid={`compartment-${resourceType}-error`}>
          {error.message}
        </p>
      )}
      {!error && resources.length === 0 && !isLoading && (
        <p className="text-slate-500">No {resourceType} resources found.</p>
      )}
      {resources.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {resources.slice(0, 8).map((r) => (
            <li key={r.id} className="py-1.5">
              <Link
                to={`/connections/${cid}/patients/${pid}/${resourceType}/${r.id}`}
                className="block hover:underline"
              >
                <span className="font-mono text-xs text-slate-500">{r.id}</span>{" "}
                <span className="text-slate-700">{summarise(r)}</span>
              </Link>
            </li>
          ))}
          {resources.length > 8 && (
            <li className="pt-2 text-xs text-slate-500">
              + {resources.length - 8} more
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * Cheap, type-aware single-line summary. We deliberately don't try to be
 * comprehensive — the raw JSON page is one click away.
 */
function summarise(r: Resource): string {
  const any = r as unknown as {
    code?: { text?: string; coding?: Array<{ display?: string }> };
    medicationCodeableConcept?: { text?: string };
    medicationReference?: { display?: string };
    status?: string;
    period?: { start?: string };
    onsetDateTime?: string;
  };
  switch (r.resourceType) {
    case "Condition":
      return [any.status, any.code?.text ?? any.code?.coding?.[0]?.display]
        .filter(Boolean)
        .join(" · ");
    case "MedicationRequest":
      return [
        any.status,
        any.medicationCodeableConcept?.text ??
          any.code?.text ??
          any.medicationReference?.display,
      ]
        .filter(Boolean)
        .join(" · ");
    case "AllergyIntolerance":
      return any.code?.text ?? any.code?.coding?.[0]?.display ?? "(no code)";
    case "Encounter":
      return [any.status, any.period?.start].filter(Boolean).join(" · ");
    case "Observation":
      return any.code?.text ?? any.code?.coding?.[0]?.display ?? "(no code)";
    default:
      return "";
  }
}
