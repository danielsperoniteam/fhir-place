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

/**
 * Human-readable rendering of a FHIR `date` / `dateTime` / `instant` value.
 *
 * - Year and year-month partial dates are returned verbatim — there's no day
 *   to spell out, and `new Date()` would invent one.
 * - `YYYY-MM-DD` becomes e.g. `Sep 7, 2019`.
 * - Values with a time component become e.g. `Sep 7, 2019, 5:39 PM`, rendered
 *   in the runtime's local time zone.
 * - Anything unparseable falls back to the original string.
 */
export function formatDateTime(value: string | undefined): string {
  if (!value) return "";
  if (/^\d{4}(-\d{2})?$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, mo, day] = value.split("-").map(Number) as [number, number, number];
    const d = new Date(y, mo - 1, day);
    // `new Date` silently rolls over out-of-range parts (2021-02-31 → Mar 3),
    // so a malformed date would otherwise render as a different day. Only
    // format when the components round-trip; otherwise keep the raw string.
    const roundTrips =
      d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === day;
    return roundTrips
      ? d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : value;
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
