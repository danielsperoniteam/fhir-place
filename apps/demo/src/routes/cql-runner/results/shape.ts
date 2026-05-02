/**
 * Lightweight shape inference over a CQL evaluation result so <CqlResult>
 * can pick a renderer. CQL values can be primitives, arrays, plain objects
 * (Tuples), Intervals, Code/Concept, or FHIR resources — and `cql-execution`
 * returns a mix of class instances and plain objects, so duck-type rather
 * than `instanceof`-test.
 */

export type CqlResultShape =
  | "boolean"
  | "number"
  | "string"
  | "date"
  | "datetime"
  | "code"
  | "concept"
  | "quantity"
  | "interval"
  | "tuple"
  | "list-resource"
  | "list-tuple"
  | "list-primitive"
  | "list-empty"
  | "resource"
  | "null"
  | "unknown";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const isFhirResource = (v: unknown): boolean =>
  isPlainObject(v) && typeof v.resourceType === "string";

const isInterval = (v: unknown): boolean =>
  isPlainObject(v) &&
  ("low" in v || "high" in v) &&
  // Intervals from cql-execution carry a `lowClosed`/`highClosed` flag.
  ("lowClosed" in v || "highClosed" in v || ("low" in v && "high" in v));

const isCode = (v: unknown): boolean =>
  isPlainObject(v) && typeof v.code === "string" && "system" in v && !("coding" in v);

const isConcept = (v: unknown): boolean =>
  isPlainObject(v) && Array.isArray(v.coding);

const isQuantity = (v: unknown): boolean =>
  isPlainObject(v) && "value" in v && "unit" in v && typeof v.value === "number";

const isCqlDate = (v: unknown): boolean =>
  isPlainObject(v) &&
  v.isDate === true &&
  typeof v.year === "number";

const isCqlDateTime = (v: unknown): boolean =>
  isPlainObject(v) &&
  v.isDateTime === true &&
  typeof v.year === "number";

export function inferShape(value: unknown): CqlResultShape {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (value instanceof Date) return "datetime";

  if (Array.isArray(value)) {
    if (value.length === 0) return "list-empty";
    const sample = value.find((v) => v !== null && v !== undefined) ?? value[0];
    if (isFhirResource(sample)) return "list-resource";
    if (isPlainObject(sample) && !isInterval(sample) && !isCode(sample) && !isConcept(sample)) {
      return "list-tuple";
    }
    return "list-primitive";
  }

  if (isCqlDate(value)) return "date";
  if (isCqlDateTime(value)) return "datetime";
  if (isQuantity(value)) return "quantity";
  if (isInterval(value)) return "interval";
  if (isCode(value)) return "code";
  if (isConcept(value)) return "concept";
  if (isFhirResource(value)) return "resource";
  if (isPlainObject(value)) return "tuple";

  return "unknown";
}
