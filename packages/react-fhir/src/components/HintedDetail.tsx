import type { AllergyIntolerance, Reference, Resource, StructureDefinition } from "fhir/r4";
import { Fragment, type ReactNode } from "react";
import { useStructureDefinition } from "../hooks/queries.js";
import { findChoiceVariant, findElement } from "../structure/walker.js";
import type { DetailHint, FieldPath, LayoutHint } from "../layout-hints/types.js";
import { getByPath } from "./ResourceTable.js";
import { resourceEditorClinicalSafetyGuardrailFor } from "./clinicalSafetyGuardrails.js";
import {
  defaultTypeRenderers,
  type FhirTypeRenderer,
  type RendererContext,
  type TypeRenderers,
} from "./renderers.js";

export interface HintedDetailProps {
  resource: Resource;
  /** The Tier 1 hint that drives layout. Detail-only hints render the hero +
   *  sections; missing hint or missing `detail` block falls back to nothing. */
  hint: LayoutHint;
  /** Override the fetched StructureDefinition (useful for tests / profiles). */
  structureDefinition?: StructureDefinition;
  /** Per-type renderer overrides, merged on top of `defaultTypeRenderers`. */
  renderers?: TypeRenderers;
  /** Click handler for Reference values inside the rendered fields. */
  onReferenceClick?: (ref: Reference) => void;
  className?: string;
}

/**
 * Composes a detail page from a `LayoutHint`. Reads each declared field path
 * off the resource, looks up the FHIR type code via the StructureDefinition,
 * and dispatches to the same `defaultTypeRenderers` map used by
 * `<ResourceView>` and `<ResourceTable>` — so a CodeableConcept rendered here
 * and in a table cell come out identical.
 *
 * No hint, no detail block, or no fields ⇒ renders nothing. Callers should
 * fall back to `<ResourceView>` for Tier 0 resources.
 *
 * Future tickets compose `<BackboneCollection>` (#251) into the same shell,
 * driven by `hint.detail.collections`.
 */
export function HintedDetail(props: HintedDetailProps) {
  const { resource, hint, structureDefinition, onReferenceClick, className } = props;
  const detail = hint.detail;

  const sdQuery = useStructureDefinition(
    { type: resource.resourceType, profile: resource.meta?.profile?.[0] ?? null },
    { enabled: !structureDefinition },
  );
  const sd = structureDefinition ?? sdQuery.data;
  const renderers = { ...defaultTypeRenderers, ...props.renderers };
  const guardrail = resourceEditorClinicalSafetyGuardrailFor(resource.resourceType);

  if (!detail) return null;

  return (
    <section className={className} data-testid="hinted-detail">
      {detail.hero.length > 0 && (
        <Hero
          resource={resource}
          fields={detail.hero}
          sd={sd}
          renderers={renderers}
          onReferenceClick={onReferenceClick}
        />
      )}
      {guardrail?.resourceType === "AllergyIntolerance" && (
        <AllergyIntoleranceReactionsContext
          resource={resource as AllergyIntolerance}
          sd={sd}
          renderers={renderers}
          onReferenceClick={onReferenceClick}
        />
      )}
      {detail.sections.map((section) => (
        <Section
          key={section.title}
          title={section.title}
          fields={section.fields}
          resource={resource}
          sd={sd}
          renderers={renderers}
          onReferenceClick={onReferenceClick}
        />
      ))}
    </section>
  );
}

type AllergyIntoleranceReaction = NonNullable<AllergyIntolerance["reaction"]>[number];

interface AllergyIntoleranceReactionsContextProps {
  resource: AllergyIntolerance;
  sd: StructureDefinition | undefined;
  renderers: TypeRenderers;
  onReferenceClick?: (ref: Reference) => void;
}

function AllergyIntoleranceReactionsContext({
  resource,
  sd,
  renderers,
  onReferenceClick,
}: AllergyIntoleranceReactionsContextProps) {
  const guardrail = resourceEditorClinicalSafetyGuardrailFor("AllergyIntolerance")!;
  const reactions = Array.isArray(resource.reaction) ? resource.reaction : [];
  const hasCriticality = hasValue(resource.criticality);
  const hasVerificationStatus = hasValue(resource.verificationStatus);
  const hasReactions = reactions.length > 0;

  if (!hasCriticality && !hasVerificationStatus && !hasReactions) return null;

  return (
    <section
      className="hinted-detail__section"
      data-testid="hinted-detail-section-reactions"
    >
      <h3 data-testid="hinted-detail-section-title">{guardrail.title}</h3>
      <p
        className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-950"
        data-testid="allergyintolerance-safety-warning"
      >
        {guardrail.warning}
      </p>
      <dl>
        {hasCriticality && (
          <Fragment>
            <dt title="AllergyIntolerance.criticality">criticality</dt>
            <dd data-testid="hinted-detail-field-criticality">
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
                criticality: {resource.criticality}
              </code>
            </dd>
          </Fragment>
        )}
        {hasVerificationStatus && (
          <Fragment>
            <dt title="AllergyIntolerance.verificationStatus">verificationStatus</dt>
            <dd data-testid="hinted-detail-field-verificationStatus">
              <RenderField
                value={resource.verificationStatus}
                fieldPath="verificationStatus"
                resourceType={resource.resourceType}
                sd={sd}
                renderers={renderers}
                onReferenceClick={onReferenceClick}
              />
            </dd>
          </Fragment>
        )}
        {hasReactions && (
          <Fragment>
            <dt title="AllergyIntolerance.reaction">reaction</dt>
            <dd data-testid="hinted-detail-field-reaction">
              <ReactionList
                reactions={reactions}
                resourceType={resource.resourceType}
                sd={sd}
                renderers={renderers}
                onReferenceClick={onReferenceClick}
              />
            </dd>
          </Fragment>
        )}
      </dl>
    </section>
  );
}

interface ReactionListProps {
  reactions: readonly AllergyIntoleranceReaction[];
  resourceType: string;
  sd: StructureDefinition | undefined;
  renderers: TypeRenderers;
  onReferenceClick?: (ref: Reference) => void;
}

function ReactionList({
  reactions,
  resourceType,
  sd,
  renderers,
  onReferenceClick,
}: ReactionListProps) {
  return (
    <ol className="space-y-2" data-testid="allergyintolerance-reaction-list">
      {reactions.map((reaction, index) => (
        <li key={index} className="rounded border border-slate-200 p-2">
          <dl className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[minmax(6rem,1fr)_3fr]">
            <ReactionField
              label="manifestation"
              fieldPath="reaction.manifestation"
              value={reaction.manifestation}
              resourceType={resourceType}
              sd={sd}
              renderers={renderers}
              onReferenceClick={onReferenceClick}
            />
            <ReactionField
              label="severity"
              fieldPath="reaction.severity"
              value={reaction.severity}
              resourceType={resourceType}
              sd={sd}
              renderers={renderers}
              onReferenceClick={onReferenceClick}
            />
            <ReactionField
              label="substance"
              fieldPath="reaction.substance"
              value={reaction.substance}
              resourceType={resourceType}
              sd={sd}
              renderers={renderers}
              onReferenceClick={onReferenceClick}
            />
          </dl>
        </li>
      ))}
    </ol>
  );
}

interface ReactionFieldProps {
  label: string;
  fieldPath: FieldPath;
  value: unknown;
  resourceType: string;
  sd: StructureDefinition | undefined;
  renderers: TypeRenderers;
  onReferenceClick?: (ref: Reference) => void;
}

function ReactionField({
  label,
  fieldPath,
  value,
  resourceType,
  sd,
  renderers,
  onReferenceClick,
}: ReactionFieldProps) {
  if (!hasValue(value)) return null;

  return (
    <Fragment>
      <dt title={`${resourceType}.${fieldPath}`}>{label}</dt>
      <dd>
        <RenderArrayOrField
          value={value}
          fieldPath={fieldPath}
          resourceType={resourceType}
          sd={sd}
          renderers={renderers}
          onReferenceClick={onReferenceClick}
        />
      </dd>
    </Fragment>
  );
}

interface RenderArrayOrFieldProps extends RenderFieldProps {
  value: unknown;
}

function RenderArrayOrField(props: RenderArrayOrFieldProps): ReactNode {
  if (Array.isArray(props.value)) {
    return (
      <ul className="space-y-1">
        {props.value.map((item, index) => (
          <li key={index}>
            <RenderField {...props} value={item} />
          </li>
        ))}
      </ul>
    );
  }
  return <RenderField {...props} />;
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

interface HeroProps {
  resource: Resource;
  fields: readonly FieldPath[];
  sd: StructureDefinition | undefined;
  renderers: TypeRenderers;
  onReferenceClick?: (ref: Reference) => void;
}

function Hero({ resource, fields, sd, renderers, onReferenceClick }: HeroProps) {
  return (
    <header className="hinted-detail__hero" data-testid="hinted-detail-hero">
      {fields.map((path) => {
        const value = getByPath(resource, path);
        if (value === undefined || value === null || value === "") return null;
        return (
          <span key={path} data-testid={`hinted-detail-hero-${path}`}>
            <RenderField
              value={value}
              fieldPath={path}
              resourceType={resource.resourceType}
              sd={sd}
              renderers={renderers}
              onReferenceClick={onReferenceClick}
            />
          </span>
        );
      })}
    </header>
  );
}

interface SectionProps {
  title: string;
  fields: readonly FieldPath[];
  resource: Resource;
  sd: StructureDefinition | undefined;
  renderers: TypeRenderers;
  onReferenceClick?: (ref: Reference) => void;
}

function Section({
  title,
  fields,
  resource,
  sd,
  renderers,
  onReferenceClick,
}: SectionProps) {
  const rows = fields
    .map((path) => ({ path, value: getByPath(resource, path) }))
    .filter((row) => row.value !== undefined && row.value !== null && row.value !== "");

  if (rows.length === 0) return null;

  return (
    <section
      className="hinted-detail__section"
      data-testid={`hinted-detail-section-${slug(title)}`}
    >
      <h3 data-testid="hinted-detail-section-title">{title}</h3>
      <dl>
        {rows.map((row) => (
          <Fragment key={row.path}>
            <dt title={row.path}>{labelForPath(row.path)}</dt>
            <dd data-testid={`hinted-detail-field-${row.path}`}>
              <RenderField
                value={row.value}
                fieldPath={row.path}
                resourceType={resource.resourceType}
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

interface RenderFieldProps {
  value: unknown;
  fieldPath: FieldPath;
  resourceType: string;
  sd: StructureDefinition | undefined;
  renderers: TypeRenderers;
  onReferenceClick?: (ref: Reference) => void;
}

function RenderField({
  value,
  fieldPath,
  resourceType,
  sd,
  renderers,
  onReferenceClick,
}: RenderFieldProps): ReactNode {
  const fullPath = `${resourceType}.${fieldPath}`;
  const typeCode = sd ? resolveTypeCode(sd, fullPath) : undefined;
  const ctx: RendererContext = { path: fullPath, typeCode, onReferenceClick };

  const renderer: FhirTypeRenderer | undefined = typeCode
    ? renderers[typeCode]
    : undefined;
  if (renderer) return <>{renderer(value, ctx)}</>;

  // Fallback: primitives stringify, complex values fall through to JSON. The
  // SD lookup misses for resource-specific backbone elements at first run; the
  // generic <ResourceView> handles those — hint authors should not list them.
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }
  return (
    <pre className="hinted-detail__json">{JSON.stringify(value, null, 2)}</pre>
  );
}

/** Look up the primary FHIR type code for a `Resource.field.path` string. */
function resolveTypeCode(sd: StructureDefinition, fullPath: string): string | undefined {
  const direct = findElement(sd, stripIndices(fullPath));
  if (direct?.type?.[0]?.code) return direct.type[0].code;
  // Try choice resolution (`valueQuantity` → `value[x]` of type `Quantity`).
  const choice = findChoiceVariant(sd, stripIndices(fullPath));
  return choice?.typeCode;
}

const stripIndices = (path: string): string => path.replace(/\[\d+\]/g, "");

const labelForPath = (path: FieldPath): string => {
  const last = path.split(".").pop() ?? path;
  return last
    .replace(/\[\d+\]/g, "")
    .replace(/\[x\]$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
};

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
