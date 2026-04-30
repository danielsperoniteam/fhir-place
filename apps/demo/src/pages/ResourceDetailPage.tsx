import {
  ResourceView,
  useDeleteResource,
  useResource,
} from "@fhir-place/react-fhir";
import type { Reference, Resource } from "fhir/r4";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CompartmentSection } from "../components/CompartmentSection.js";
import { PatientCompartmentLinks } from "../components/PatientCompartmentLinks.js";
import { PATIENT_COMPARTMENT } from "../compartment.js";

export function ResourceDetailPage() {
  const { resourceType = "", id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useResource<Resource>(resourceType, id);
  const del = useDeleteResource();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const onReferenceClick = (ref: Reference) => {
    const r = ref.reference;
    if (!r) return;
    if (/^https?:\/\//i.test(r)) {
      window.open(r, "_blank", "noopener,noreferrer");
      return;
    }
    const [type, refId] = r.split("/");
    if (type && refId) navigate(`/${type}/${refId}`);
  };

  const handleDelete = async () => {
    try {
      await del.mutateAsync({ type: resourceType, id });
      navigate(`/${resourceType}`);
    } catch {
      // del.error is now populated; the confirm panel renders it inline so
      // the user can read the server message and retry or cancel.
    }
  };

  return (
    <div className="space-y-4">
      <nav className="flex items-center justify-between text-sm">
        <Link to={`/${resourceType}`} className="text-slate-500 underline">
          ← All {resourceType.toLowerCase()}s
        </Link>
        <div className="flex gap-2">
          <Link
            to={`/${resourceType}/${id}/edit`}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
            data-testid="edit-resource"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded border border-red-300 bg-white px-3 py-1 text-xs text-red-700 hover:bg-red-50"
            data-testid="delete-resource"
          >
            Delete
          </button>
        </div>
      </nav>

      {confirmingDelete && (
        <div
          data-testid="delete-confirm"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm"
        >
          <p className="mb-2 text-red-800">
            Delete {resourceType}/{id}? This cannot be undone.
          </p>
          {del.isError && (
            <p
              role="alert"
              data-testid="delete-error"
              className="mb-2 rounded border border-red-300 bg-white p-2 text-xs text-red-800"
            >
              {(del.error as Error)?.message ?? "Delete failed"}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded border border-slate-300 bg-white px-3 py-1 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={del.isPending}
              data-testid="delete-confirm-button"
              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {del.isPending ? "Deleting…" : "Yes, delete"}
            </button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(error as Error)?.message}
        </p>
      )}
      {data && (
        <ResourceView
          resource={data}
          onReferenceClick={onReferenceClick}
          className="rounded border border-slate-200 bg-white p-4 shadow-sm"
        />
      )}

      {data && (
        <details className="rounded border border-slate-200 bg-white" data-testid="resource-json">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-700">
            View full JSON
          </summary>
          <pre className="max-h-[32rem] overflow-auto border-t border-slate-200 bg-slate-50 p-4 text-xs text-slate-800">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      )}

      {data && resourceType === "Patient" && (
        <section
          className="space-y-6 pt-2"
          data-testid="patient-compartment"
          aria-label="Patient compartment"
        >
          <div className="border-t border-slate-200 pt-4">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              Clinical data
            </h2>
            <PatientCompartmentLinks patientId={id} />
          </div>
          {PATIENT_COMPARTMENT.map((section) => (
            <CompartmentSection
              key={section.resourceType}
              patientId={id}
              {...section}
            />
          ))}
        </section>
      )}
    </div>
  );
}
