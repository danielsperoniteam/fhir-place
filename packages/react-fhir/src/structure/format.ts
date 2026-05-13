import type {
  Address,
  CodeableConcept,
  Coding,
  HumanName,
  Period,
  Quantity,
  Resource,
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

// Build a local-time Date for the given Y-M-D without the `new Date(yy, …)`
// 0–99 → 1900–1999 century remap (FHIR permits years 0001 through 9999).
function localDate(y: number, mo: number, day: number): Date {
  const d = new Date(2000, 0, 1);
  d.setFullYear(y, mo - 1, day);
  return d;
}

// True when `Y-M-D` denotes a real calendar day inside the FHIR-permitted
// year range (0001-9999). `new Date` rolls overflow parts forward
// (2021-02-31 → Mar 3) and accepts year 0, so reject anything that doesn't
// round-trip or that falls outside the spec range.
function isRealCalendarDay(y: number, mo: number, day: number): boolean {
  if (y < 1 || y > 9999) return false;
  const d = localDate(y, mo, day);
  return d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day;
}

// FHIR `dateTime` / `instant` with a time component:
//   YYYY-MM-DDThh:mm[:ss[.sss]][Z|±hh:mm]
// Timezone offset matches the FHIR R4 spec: hours 00-13 with minutes 00-59,
// or exactly 14:00 (https://hl7.org/fhir/R4/datatypes.html#dateTime).
const FHIR_DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))?$/;

/**
 * Human-readable rendering of a FHIR `date` / `dateTime` / `instant` value.
 *
 * - Year and year-month partial dates are returned verbatim — there's no day
 *   to spell out, and `new Date()` would invent one.
 * - `YYYY-MM-DD` becomes e.g. `Sep 7, 2019`.
 * - Values with a time component become e.g. `Sep 7, 2019, 5:39 PM`, rendered
 *   in the runtime's local time zone.
 * - Malformed or out-of-range values (e.g. `2021-02-31`) fall back to the
 *   original string rather than being normalised to a different instant.
 */
export function formatDateTime(value: string | undefined): string {
  if (!value) return "";
  if (/^\d{4}(-\d{2})?$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, mo, day] = value.split("-").map(Number) as [number, number, number];
    if (!isRealCalendarDay(y, mo, day)) return value;
    return localDate(y, mo, day).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  const m = FHIR_DATE_TIME_RE.exec(value);
  if (!m) return value;
  const [, ys, mos, ds, hs, mins, ss] = m as unknown as string[];
  const y = Number(ys);
  const mo = Number(mos);
  const day = Number(ds);
  const hour = Number(hs);
  const minute = Number(mins);
  const sec = ss === undefined ? 0 : Number(ss);
  // `new Date` would roll these forward too; validate before trusting it.
  if (!isRealCalendarDay(y, mo, day) || hour > 23 || minute > 59 || sec > 60) {
    return value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function formatPeriod(p: Period | undefined): string {
  if (!p) return "";
  const start = p.start ? formatDateTime(p.start) : "…";
  const end = p.end ? formatDateTime(p.end) : "…";
  return `${start} → ${end}`;
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
