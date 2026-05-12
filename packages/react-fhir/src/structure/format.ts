import type {
  Address,
  CodeableConcept,
  Coding,
  Dosage,
  HumanName,
  Period,
  Quantity,
  Resource,
  Timing,
} from "fhir/r4";

/**
 * Pure string-formatters for FHIR datatypes. Used by the read-side renderers
 * (`renderers.tsx`) and by display label generators in interactive components
 * like `ReferencePicker`. Centralised here so the two surfaces stay in sync —
 * a name rendered in `<ResourceView>` and the same name shown as a picker
 * label come out identical.
 */

export function formatHumanName(n: HumanName | undefined): string {
  if (!n) return "";
  if (n.text) return n.text;
  return [
    n.prefix?.join(" "),
    n.given?.join(" "),
    n.family,
    n.suffix?.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function formatAddress(a: Address | undefined): string {
  if (!a) return "";
  if (a.text) return a.text;
  return [a.line?.join(", "), a.city, a.state, a.postalCode, a.country]
    .filter(Boolean)
    .join(", ");
}

export function formatCoding(c: Coding | undefined): string {
  if (!c) return "";
  if (c.display) return c.display;
  return c.code ?? "";
}

/**
 * Plain-string label for a CodeableConcept. Prefers `text`, then the first
 * coding's `display`, then the first coding's `code`. Returns "" when the
 * concept holds nothing meaningful. For UI rendering with system priority +
 * markup, see the `<CodeableConcept>` renderer in `renderers.tsx`.
 */
export function formatCodeableConcept(cc: CodeableConcept | undefined): string {
  if (!cc) return "";
  if (cc.text) return cc.text;
  const first = cc.coding?.[0];
  return formatCoding(first);
}

export function formatQuantity(q: Quantity | undefined): string {
  if (!q) return "";
  const comparator = q.comparator ?? "";
  const num = q.value === undefined ? "" : String(q.value);
  const unit = q.unit ?? q.code ?? "";
  return `${comparator}${num}${unit ? ` ${unit}` : ""}`.trim();
}

export function formatPeriod(p: Period | undefined): string {
  if (!p) return "";
  const start = p.start ?? "…";
  const end = p.end ?? "…";
  return `${start} → ${end}`;
}

const PERIOD_UNIT_LABELS: Record<string, string> = {
  s: "second",
  min: "minute",
  h: "hour",
  d: "day",
  wk: "week",
  mo: "month",
  a: "year",
};

/** v3-GTSAbbreviation timing codes that have a clean plain-English reading. */
const TIMING_ABBREVIATION_LABELS: Record<string, string> = {
  BID: "twice daily",
  TID: "three times daily",
  QID: "four times daily",
  AM: "in the morning",
  PM: "in the afternoon",
  QD: "once daily",
  QOD: "every other day",
  QHS: "at bedtime",
  Q1H: "every hour",
  Q2H: "every 2 hours",
  Q3H: "every 3 hours",
  Q4H: "every 4 hours",
  Q6H: "every 6 hours",
  Q8H: "every 8 hours",
  WK: "weekly",
  MO: "monthly",
};

const WHEN_LABELS: Record<string, string> = {
  MORN: "in the morning",
  AFT: "in the afternoon",
  EVE: "in the evening",
  NIGHT: "at night",
  HS: "at bedtime",
  WAKE: "on waking",
  C: "with meals",
  CM: "with breakfast",
  CD: "with lunch",
  CV: "with dinner",
  AC: "before meals",
  ACM: "before breakfast",
  ACD: "before lunch",
  ACV: "before dinner",
  PC: "after meals",
  PCM: "after breakfast",
  PCD: "after lunch",
  PCV: "after dinner",
};

function unitLabel(unit: string | undefined, count: number): string {
  if (!unit) return "";
  const base = PERIOD_UNIT_LABELS[unit] ?? unit;
  return count === 1 ? base : `${base}s`;
}

/**
 * Plain-English summary of a FHIR Timing — e.g. "twice daily", "every 8 hours",
 * "3 times per week in the morning". Prefers an explicit `Timing.code`
 * abbreviation, then falls back to building a phrase from `repeat`.
 */
const V3_GTS_ABBREVIATION_SYSTEM =
  "http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation";

function timingCadence(code: Timing["code"]): string {
  if (!code) return "";
  const v3 = code.coding?.find(
    (c) =>
      c.system === V3_GTS_ABBREVIATION_SYSTEM && c.code && TIMING_ABBREVIATION_LABELS[c.code],
  );
  if (v3) return TIMING_ABBREVIATION_LABELS[v3.code!]!;
  return code.text ?? code.coding?.find((c) => c.display)?.display ?? "";
}

export function formatTiming(t: Timing | undefined): string {
  if (!t) return "";
  const r = t.repeat;
  const parts: string[] = [];

  // A populated Timing.code is the complete schedule statement; only
  // repeat.bounds[x] is layered on top of it (per the FHIR spec).
  const codeCadence = timingCadence(t.code);
  if (codeCadence) {
    parts.push(codeCadence);
  } else if (r) {
    if (r.frequency != null || r.period != null) {
      const freq = r.frequency ?? 1;
      const period = r.period ?? 1;
      const freqStr = r.frequencyMax ? `${freq}–${r.frequencyMax}` : `${freq}`;
      const timesWord = freq === 1 && !r.frequencyMax ? "once" : `${freqStr} times`;
      const periodStr = r.periodMax ? `${period}–${r.periodMax}` : `${period}`;
      if (!r.periodUnit) {
        parts.push(timesWord);
      } else if (period === 1 && !r.periodMax) {
        parts.push(`${timesWord} per ${unitLabel(r.periodUnit, 1)}`);
      } else {
        parts.push(
          `${timesWord} every ${periodStr} ${unitLabel(r.periodUnit, r.periodMax ?? period)}`,
        );
      }
    }
    if (r.duration != null && r.durationUnit) {
      const durStr = r.durationMax ? `${r.duration}–${r.durationMax}` : `${r.duration}`;
      parts.push(`over ${durStr} ${unitLabel(r.durationUnit, r.durationMax ?? r.duration)}`);
    }
    if (r.when?.length) {
      parts.push(r.when.map((w) => WHEN_LABELS[w] ?? w).join(", "));
    }
    if (r.timeOfDay?.length) parts.push(`at ${r.timeOfDay.join(", ")}`);
    if (r.dayOfWeek?.length) parts.push(`on ${r.dayOfWeek.join(", ")}`);
    if (r.count != null || r.countMax != null) {
      const count = r.count ?? 1;
      const countStr = r.countMax ? `${count}–${r.countMax}` : `${count}`;
      const plural = (r.countMax ?? count) === 1 ? "" : "s";
      parts.push(`for ${countStr} dose${plural}`);
    }
  }
  if (r?.boundsPeriod) parts.push(formatPeriod(r.boundsPeriod));
  else if (r?.boundsRange) parts.push(`for ${formatRange(r.boundsRange)}`);
  else if (r?.boundsDuration) parts.push(`for ${formatQuantity(r.boundsDuration)}`);

  const phrase = parts.join(" ").trim();
  if (phrase) return phrase;
  if (t.event?.length) return t.event.join(", ");
  // Last resort: surface the raw code so coded-only timings aren't lost.
  return t.code?.coding?.find((c) => c.code)?.code ?? "";
}

function formatRange(r: { low?: Quantity; high?: Quantity } | undefined): string {
  if (!r) return "";
  const low = formatQuantity(r.low);
  const high = formatQuantity(r.high);
  if (low && high) return `${low}–${high}`;
  if (low) return `≥ ${low}`;
  if (high) return `≤ ${high}`;
  return "";
}

function formatDoseAndRate(dr: NonNullable<Dosage["doseAndRate"]>[number]): string {
  if (dr.doseQuantity) return formatQuantity(dr.doseQuantity);
  if (dr.doseRange) return formatRange(dr.doseRange);
  return "";
}

/**
 * One-line plain-English summary of a FHIR Dosage. Prefers the authored
 * `text`; otherwise assembles dose + route + schedule + as-needed.
 */
export function formatDosage(d: Dosage | undefined): string {
  if (!d) return "";
  if (d.text) return d.text;
  const parts: string[] = [];
  const dose = d.doseAndRate?.map(formatDoseAndRate).filter(Boolean).join(", ");
  if (dose) parts.push(dose);
  const route = formatCodeableConcept(d.route);
  if (route) parts.push(route);
  const timing = formatTiming(d.timing);
  if (timing) parts.push(timing);
  let summary = parts.join(" ").trim();
  if (d.asNeededBoolean) summary = summary ? `${summary}, as needed` : "as needed";
  else if (d.asNeededCodeableConcept) {
    const why = formatCodeableConcept(d.asNeededCodeableConcept);
    summary = `${summary ? `${summary}, ` : ""}as needed${why ? ` for ${why}` : ""}`;
  }
  return summary;
}

/**
 * Human-readable label for a resource, used by `ReferencePicker` when picking
 * a target. Walks the common label-bearing fields in priority order and
 * falls back to `{ResourceType}/{id}` for resources without a recognised
 * label field.
 */
export function formatReferenceLabel(resource: Resource): string {
  const r = resource as unknown as Record<string, unknown>;
  // HumanName-bearing resources (Patient, Practitioner, RelatedPerson, …)
  const names = r.name as Array<HumanName> | string | undefined;
  if (Array.isArray(names) && names[0]) {
    const formatted = formatHumanName(names[0]);
    if (formatted) return formatted;
  }
  // Organization / Location / Device / etc — single string `name`
  if (typeof names === "string") return names;
  // CodeableConcept-based, e.g. Observation.code
  const code = r.code as CodeableConcept | undefined;
  const ccText = formatCodeableConcept(code);
  if (ccText) return ccText;
  // Practitioner / others sometimes use `title`
  if (typeof r.title === "string") return r.title;
  return `${resource.resourceType}/${resource.id ?? ""}`.replace(/\/$/, "");
}
