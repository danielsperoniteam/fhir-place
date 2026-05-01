/**
 * Typed search builder (v0). See issue #121 / ADR 0004.
 *
 * Models the FHIR search parameter types we cover initially:
 * `string`, `token`, `date`, `reference`, `number`. Composite, quantity, uri,
 * and special types are deferred. Resources and `_include`/`_revinclude`
 * targets are seeded minimally; both registries are extensible via TypeScript
 * declaration merging on `SearchParamTypes` and `IncludePaths`.
 *
 * Output is byte-identical to `buildSearchParams` for any case both can express.
 */

export type ParamType = "string" | "token" | "date" | "reference" | "number";

export type DatePrefix =
  | "eq"
  | "ne"
  | "gt"
  | "ge"
  | "lt"
  | "le"
  | "sa"
  | "eb"
  | "ap";

export type NumberPrefix = "eq" | "ne" | "gt" | "ge" | "lt" | "le" | "ap";

type DateValue = string | Date;
type DateRange = { [P in DatePrefix]?: DateValue };
type NumberRange = { [P in NumberPrefix]?: number };

export type SearchValue<T extends ParamType> = T extends "string"
  ? string
  : T extends "token"
    ? string
    : T extends "reference"
      ? string
      : T extends "date"
        ? DateValue | DateRange
        : T extends "number"
          ? number | NumberRange
          : never;

/**
 * Per-resource search parameter typing. Augment via module declaration to
 * cover additional resources or parameters without forking this file.
 */
export interface SearchParamTypes {
  Patient: {
    _id: "token";
    _lastUpdated: "date";
    name: "string";
    family: "string";
    given: "string";
    identifier: "token";
    gender: "token";
    birthdate: "date";
    active: "token";
    "general-practitioner": "reference";
    organization: "reference";
  };
  Observation: {
    _id: "token";
    _lastUpdated: "date";
    code: "token";
    date: "date";
    subject: "reference";
    patient: "reference";
    encounter: "reference";
    status: "token";
    "value-quantity": "number";
    "value-string": "string";
  };
}

export type SearchableResource = keyof SearchParamTypes;

/**
 * `_include` allow-list, keyed by the resource being SEARCHED. Each value is
 * the union of include paths whose source type is that resource.
 *
 * v0 seed:
 *   Patient → "Patient:general-practitioner"
 *   Observation → "Observation:subject"
 *
 * Extend via declaration merging.
 */
export interface IncludePathsByResource {
  Patient: "Patient:general-practitioner";
  Observation: "Observation:subject";
}

/**
 * `_revinclude` allow-list, keyed by the resource being SEARCHED. Each value
 * is the union of include paths whose reference TARGET is that resource.
 *
 * v0 seed:
 *   Patient → "Observation:subject"  (Observation.subject targets Patient)
 *
 * Extend via declaration merging.
 */
export interface RevIncludePathsByResource {
  Patient: "Observation:subject";
}

export type IncludeSpec<R extends SearchableResource> =
  R extends keyof IncludePathsByResource ? IncludePathsByResource[R] : never;

export type RevIncludeSpec<R extends SearchableResource> =
  R extends keyof RevIncludePathsByResource
    ? RevIncludePathsByResource[R]
    : never;

const isPlainOperatorObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !(value instanceof Date);

const formatScalar = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

export class SearchBuilder<R extends SearchableResource> {
  private readonly entries: Array<[string, string]> = [];

  constructor(private readonly resourceType: R) {}

  where<P extends keyof SearchParamTypes[R] & string>(
    name: P,
    value: SearchValue<Extract<SearchParamTypes[R][P], ParamType>>,
  ): this {
    if (isPlainOperatorObject(value)) {
      for (const [prefix, raw] of Object.entries(value)) {
        if (raw === undefined || raw === null) continue;
        this.entries.push([name, `${prefix}${formatScalar(raw)}`]);
      }
    } else {
      this.entries.push([name, formatScalar(value)]);
    }
    return this;
  }

  include(spec: IncludeSpec<R>): this {
    this.entries.push(["_include", spec]);
    return this;
  }

  revInclude(spec: RevIncludeSpec<R>): this {
    this.entries.push(["_revinclude", spec]);
    return this;
  }

  toSearchParams(): URLSearchParams {
    const qs = new URLSearchParams();
    for (const [k, v] of this.entries) qs.append(k, v);
    return qs;
  }

  toQueryString(): string {
    return this.toSearchParams().toString();
  }

  build(): string {
    const qs = this.toQueryString();
    return qs ? `${this.resourceType}?${qs}` : this.resourceType;
  }
}

export function searchBuilder<R extends SearchableResource>(
  resourceType: R,
): SearchBuilder<R> {
  return new SearchBuilder(resourceType);
}
