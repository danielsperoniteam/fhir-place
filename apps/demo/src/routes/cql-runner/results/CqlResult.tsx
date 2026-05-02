import type { Resource } from "fhir/r4";
import { ResourceTable } from "@fhir-place/react-fhir";
import { inferShape, type CqlResultShape } from "./shape.js";

export interface CqlResultProps {
  name: string;
  value: unknown;
}

/**
 * Result renderer dispatcher. The wedge for the CQL runner is *good*
 * rendering of CQL results — picking the right view per shape so users
 * stop staring at JSON. Add new shapes here, not in caller components.
 */
export function CqlResult({ name, value }: CqlResultProps) {
  const shape = inferShape(value);
  return (
    <section
      className="space-y-2 rounded border border-slate-200 bg-white p-3"
      data-testid={`cql-result-${name}`}
      data-shape={shape}
    >
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{name}</h3>
        <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
          {shape}
        </span>
      </header>
      <Body value={value} shape={shape} />
    </section>
  );
}

function Body({ value, shape }: { value: unknown; shape: CqlResultShape }) {
  switch (shape) {
    case "null":
      return <p className="text-sm text-slate-500">null</p>;
    case "boolean":
      return <BooleanBadge value={value as boolean} />;
    case "number":
    case "string":
      return <p className="text-sm">{String(value)}</p>;
    case "date":
    case "datetime":
      return <p className="text-sm font-mono">{formatDateLike(value)}</p>;
    case "code":
      return <CodeView value={value as Record<string, unknown>} />;
    case "concept":
      return <ConceptView value={value as { coding: unknown[]; text?: string }} />;
    case "quantity":
      return <QuantityView value={value as { value: number; unit?: string }} />;
    case "interval":
      return <IntervalView value={value as Record<string, unknown>} />;
    case "tuple":
      return <TupleView value={value as Record<string, unknown>} />;
    case "list-empty":
      return <p className="text-sm text-slate-500">(empty list)</p>;
    case "list-resource":
      return <ResourceListView value={value as Resource[]} />;
    case "list-tuple":
      return <TupleListView value={value as Array<Record<string, unknown>>} />;
    case "list-primitive":
      return <PrimitiveListView value={value as unknown[]} />;
    case "resource":
      return <ResourceListView value={[value as Resource]} />;
    default:
      return (
        <div>
          <p className="text-xs text-slate-500">No nice view yet — falling back to JSON.</p>
          <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs">
            {safeJson(value)}
          </pre>
        </div>
      );
  }
}

function BooleanBadge({ value }: { value: boolean }) {
  return (
    <span
      className={`inline-block rounded px-3 py-1 text-sm font-semibold ${
        value
          ? "bg-emerald-100 text-emerald-900"
          : "bg-rose-100 text-rose-900"
      }`}
    >
      {value ? "PASS" : "FAIL"}
    </span>
  );
}

function CodeView({ value }: { value: Record<string, unknown> }) {
  return (
    <p className="text-sm font-mono">
      {String(value.code)}
      {value.system ? (
        <span className="text-xs text-slate-500"> ({String(value.system)})</span>
      ) : null}
    </p>
  );
}

function ConceptView({ value }: { value: { coding: unknown[]; text?: string } }) {
  const first = (value.coding[0] ?? {}) as Record<string, unknown>;
  return (
    <div className="text-sm">
      {value.text && <p>{String(value.text)}</p>}
      <p className="font-mono text-xs text-slate-500">
        {String(first.code ?? "")}
        {first.system ? ` (${String(first.system)})` : ""}
      </p>
    </div>
  );
}

function QuantityView({ value }: { value: { value: number; unit?: string } }) {
  return (
    <p className="text-sm">
      {value.value}
      {value.unit ? <span className="ml-1 text-slate-500">{value.unit}</span> : null}
    </p>
  );
}

function IntervalView({ value }: { value: Record<string, unknown> }) {
  return (
    <p className="text-sm font-mono">
      [{formatDateLike(value.low) ?? "…"}, {formatDateLike(value.high) ?? "…"}]
    </p>
  );
}

function TupleView({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([k]) => !k.startsWith("_"));
  if (entries.length === 0) return <p className="text-sm text-slate-500">(empty tuple)</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="border-t border-slate-100">
            <td className="py-1 pr-4 font-medium text-slate-700">{k}</td>
            <td className="py-1 font-mono text-xs">{formatScalar(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResourceListView({ value }: { value: Resource[] }) {
  // `cql-execution` returns FHIRObject wrappers, not plain JSON; dig out the
  // underlying resource if present so the existing ResourceTable can render.
  const resources = value.map(unwrapFhirObject).filter((r): r is Resource => !!r);
  if (resources.length === 0) return <p className="text-sm text-slate-500">(empty)</p>;
  const type = resources[0]!.resourceType;
  const columns = defaultColumnsFor(type);
  return (
    <div className="overflow-x-auto">
      <ResourceTable resources={resources} columns={columns} />
    </div>
  );
}

function TupleListView({ value }: { value: Array<Record<string, unknown>> }) {
  const columns = Array.from(
    new Set(value.flatMap((row) => Object.keys(row).filter((k) => !k.startsWith("_")))),
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {columns.map((c) => (
              <th key={c} className="py-1 pr-4">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {value.map((row, i) => (
            <tr key={i} className="border-t border-slate-100">
              {columns.map((c) => (
                <td key={c} className="py-1 pr-4 font-mono text-xs">
                  {formatScalar(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrimitiveListView({ value }: { value: unknown[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {value.map((v, i) => (
          <tr key={i} className="border-t border-slate-100">
            <td className="py-1 font-mono text-xs">{formatScalar(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const formatDateLike = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.year === "number") {
      const y = String(o.year).padStart(4, "0");
      const m = typeof o.month === "number" ? String(o.month).padStart(2, "0") : "01";
      const d = typeof o.day === "number" ? String(o.day).padStart(2, "0") : "01";
      return `${y}-${m}-${d}`;
    }
  }
  return null;
};

const formatScalar = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return safeJson(v);
};

const safeJson = (v: unknown): string => {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrapFhirObject = (v: any): Resource | null => {
  if (!v) return null;
  if (typeof v === "object" && typeof v.resourceType === "string") return v as Resource;
  // cql-exec-fhir wraps each FHIR resource in a FHIRObject; the original JSON
  // hangs off `_json`. Both shapes appear in real outputs depending on whether
  // the CQL projects (`return X.foo`) or returns the raw retrieve.
  if (typeof v === "object" && v._json && typeof v._json.resourceType === "string") {
    return v._json as Resource;
  }
  return null;
};

const COLUMN_DEFAULTS: Record<string, string[]> = {
  Patient: ["name", "gender", "birthDate"],
  Observation: ["status", "code.text", "valueQuantity", "effectiveDateTime"],
  Condition: ["code.text", "clinicalStatus", "onsetDateTime"],
  Encounter: ["status", "type", "period.start"],
  MedicationRequest: ["status", "medicationCodeableConcept.text", "authoredOn"],
};

const defaultColumnsFor = (type: string): string[] =>
  COLUMN_DEFAULTS[type] ?? ["id"];
