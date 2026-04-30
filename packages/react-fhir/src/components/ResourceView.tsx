import type {
  DomainResource,
  Reference,
  Resource,
  StructureDefinition,
} from "fhir/r4";
import { Fragment, type ReactNode } from "react";
import { useStructureDefinition } from "../hooks/queries.js";
import {
  walkObject,
  walkResource,
  type WalkedElement,
} from "../structure/walker.js";
import { Narrative } from "./Narrative.js";
import {
  defaultTypeRenderers,
  type FhirTypeRenderer,
  type RendererContext,
  type TypeRenderers,
} from "./renderers.js";

export interface ResourceViewProps {
  resource: Resource;
  /** Overrides the fetched StructureDefinition — useful for tests, profiles, or offline mode. */
  structureDefinition?: StructureDefinition;
  /** Per-type renderer overrides, merged on top of `defaultTypeRenderers`. */
  renderers?: TypeRenderers;
  /** Hide the human-readable narrative (defaults to showing it). */
  hideNarrative?: boolean;
  /** Called when a Reference is clicked. When omitted, references render as plain text. */
  onReferenceClick?: (ref: Reference) => void;
  className?: string;
  profile?: string | null;
}

/**
 * Renders any FHIR resource using its StructureDefinition. Walks the SD in
 * canonical order, dispatches by datatype, and falls back to JSON for unknown
 * types. Zero resource-specific code.
 */
export function ResourceView(props: ResourceViewProps) {
  const { resource, structureDefinition, onReferenceClick, hideNarrative, className, profile } =
    props;
  const detectedProfile = profile === undefined ? resource.meta?.profile?.[0] : profile;

  const sdQuery = useStructureDefinition({ type: resource.resourceType, profile: detectedProfile }, {
    enabled: !structureDefinition,
  });
  const sd = structureDefinition ?? sdQuery.data;

  if (!sd) {
    if (sdQuery.isError) {
      return (
        <div className={className} data-testid="resource-view-error">
          <p className="text-sm text-red-600">
            Failed to load StructureDefinition for {resource.resourceType}:{" "}
            {sdQuery.error?.message}
          </p>
        </div>
      );
    }
    return (
      <div className={className} data-testid="resource-view-loading">
        <p className="text-sm text-slate-500">
          Loading {resource.resourceType} structure…
        </p>
      </div>
    );
  }

  const renderers = { ...defaultTypeRenderers, ...props.renderers };
  const walked = walkResource(sd, resource);
  const narrative = (resource as DomainResource).text;

  return (
    <section className={className} data-testid="resource-view">
      <header className="mb-3 flex items-baseline gap-2 border-b border-slate-200 pb-2">
        <h2 className="text-lg font-semibold">{resource.resourceType}</h2>
        {resource.id && (
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{resource.id}</code>
        )}
      </header>

      {!hideNarrative && narrative?.div && (
        <details className="mb-4 rounded border border-slate-200 bg-white p-3" open>
          <summary className="cursor-pointer text-sm font-medium text-slate-600">
            Narrative
          </summary>
          <Narrative narrative={narrative} className="prose prose-sm mt-2 max-w-none" />
        </details>
      )}

      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[minmax(8rem,1fr)_3fr] sm:gap-y-2">
        {walked.map((w) => (
          <Fragment key={w.key}>
            <dt className="font-medium text-slate-600 sm:pt-0" title={w.path}>
              {w.label}
            </dt>
            <dd className="-mt-2 sm:mt-0">
              <ElementValue
                walked={w}
                sd={sd}
                renderers={renderers}
                onReferenceClick={onReferenceClick}
              />
            </dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

interface ElementValueProps {
  walked: WalkedElement;
  sd: StructureDefinition;
  renderers: TypeRenderers;
  onReferenceClick?: (ref: Reference) => void;
}

function ElementValue({ walked, sd, renderers, onReferenceClick }: ElementValueProps) {
  const { value, isArray } = walked;
  if (isArray && Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-400">—</span>;
    return (
      <ul className="space-y-1">
        {value.map((item, i) => (
          <li key={i}>
            <RenderByType
              value={item}
              walked={walked}
              sd={sd}
              renderers={renderers}
              onReferenceClick={onReferenceClick}
            />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <RenderByType
      value={value}
      walked={walked}
      sd={sd}
      renderers={renderers}
      onReferenceClick={onReferenceClick}
    />
  );
}

interface RenderByTypeProps {
  value: unknown;
  walked: WalkedElement;
  sd: StructureDefinition;
  renderers: TypeRenderers;
  onReferenceClick?: (ref: Reference) => void;
}

function RenderByType({
  value,
  walked,
  sd,
  renderers,
  onReferenceClick,
}: RenderByTypeProps): ReactNode {
  const ctx: RendererContext = {
    path: walked.path,
    typeCode: walked.typeCode,
    onReferenceClick,
  };

  const typeCode = walked.typeCode;
  if (typeCode === "BackboneElement" || typeCode === "Element") {
    return (
      <BackboneView
        sd={sd}
        parentPath={walked.path}
        value={value as Record<string, unknown>}
        renderers={renderers}
        onReferenceClick={onReferenceClick}
      />
    );
  }

  const renderer: FhirTypeRenderer | undefined = typeCode
    ? renderers[typeCode]
    : undefined;
  if (renderer) {
    return <>{renderer(value, ctx)}</>;
  }

  return (
    <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

interface BackboneViewProps {
  sd: StructureDefinition;
  parentPath: string;
  value: Record<string, unknown>;
  renderers: TypeRenderers;
  onReferenceClick?: (ref: Reference) => void;
}

function BackboneView({
  sd,
  parentPath,
  value,
  renderers,
  onReferenceClick,
}: BackboneViewProps) {
  const children = walkObject(sd, parentPath, value);
  if (children.length === 0) {
    return (
      <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return (
    <dl className="grid grid-cols-1 gap-x-3 gap-y-1 border-l-2 border-slate-200 pl-3 sm:grid-cols-[minmax(6rem,1fr)_3fr]">
      {children.map((c) => (
        <Fragment key={c.key}>
          <dt className="text-xs font-medium text-slate-500" title={c.path}>
            {c.label}
          </dt>
          <dd className="text-sm">
            <ElementValue
              walked={c}
              sd={sd}
              renderers={renderers}
              onReferenceClick={onReferenceClick}
            />
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}
