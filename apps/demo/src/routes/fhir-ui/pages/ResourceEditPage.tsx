import {
  FhirError,
  ResourceEditor,
  useResource,
  useUpdateResource,
} from "@fhir-place/react-fhir";
import type { Resource } from "fhir/r4";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ccBtn } from "../../../components/ccStyles.js";

export function ResourceEditPage() {
  const { resourceType = "", id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useResource<Resource>(resourceType, id);
  const notFound =
    error instanceof FhirError && (error.status === 404 || error.status === 410);
  const update = useUpdateResource<Resource>();

  return (
    <div className="space-y-4">
      <nav className="text-sm" style={{ color: "var(--text-muted)" }}>
        <Link to={`/fhir-ui/${resourceType}/${id}`} className="underline">
          ← Back to {resourceType}/{id}
        </Link>
      </nav>
      {isLoading && (
        <p
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
          data-testid="resource-loading"
        >
          Loading {resourceType}/{id}…
        </p>
      )}
      {isError && notFound && (
        <div
          data-testid="resource-not-found"
          style={{
            padding: "14px 16px",
            borderRadius: 8,
            border: "1px solid var(--warn)",
            background: "var(--warn-soft)",
            fontSize: 13,
            color: "var(--text)",
          }}
        >
          <p style={{ margin: "0 0 4px", fontWeight: 500 }}>{resourceType} not found</p>
          <p style={{ margin: "0 0 10px", color: "var(--text-muted)" }}>
            {resourceType}/{id} doesn't exist on this server, or it was deleted.
          </p>
          <Link
            to={`/fhir-ui/${resourceType}`}
            style={{ fontSize: 12, color: "var(--text-muted)" }}
          >
            ← Back to all {resourceType.toLowerCase()}s
          </Link>
        </div>
      )}
      {isError && !notFound && (
        <div
          data-testid="resource-error"
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid var(--danger)",
            background: "var(--danger-soft)",
            fontSize: 13,
            color: "var(--danger)",
          }}
        >
          <p style={{ margin: "0 0 8px" }}>
            {(error as Error)?.message ?? `Failed to load ${resourceType}/${id}.`}
          </p>
          <button onClick={() => refetch()} style={ccBtn("secondary")}>
            Retry
          </button>
        </div>
      )}
      {data && (
        <ResourceEditor
          resource={data}
          saveLabel="Save changes"
          saving={update.isPending}
          onCancel={() => navigate(`/fhir-ui/${resourceType}/${id}`)}
          onSave={async (draft) => {
            await update.mutateAsync(draft as Resource & { id: string });
            navigate(`/fhir-ui/${resourceType}/${id}`);
          }}
          className="cc-card space-y-4 rounded border p-4 shadow-sm"
        />
      )}
      {update.isError && (
        <p
          className="rounded border p-3 text-sm"
          style={{
            borderColor: "var(--danger)",
            background: "var(--danger-soft)",
            color: "var(--danger)",
          }}
        >
          {(update.error as Error)?.message}
        </p>
      )}
    </div>
  );
}
