/**
 * Hand-picked CQL snippets, each chosen to exercise a different result shape
 * in <CqlResult>. The set should stay small — five entries — so the dropdown
 * remains scannable.
 */
export interface CqlExample {
  id: string;
  label: string;
  description: string;
  cql: string;
}

const HEADER = `library Demo version '1.0.0'
using FHIR version '4.0.1'
include FHIRHelpers version '4.0.1'

context Patient
`;

export const CQL_EXAMPLES: ReadonlyArray<CqlExample> = [
  {
    id: "boolean",
    label: "Boolean — has any condition",
    description: "Renders as a pass/fail badge.",
    cql: `${HEADER}
define HasAnyCondition:
  exists [Condition]
`,
  },
  {
    id: "list-resource",
    label: "List of resources — observations",
    description: "Renders via the FHIR ResourceTable.",
    cql: `${HEADER}
define AllObservations:
  [Observation]
`,
  },
  {
    id: "tuple",
    label: "Tuple — counts by type",
    description: "Renders as a key/value table.",
    cql: `${HEADER}
define Counts:
  Tuple {
    Conditions: Count([Condition]),
    Observations: Count([Observation]),
    Encounters: Count([Encounter])
  }
`,
  },
  {
    id: "interval",
    label: "Interval — lifetime",
    description: "Renders start/end with date formatting.",
    cql: `${HEADER}
define Lifetime:
  Interval[Patient.birthDate, Today()]
`,
  },
  {
    id: "list-primitive",
    label: "List of primitives — observation codes",
    description: "Renders as a one-column table.",
    cql: `${HEADER}
define ObservationCodes:
  [Observation] O return O.code.coding[0].code.value
`,
  },
];
