import type {
  Address,
  Annotation,
  Attachment,
  CodeableConcept,
  Coding,
  ContactPoint,
  HumanName,
  Identifier,
  Meta,
  Money,
  Period,
  Quantity,
  Range,
  Ratio,
  Reference,
  Resource,
} from "fhir/r4";
import type { ReactNode } from "react";
import { Fragment } from "react";
import {
  formatAddress,
  formatHumanName,
  formatReferenceLabel,
} from "../structure/format.js";
import { useReadReference } from "../hooks/queries.js";
import { CodedValue } from "./codedValue/index.js";

/** Context passed to every renderer. */
export interface RendererContext {
  /** Full FHIR path of the element being rendered (e.g. "Patient.name"). */
  path: string;
  /** Primary type code from the StructureDefinition. */
  typeCode: string | undefined;
  /** Callback to resolve a Reference into a link. Defaults to plain text. */
  onReferenceClick?: (ref: Reference) => void;
  /**
   * Optional opt-in tone for `Coding` / `CodeableConcept` values rendered
   * inside this context. Callers (e.g. a per-resource override map) attach
   * this explicitly — the default renderers never derive tone from values.
   */
  tone?: "success" | "warn" | "danger";
}

export type FhirTypeRenderer = (
  value: unknown,
  context: RendererContext,
) => ReactNode;

export type TypeRenderers = Record<string, FhirTypeRenderer>;

/* ---------- primitives ---------- */

const Primitive: FhirTypeRenderer = (value) => <span>{String(value)}</span>;
const Boolean_: FhirTypeRenderer = (value) => (
  <span className="font-mono">{value ? "true" : "false"}</span>
);
const Date_: FhirTypeRenderer = (value) => (
  <time dateTime={String(value)}>{String(value)}</time>
);
const DateTime_: FhirTypeRenderer = (value) => {
  const s = String(value);
  let formatted = s;
  try {
    formatted = new Date(s).toLocaleString();
  } catch {
    // keep raw
  }
  return <time dateTime={s}>{formatted}</time>;
};
const Code_: FhirTypeRenderer = (value) => (
  <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{String(value)}</code>
);
const Uri_: FhirTypeRenderer = (value) => {
  const s = String(value);
  if (/^https?:\/\//i.test(s)) {
    return (
      <a className="text-blue-700 underline" href={s} target="_blank" rel="noreferrer">
        {s}
      </a>
    );
  }
  return <span className="break-all">{s}</span>;
};

/* ---------- complex datatypes ---------- */

const HumanNameRenderer: FhirTypeRenderer = (value) => {
  const n = value as HumanName;
  const formatted = formatHumanName(n);
  const useLabel = n.use ? ` (${n.use})` : "";
  return (
    <span>
      {formatted}
      {useLabel && <span className="text-slate-400">{useLabel}</span>}
    </span>
  );
};

const AddressRenderer: FhirTypeRenderer = (value) => {
  const a = value as Address;
  const label = a.use ? `${a.use} ` : "";
  return (
    <span>
      {label && <span className="text-slate-400">{label}</span>}
      {formatAddress(a)}
    </span>
  );
};

const ContactPointRenderer: FhirTypeRenderer = (value) => {
  const c = value as ContactPoint;
  if (!c.value) return <span className="text-slate-400">—</span>;
  const sys = c.system ? `${c.system}: ` : "";
  const use = c.use ? ` (${c.use})` : "";
  if (c.system === "email") {
    return (
      <span>
        <span className="text-slate-400">{sys}</span>
        <a className="text-blue-700 underline" href={`mailto:${c.value}`}>
          {c.value}
        </a>
        <span className="text-slate-400">{use}</span>
      </span>
    );
  }
  if (c.system === "phone" || c.system === "fax") {
    return (
      <span>
        <span className="text-slate-400">{sys}</span>
        <a className="text-blue-700 underline" href={`tel:${c.value}`}>
          {c.value}
        </a>
        <span className="text-slate-400">{use}</span>
      </span>
    );
  }
  return (
    <span>
      <span className="text-slate-400">{sys}</span>
      {c.value}
      <span className="text-slate-400">{use}</span>
    </span>
  );
};

const KNOWN_CODE_SYSTEM_LABELS: Record<string, string> = {
  "http://snomed.info/sct": "SNOMED",
  "http://loinc.org": "LOINC",
  "http://hl7.org/fhir/sid/icd-10": "ICD-10",
  "http://hl7.org/fhir/sid/icd-10-cm": "ICD-10-CM",
  "http://hl7.org/fhir/sid/icd-9-cm": "ICD-9-CM",
  "http://www.cms.gov/Medicare/Coding/ICD10": "ICD-10-PCS",
  "http://www.ama-assn.org/go/cpt": "CPT",
  "http://www.nlm.nih.gov/research/umls/rxnorm": "RxNorm",
  "http://hl7.org/fhir/sid/ndc": "NDC",
  "http://hl7.org/fhir/sid/cvx": "CVX",
  "http://unitsofmeasure.org": "UCUM",
};

/**
 * Short, human-friendly label for a FHIR code-system URI.
 * Falls back to the last path segment of the URL when unknown.
 */
export function codeSystemLabel(system: string | undefined): string {
  if (!system) return "";
  if (KNOWN_CODE_SYSTEM_LABELS[system]) return KNOWN_CODE_SYSTEM_LABELS[system]!;
  // Heuristic: last non-empty segment capitalised.
  return system.split(/[#/]/).filter(Boolean).pop() ?? system;
}

/**
 * Priority-ordered system URIs used to pick the "best" coding out of a
 * CodeableConcept when `.text` is empty. Keyed by full FHIR element path so
 * Condition.code prefers ICD-10, Procedure.code prefers CPT, Observation.code
 * prefers LOINC, etc.
 *
 * Consumers can override by passing a custom renderer via the `renderers`
 * prop on `<ResourceView>` / `<ResourceTable>`.
 */
export const DEFAULT_CODING_PRIORITY: Record<string, readonly string[]> = {
  "Condition.code": [
    "http://hl7.org/fhir/sid/icd-10-cm",
    "http://hl7.org/fhir/sid/icd-10",
    "http://snomed.info/sct",
    "http://loinc.org",
  ],
  "Procedure.code": [
    "http://www.ama-assn.org/go/cpt",
    "http://www.cms.gov/Medicare/Coding/ICD10",
    "http://snomed.info/sct",
  ],
  "Observation.code": [
    "http://loinc.org",
    "http://snomed.info/sct",
  ],
  "MedicationRequest.medicationCodeableConcept": [
    "http://www.nlm.nih.gov/research/umls/rxnorm",
    "http://hl7.org/fhir/sid/ndc",
    "http://snomed.info/sct",
  ],
  "Medication.code": [
    "http://www.nlm.nih.gov/research/umls/rxnorm",
    "http://hl7.org/fhir/sid/ndc",
    "http://snomed.info/sct",
  ],
  "AllergyIntolerance.code": [
    "http://www.nlm.nih.gov/research/umls/rxnorm",
    "http://snomed.info/sct",
  ],
  "Immunization.vaccineCode": [
    "http://hl7.org/fhir/sid/cvx",
    "http://www.nlm.nih.gov/research/umls/rxnorm",
    "http://snomed.info/sct",
  ],
};

const FALLBACK_CODING_PRIORITY: readonly string[] = [
  "http://snomed.info/sct",
  "http://loinc.org",
];

export function preferredCoding(
  cc: CodeableConcept | undefined,
  path: string,
): Coding | undefined {
  if (!cc?.coding?.length) return undefined;
  const priority = DEFAULT_CODING_PRIORITY[path] ?? FALLBACK_CODING_PRIORITY;
  for (const system of priority) {
    const hit = cc.coding.find((c) => c.system === system);
    if (hit) return hit;
  }
  return cc.coding[0];
}

const CodingRenderer: FhirTypeRenderer = (value, ctx) => {
  const c = value as Coding;
  return <CodedValue value={c} tone={ctx.tone} />;
};

const CodeableConceptRenderer: FhirTypeRenderer = (value, ctx) => {
  const cc = value as CodeableConcept;
  if (!cc.text && !cc.coding?.length) {
    return <span className="text-slate-400">—</span>;
  }
  return <CodedValue value={cc} tone={ctx.tone} />;
};

const QuantityRenderer: FhirTypeRenderer = (value) => {
  const q = value as Quantity;
  const comparator = q.comparator ?? "";
  const unit = q.unit ?? q.code ?? "";
  return (
    <span>
      {comparator}
      {q.value ?? ""}{" "}
      <span className="text-slate-500">{unit}</span>
    </span>
  );
};

const RangeRenderer: FhirTypeRenderer = (value, ctx) => {
  const r = value as Range;
  return (
    <span>
      {r.low ? QuantityRenderer(r.low, ctx) : <span className="text-slate-400">—</span>}
      <span className="mx-1 text-slate-400">to</span>
      {r.high ? QuantityRenderer(r.high, ctx) : <span className="text-slate-400">—</span>}
    </span>
  );
};

const RatioRenderer: FhirTypeRenderer = (value, ctx) => {
  const r = value as Ratio;
  return (
    <span>
      {r.numerator ? QuantityRenderer(r.numerator, ctx) : "?"}
      <span className="mx-1 text-slate-400">/</span>
      {r.denominator ? QuantityRenderer(r.denominator, ctx) : "?"}
    </span>
  );
};

const MoneyRenderer: FhirTypeRenderer = (value) => {
  const m = value as Money;
  return (
    <span>
      {m.value ?? ""} <span className="text-slate-500">{m.currency ?? ""}</span>
    </span>
  );
};

const PeriodRenderer: FhirTypeRenderer = (value) => {
  const p = value as Period;
  return (
    <span>
      <time>{p.start ?? "…"}</time>
      <span className="mx-1 text-slate-400">→</span>
      <time>{p.end ?? "…"}</time>
    </span>
  );
};

const IdentifierRenderer: FhirTypeRenderer = (value) => {
  const i = value as Identifier;
  const sys = i.system ? <span className="text-slate-400">{i.system} </span> : null;
  return (
    <span>
      {sys}
      <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{i.value}</code>
      {i.use && <span className="ml-1 text-slate-400">({i.use})</span>}
    </span>
  );
};

function ReferenceCellLink({
  reference,
  onClick,
}: {
  reference: Reference;
  onClick: (ref: Reference) => void;
}) {
  const { data } = useReadReference<Resource>(reference, { staleTime: 5 * 60_000 });
  const label = data
    ? formatReferenceLabel(data)
    : (reference.display ?? reference.reference ?? "—");
  return (
    <button
      type="button"
      className="text-blue-700 underline"
      onClick={() => onClick(reference)}
    >
      {label}
    </button>
  );
}

const ReferenceRenderer: FhirTypeRenderer = (value, ctx) => {
  const r = value as Reference;
  if (ctx.onReferenceClick && r.reference) {
    return <ReferenceCellLink reference={r} onClick={ctx.onReferenceClick} />;
  }
  const label = r.display ?? r.reference ?? "—";
  return <span>{label}</span>;
};

const AttachmentRenderer: FhirTypeRenderer = (value) => {
  const a = value as Attachment;
  const label = a.title ?? a.url ?? a.contentType ?? "attachment";
  if (a.url) {
    return (
      <a className="text-blue-700 underline" href={a.url} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }
  return <span>{label}</span>;
};

const MetaRenderer: FhirTypeRenderer = (value, ctx) => {
  const m = value as Meta;
  const summaryParts = [
    m.versionId && `v${m.versionId}`,
    m.lastUpdated,
    m.source,
  ].filter(Boolean);
  const fields: { label: string; node: ReactNode }[] = [];
  if (m.versionId) {
    fields.push({ label: "Version Id", node: <span>{m.versionId}</span> });
  }
  if (m.lastUpdated) {
    fields.push({
      label: "Last Updated",
      node: <time dateTime={m.lastUpdated}>{m.lastUpdated}</time>,
    });
  }
  if (m.source) {
    fields.push({ label: "Source", node: <span className="break-all">{m.source}</span> });
  }
  if (m.profile?.length) {
    fields.push({
      label: "Profile",
      node: (
        <ul className="space-y-1">
          {m.profile.map((p, i) => (
            <li key={`${p}-${i}`} className="break-all">
              {Uri_(p, ctx)}
            </li>
          ))}
        </ul>
      ),
    });
  }
  if (m.security?.length) {
    fields.push({
      label: "Security",
      node: (
        <ul className="space-y-1">
          {m.security.map((c, i) => (
            <li key={`${c.system ?? ""}#${c.code ?? ""}#${i}`}>{CodingRenderer(c, ctx)}</li>
          ))}
        </ul>
      ),
    });
  }
  if (m.tag?.length) {
    fields.push({
      label: "Tag",
      node: (
        <ul className="space-y-1">
          {m.tag.map((c, i) => (
            <li key={`${c.system ?? ""}#${c.code ?? ""}#${i}`}>{CodingRenderer(c, ctx)}</li>
          ))}
        </ul>
      ),
    });
  }

  if (fields.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <details className="group">
      <summary className="cursor-pointer text-slate-600 marker:text-slate-400">
        {summaryParts.join(" · ")}
      </summary>
      <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 border-l-2 border-slate-200 pl-3 sm:grid-cols-[minmax(6rem,1fr)_3fr]">
        {fields.map((f) => (
          <Fragment key={f.label}>
            <dt className="text-xs font-medium text-slate-500">{f.label}</dt>
            <dd className="text-sm">{f.node}</dd>
          </Fragment>
        ))}
      </dl>
    </details>
  );
};

const AnnotationRenderer: FhirTypeRenderer = (value) => {
  const a = value as Annotation;
  return (
    <div>
      {a.authorString && (
        <span className="text-slate-400">{a.authorString}: </span>
      )}
      <span>{a.text}</span>
      {a.time && <span className="ml-2 text-slate-400">({a.time})</span>}
    </div>
  );
};

export const defaultTypeRenderers: TypeRenderers = {
  // primitives
  string: Primitive,
  boolean: Boolean_,
  integer: Primitive,
  decimal: Primitive,
  positiveInt: Primitive,
  unsignedInt: Primitive,
  date: Date_,
  dateTime: DateTime_,
  instant: DateTime_,
  time: Primitive,
  code: Code_,
  id: Code_,
  oid: Primitive,
  uuid: Primitive,
  canonical: Uri_,
  uri: Uri_,
  url: Uri_,
  markdown: Primitive,
  base64Binary: Primitive,

  // complex datatypes
  HumanName: HumanNameRenderer,
  Address: AddressRenderer,
  ContactPoint: ContactPointRenderer,
  Coding: CodingRenderer,
  CodeableConcept: CodeableConceptRenderer,
  Quantity: QuantityRenderer,
  SimpleQuantity: QuantityRenderer,
  Range: RangeRenderer,
  Ratio: RatioRenderer,
  Money: MoneyRenderer,
  Period: PeriodRenderer,
  Identifier: IdentifierRenderer,
  Reference: ReferenceRenderer,
  Attachment: AttachmentRenderer,
  Annotation: AnnotationRenderer,
  Meta: MetaRenderer,
};
