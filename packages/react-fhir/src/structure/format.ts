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
import { ucumDisplay } from "./ucumDisplay.js";

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

/**
 * A Quantity's `code` may only be read as UCUM when `system` says so (or is
 * absent — UCUM is FHIR's implicit default for unit codes). A site-specific
 * system scopes its own codes; decoding those as UCUM would misrender them.
 */
export const isUcumQuantity = (q: Quantity): boolean =>
  !q.system || q.system === "http://unitsofmeasure.org";

export function formatQuantity(q: Quantity | undefined): string {
  if (!q) return "";
  const comparator = q.comparator ?? "";
  const num = q.value === undefined ? "" : String(q.value);
  // Prefer the human display unit; fall back to a decoded UCUM code
  // ("10*9/L" → "10⁹/L") rather than the raw symbol (#368). Non-UCUM
  // systems keep their raw code.
  const unit = q.unit ?? (isUcumQuantity(q) ? ucumDisplay(q.code) : q.code ?? "");
  return `${comparator}${num}${unit ? ` ${unit}` : ""}`.trim();
}

/**
 * Detected precision of a FHIR `date` / `dateTime` literal. Per the spec
 * (https://hl7.org/fhir/datatypes.html#dateTime) the value can be a bare
 * year, year-month, full date, or a full timestamp with a timezone offset.
 * `toLocaleString` would otherwise hallucinate `Jan 1 12:00 AM` for partial
 * values; the renderer needs to know the precision to stop early.
 */
type DateTimePrecision = "year" | "month" | "day" | "time";

function detectPrecision(s: string): DateTimePrecision | undefined {
  if (/^\d{4}$/.test(s)) return "year";
  if (/^\d{4}-\d{2}$/.test(s)) return "month";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return "day";
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return "time";
  return undefined;
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Human-readable rendering of a FHIR `date` / `dateTime` value. UTC-pinned
 * so output is deterministic across the dev / CI / clinician browsers (no
 * "9 PM here is 4 PM there" surprise). Falls back to the raw value when the
 * input isn't a recognised partial-precision FHIR temporal literal — better
 * to show the truth than to invent a date.
 *
 *   "2018"                          → "2018"
 *   "2018-08"                       → "Aug 2018"
 *   "2018-08-30"                    → "Aug 30, 2018"
 *   "2018-08-30T21:24:36+00:00"     → "Aug 30, 2018, 9:24 PM"
 */
export function formatDateTime(value: string | undefined): string {
  if (!value) return "";
  const precision = detectPrecision(value);
  if (!precision) return value;
  if (precision === "year") return value;
  if (precision === "month") {
    const m = Number(value.slice(5, 7));
    if (m < 1 || m > 12) return value;
    return `${MONTH_ABBR[m - 1]} ${value.slice(0, 4)}`;
  }
  // Day-only and full timestamp both want month/day/year; the timestamp
  // additionally wants a wall-clock time. Parse via Date and read back in
  // UTC so the rendering is independent of the runtime timezone.
  const d = new Date(precision === "day" ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  const month = MONTH_ABBR[d.getUTCMonth()]!;
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  if (precision === "day") return `${month} ${day}, ${year}`;
  const h24 = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${month} ${day}, ${year}, ${h12}:${minutes} ${period}`;
}

function sameUtcDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

/** Wall-clock time only — used to collapse same-day Period renderings. */
function formatTimeOnly(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const h24 = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${minutes} ${period}`;
}

/**
 * Plain-string label for a FHIR Period. Humanises both ends via
 * `formatDateTime` and collapses to a single date when start and end share
 * the same UTC calendar day with full-time precision
 * (e.g. `Aug 30, 2018, 9:24 PM → 9:41 PM` instead of repeating the date).
 */
export function formatPeriod(p: Period | undefined): string {
  if (!p) return "";
  const start = p.start ? formatDateTime(p.start) : "…";
  const end = p.end ? formatDateTime(p.end) : "…";
  if (
    p.start &&
    p.end &&
    detectPrecision(p.start) === "time" &&
    detectPrecision(p.end) === "time" &&
    sameUtcDay(p.start, p.end)
  ) {
    return `${start} → ${formatTimeOnly(p.end)}`;
  }
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
      const whenPhrase = r.when.map((w) => WHEN_LABELS[w] ?? w).join(", ");
      if (r.offset) {
        const mins = `${r.offset} minute${r.offset === 1 ? "" : "s"}`;
        // AC*/PC* event codes already encode before/after; for neutral codes
        // FHIR defaults the offset to "after", shown here as "(+N minutes)".
        const directional = r.when.every((w) => /^(AC|PC)/.test(w));
        parts.push(directional ? `${mins} ${whenPhrase}` : `${whenPhrase} (+${mins})`);
      } else {
        parts.push(whenPhrase);
      }
    }
    if (r.timeOfDay?.length) parts.push(`at ${r.timeOfDay.join(", ")}`);
    if (r.dayOfWeek?.length) parts.push(`on ${r.dayOfWeek.join(", ")}`);
    if (r.count != null || r.countMax != null) {
      const count = r.count ?? 1;
      const countStr = r.countMax ? `${count}–${r.countMax}` : `${count}`;
      const plural = (r.countMax ?? count) === 1 ? "" : "s";
      parts.push(`for ${countStr} occurrence${plural}`);
    }
  }
  if (r?.boundsPeriod) parts.push(formatPeriod(r.boundsPeriod));
  else if (r?.boundsRange) parts.push(`for ${formatRange(r.boundsRange)}`);
  else if (r?.boundsDuration) parts.push(`for ${formatQuantity(r.boundsDuration)}`);
  if (t.event?.length) {
    const events = t.event.join(", ");
    parts.push(parts.length ? `(at ${events})` : events);
  }

  const phrase = parts.join(" ").trim();
  if (phrase) return phrase;
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

function formatRatio(r: { numerator?: Quantity; denominator?: Quantity } | undefined): string {
  if (!r) return "";
  const num = formatQuantity(r.numerator);
  const denom = formatQuantity(r.denominator);
  if (num && denom) return `${num} / ${denom}`;
  return num || denom;
}

function formatDoseAndRate(dr: NonNullable<Dosage["doseAndRate"]>[number]): string {
  if (dr.doseQuantity) return formatQuantity(dr.doseQuantity);
  if (dr.doseRange) return formatRange(dr.doseRange);
  if (dr.rateQuantity) return formatQuantity(dr.rateQuantity);
  if (dr.rateRatio) return formatRatio(dr.rateRatio);
  if (dr.rateRange) return formatRange(dr.rateRange);
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
