/**
 * Typed search builder. See issues #121 (v0 — operators + `_include`) and
 * #129 (v0.2 — chained search and `_has`) and ADR 0004.
 *
 * Models the FHIR search parameter types we cover initially:
 * `string`, `token`, `date`, `reference`, `number`. Composite, quantity, uri,
 * and special types are deferred. Resources and `_include`/`_revinclude`
 * targets are seeded minimally; the `SearchParamTypes`,
 * `IncludePathsByResource`, `RevIncludePathsByResource`, and `ReferenceTargets`
 * registries are all extensible via TypeScript declaration merging.
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

/**
 * Optional declaration-merged map: for each `(sourceResource, refParam)` reference
 * search parameter, list the resource types the reference can target. Seeded for
 * Patient and Observation; extend via declaration merging to cover more resources.
 *
 * Used to type the `:Type` modifier in chained search and to constrain the
 * back-pointer in `_has`. Targets that are not in `SearchableResource` are
 * filtered out, since chained / `_has` queries require the target resource to
 * have registered search params.
 */
export interface ReferenceTargets {
  Patient: {
    "general-practitioner":
      | "Practitioner"
      | "Organization"
      | "PractitionerRole";
    organization: "Organization";
  };
  Observation: {
    subject: "Patient" | "Group" | "Device" | "Location";
    patient: "Patient";
    encounter: "Encounter";
  };
}

type ReferenceParamsOf<R extends SearchableResource> = {
  [K in keyof SearchParamTypes[R]]: SearchParamTypes[R][K] extends "reference"
    ? K & string
    : never;
}[keyof SearchParamTypes[R]];

type ChainedTargetsOf<
  R extends SearchableResource,
  P extends ReferenceParamsOf<R>,
> = R extends keyof ReferenceTargets
  ? P extends keyof ReferenceTargets[R]
    ? Extract<ReferenceTargets[R][P], SearchableResource>
    : SearchableResource
  : SearchableResource;

type RefParamsTargeting<
  S extends SearchableResource,
  R extends SearchableResource,
> = S extends keyof ReferenceTargets
  ? {
      [K in ReferenceParamsOf<S>]: K extends keyof ReferenceTargets[S]
        ? R extends Extract<ReferenceTargets[S][K], SearchableResource>
          ? K
          : never
        : K;
    }[ReferenceParamsOf<S>]
  : ReferenceParamsOf<S>;

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
    this.appendValue(name, value);
    return this;
  }

  /**
   * Chained search: `subject:Patient.name=Smith`.
   *
   * `refParam` must be a `reference` parameter on `R`. When `ReferenceTargets`
   * has an entry for `(R, refParam)`, `targetType` is constrained to its
   * intersection with `SearchableResource`; otherwise any `SearchableResource`
   * is accepted. `value` is typed against `(targetType, targetParam)`.
   */
  whereChained<
    P extends ReferenceParamsOf<R>,
    T extends ChainedTargetsOf<R, P>,
    TP extends keyof SearchParamTypes[T] & string,
  >(
    refParam: P,
    targetType: T,
    targetParam: TP,
    value: SearchValue<Extract<SearchParamTypes[T][TP], ParamType>>,
  ): this {
    this.appendValue(`${refParam}:${targetType}.${targetParam}`, value);
    return this;
  }

  /**
   * Reverse chained search: `_has:Observation:subject:code=85354-9`.
   *
   * `(sourceType, refParam)` must be a `reference` parameter that points back
   * at `R` (when `ReferenceTargets` records the relationship). `targetParam`
   * must be a registered search param on `sourceType`; `value` is typed
   * against it.
   */
  whereHas<
    S extends SearchableResource,
    RP extends RefParamsTargeting<S, R>,
    TP extends keyof SearchParamTypes[S] & string,
  >(
    sourceType: S,
    refParam: RP,
    targetParam: TP,
    value: SearchValue<Extract<SearchParamTypes[S][TP], ParamType>>,
  ): this {
    this.appendValue(`_has:${sourceType}:${refParam}:${targetParam}`, value);
    return this;
  }

  private appendValue(key: string, value: unknown): void {
    if (isPlainOperatorObject(value)) {
      for (const [prefix, raw] of Object.entries(value)) {
        if (raw === undefined || raw === null) continue;
        this.entries.push([key, `${prefix}${formatScalar(raw)}`]);
      }
    } else {
      this.entries.push([key, formatScalar(value)]);
    }
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
