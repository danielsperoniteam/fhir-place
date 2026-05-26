import { ResourceEditor, useCreateResource } from "@fhir-place/react-fhir";
import type { Patient, Resource } from "fhir/r4";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  RESOURCE_LIST_CONFIG,
  isTopResourceType,
} from "../../../resourceListConfig.js";

const EMPTY_PATIENT_WARNING =
  "This Patient has no name or identifier. Anyone viewing the list later won't be able to identify it. Create anyway?";

/**
 * A Patient with no `identifier` and no `name` entry carrying given/family/text
 * is technically valid (Patient.* is 0..* in R4) but unidentifiable in the UI.
 * Returns a warning string when the draft is anonymous, otherwise `null`.
 */
function warnIfUnidentifiablePatient(draft: Resource): string | null {
  if (draft.resourceType !== "Patient") return null;
  const patient = draft as Patient;
  if ((patient.identifier ?? []).some((id) => (id.value ?? "").trim() !== ""))
    return null;
  const named = (patient.name ?? []).some(
    (n) =>
      (n.given ?? []).some((g) => g.trim() !== "") ||
      (n.family ?? "").trim() !== "" ||
      (n.text ?? "").trim() !== "",
  );
  return named ? null : EMPTY_PATIENT_WARNING;
}

/**
 * Generic create form for any FHIR resource type. Renders the spec-driven
 * `<ResourceEditor>` against an empty `{ resourceType }` seed and POSTs the
 * filled draft. On success, navigates to the new resource's detail page.
 *
 * Configured types (top-N in the sidebar) get a friendly singular noun on the
 * save button and back link; other types fall back to the raw type name.
 */
export function ResourceCreatePage() {
  const { resourceType = "" } = useParams();
  const navigate = useNavigate();
  const create = useCreateResource<Resource>();

  const config = isTopResourceType(resourceType)
    ? RESOURCE_LIST_CONFIG[resourceType]
    : undefined;
  const singular = config?.singular ?? resourceType.toLowerCase();
  const title = config?.title ?? resourceType;

  return (
    <div className="space-y-4">
      <nav className="text-sm text-slate-500">
        <Link to={`/fhir-ui/${resourceType}`} className="underline">
          ← All {title.toLowerCase()}
        </Link>
      </nav>
      <ResourceEditor
        resource={{ resourceType } as Resource}
        saveLabel={`Create ${singular}`}
        saving={create.isPending}
        confirmOnSave={warnIfUnidentifiablePatient}
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
