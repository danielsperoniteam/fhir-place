import { Link } from "react-router-dom";
import {
  parseResourceReference,
  type ResourceReference,
} from "./answer-schema.js";

const TYPE_TONE: Record<string, string> = {
  Patient: "bg-slate-100 text-slate-800",
  Condition: "bg-amber-100 text-amber-900",
  MedicationRequest: "bg-sky-100 text-sky-900",
  AllergyIntolerance: "bg-rose-100 text-rose-900",
  Encounter: "bg-violet-100 text-violet-900",
  Observation: "bg-emerald-100 text-emerald-900",
};

export function EvidenceChip({
  reference,
  href,
}: {
  reference: ResourceReference;
  /** Resource viewer URL; if omitted, the chip is non-clickable. */
  href?: string;
}) {
  const parsed = parseResourceReference(reference.reference);
  const tone = parsed
    ? (TYPE_TONE[parsed.resourceType] ?? "bg-slate-100 text-slate-700")
    : "bg-slate-100 text-slate-700";

  const inner = (
    <span
      data-testid="evidence-chip"
      data-resource-type={parsed?.resourceType ?? "unknown"}
      data-reference={reference.reference}
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
      title={reference.display ?? reference.reference}
    >
      <span className="truncate">
        {reference.display ?? reference.reference}
      </span>
      <code className="ml-1 shrink-0 rounded bg-white/60 px-1 py-px font-mono text-[10px] text-slate-700">
        {reference.reference}
      </code>
    </span>
  );

  if (!href) return inner;
  return (
    <Link to={href} className="inline-flex max-w-full hover:opacity-90">
      {inner}
    </Link>
  );
}
