import { ResourceEditor, useCreateResource } from "@fhir-place/react-fhir";
import type { Resource } from "fhir/r4";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  RESOURCE_LIST_CONFIG,
  isTopResourceType,
} from "../../../resourceListConfig.js";
import { resourceCollectionLabel } from "../resourceLabels.js";

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
