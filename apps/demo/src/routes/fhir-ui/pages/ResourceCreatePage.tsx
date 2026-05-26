import { ResourceEditor, useCreateResource } from "@fhir-place/react-fhir";
import type { Patient, Resource } from "fhir/r4";
import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  RESOURCE_LIST_CONFIG,
  isTopResourceType,
} from "../../../resourceListConfig.js";
import { resourceCollectionLabel } from "../resourceLabels.js";

/**
 * Returns true when a Patient draft has at least one usable identity field:
 * a non-empty identifier value, or name.given/name.family/name.text. Used as
 * the `validate` prop on ResourceEditor to gate Save without requiring the
 * parent to track draft state.
 */
function patientHasIdentity(draft: Resource): boolean {
  if (draft.resourceType !== "Patient") return true;
  const p = draft as Patient;

  const hasIdentifier = (p.identifier ?? []).some(
    (id) => id != null && typeof id.value === "string" && id.value.trim() !== "",
  );
  if (hasIdentifier) return true;

  return (p.name ?? []).some(
    (n) =>
      n != null &&
      ((typeof n.text === "string" && n.text.trim() !== "") ||
        (typeof n.family === "string" && n.family.trim() !== "") ||
        (n.given ?? []).some((g) => typeof g === "string" && g.trim() !== "")),
  );
}

export function ResourceCreatePage() {
  const { resourceType = "" } = useParams();
  const navigate = useNavigate();
  const create = useCreateResource<Resource>();

  const config = isTopResourceType(resourceType)
    ? RESOURCE_LIST_CONFIG[resourceType]
    : undefined;
  const singular = config?.singular ?? resourceType.toLowerCase();

  // Stable reference — only Patient resources get the identity gate.
  const validate = useCallback(
    (d: Resource) => patientHasIdentity(d),
    [],
  );

  return (
    <div className="space-y-4">
      <nav className="text-sm text-slate-500">
        <Link
          to={`/fhir-ui/${resourceType}`}
          className="underline"
          data-testid="resource-create-back-link"
        >
          ← All {resourceCollectionLabel(resourceType)}
        </Link>
      </nav>
      <ResourceEditor
        resource={{ resourceType } as Resource}
        saveLabel={`Create ${singular}`}
        saving={create.isPending}
        validate={validate}
        onCancel={() => navigate(`/fhir-ui/${resourceType}`)}
        onSave={async (draft) => {
          const created = await create.mutateAsync(draft as Resource & { id?: string });
          navigate(`/fhir-ui/${resourceType}/${created.id}`);
        }}
        className="space-y-4 rounded border border-slate-200 bg-white p-4 shadow-sm"
      />
      {create.isError && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(create.error as Error)?.message}
        </p>
      )}
    </div>
  );
}
