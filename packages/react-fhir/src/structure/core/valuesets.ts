import type { ValueSet } from "fhir/r4";

/**
 * Bundled R4 core ValueSets — served from memory when the target FHIR server
 * can't resolve them via `$expand` or `?url=...`. These are the fixed,
 * non-extensible enumerations from the FHIR spec itself, so they can't drift.
 *
 * Ships as a Map keyed by canonical URL so consumers (and `useValueSet`) can
 * look them up in one step. Each entry is already in "expanded" form so
 * `codesFromValueSet` reads them without further transformation.
 */

// Large generated data modules are lazy-loaded to keep the initial bundle
// under the Vite 500 kB chunk-size warning threshold.  Call
// `preloadCoreLookups()` at app boot to populate them before first render.
// Functions that depend on them gracefully degrade (return undefined / only
// use hand-curated data) until the preload resolves.
type GeneratedValueSets = Map<string, ValueSet>;
type GeneratedConcepts = Record<string, Record<string, { d?: string; x?: string }>>;

let _generatedCoreValueSets: GeneratedValueSets | null = null;
let _generatedCoreConcepts: GeneratedConcepts | null = null;

/**
 * Eagerly loads `valuesets.generated` and `codesystems.generated` in parallel.
 * Safe to call multiple times — subsequent calls are no-ops once the data has
 * resolved. Apps should call this once during bootstrap (before the first
 * render) so code-display lookups and bundled-ValueSet fallbacks are fully
 * populated on first paint.
 */
export async function preloadCoreLookups(): Promise<void> {
  if (_generatedCoreValueSets && _generatedCoreConcepts) return;
  const [vsModule, csModule] = await Promise.all([
    import("./valuesets.generated.js"),
    import("./codesystems.generated.js"),
  ]);
  _generatedCoreValueSets = vsModule.generatedCoreValueSets;
  _generatedCoreConcepts = csModule.generatedCoreConcepts;
  // Extend the mutable bundledValueSetUrls array so consumers that hold a
  // reference to it see the full generated set after preload.
  const existing = new Set(bundledValueSetUrls);
  for (const url of _generatedCoreValueSets.keys()) {
    if (!existing.has(url)) bundledValueSetUrls.push(url);
  }
  // Invalidate the display index so it rebuilds with the full data set on
  // next access.
  codeDisplayIndex = undefined;
}

const mk = (
  url: string,
  codes: Array<{ code: string; display?: string }>,
  system: string,
): ValueSet => ({
  resourceType: "ValueSet",
  status: "active",
  url,
  expansion: {
    identifier: "bundled",
    timestamp: "2024-01-01T00:00:00Z",
    contains: codes.map((c) => ({ system, code: c.code, display: c.display })),
  },
});

export const coreValueSets: Map<string, ValueSet> = new Map(
  (
    [
      mk(
        "http://hl7.org/fhir/ValueSet/administrative-gender",
        [
          { code: "male", display: "Male" },
          { code: "female", display: "Female" },
          { code: "other", display: "Other" },
          { code: "unknown", display: "Unknown" },
        ],
        "http://hl7.org/fhir/administrative-gender",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/observation-status",
        [
          { code: "registered", display: "Registered" },
          { code: "preliminary", display: "Preliminary" },
          { code: "final", display: "Final" },
          { code: "amended", display: "Amended" },
          { code: "corrected", display: "Corrected" },
          { code: "cancelled", display: "Cancelled" },
          { code: "entered-in-error", display: "Entered in Error" },
          { code: "unknown", display: "Unknown" },
        ],
        "http://hl7.org/fhir/observation-status",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/condition-clinical",
        [
          { code: "active", display: "Active" },
          { code: "recurrence", display: "Recurrence" },
          { code: "relapse", display: "Relapse" },
          { code: "inactive", display: "Inactive" },
          { code: "remission", display: "Remission" },
          { code: "resolved", display: "Resolved" },
        ],
        "http://terminology.hl7.org/CodeSystem/condition-clinical",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/condition-ver-status",
        [
          { code: "unconfirmed", display: "Unconfirmed" },
          { code: "provisional", display: "Provisional" },
          { code: "differential", display: "Differential" },
          { code: "confirmed", display: "Confirmed" },
          { code: "refuted", display: "Refuted" },
          { code: "entered-in-error", display: "Entered in Error" },
        ],
        "http://terminology.hl7.org/CodeSystem/condition-ver-status",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/task-status",
        [
          { code: "draft", display: "Draft" },
          { code: "requested", display: "Requested" },
          { code: "received", display: "Received" },
          { code: "accepted", display: "Accepted" },
          { code: "rejected", display: "Rejected" },
          { code: "ready", display: "Ready" },
          { code: "cancelled", display: "Cancelled" },
          { code: "in-progress", display: "In Progress" },
          { code: "on-hold", display: "On Hold" },
          { code: "failed", display: "Failed" },
          { code: "completed", display: "Completed" },
          { code: "entered-in-error", display: "Entered in Error" },
        ],
        "http://hl7.org/fhir/task-status",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/goal-status",
        [
          { code: "proposed", display: "Proposed" },
          { code: "planned", display: "Planned" },
          { code: "accepted", display: "Accepted" },
          { code: "active", display: "Active" },
          { code: "on-hold", display: "On Hold" },
          { code: "completed", display: "Completed" },
          { code: "cancelled", display: "Cancelled" },
          { code: "entered-in-error", display: "Entered in Error" },
          { code: "rejected", display: "Rejected" },
        ],
        "http://hl7.org/fhir/goal-status",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/medicationrequest-status",
        [
          { code: "active", display: "Active" },
          { code: "on-hold", display: "On Hold" },
          { code: "cancelled", display: "Cancelled" },
          { code: "completed", display: "Completed" },
          { code: "entered-in-error", display: "Entered in Error" },
          { code: "stopped", display: "Stopped" },
          { code: "draft", display: "Draft" },
          { code: "unknown", display: "Unknown" },
        ],
        "http://hl7.org/fhir/CodeSystem/medicationrequest-status",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/encounter-status",
        [
          { code: "planned", display: "Planned" },
          { code: "arrived", display: "Arrived" },
          { code: "triaged", display: "Triaged" },
          { code: "in-progress", display: "In Progress" },
          { code: "onleave", display: "On Leave" },
          { code: "finished", display: "Finished" },
          { code: "cancelled", display: "Cancelled" },
          { code: "entered-in-error", display: "Entered in Error" },
          { code: "unknown", display: "Unknown" },
        ],
        "http://hl7.org/fhir/encounter-status",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/allergyintolerance-clinical",
        [
          { code: "active", display: "Active" },
          { code: "inactive", display: "Inactive" },
          { code: "resolved", display: "Resolved" },
        ],
        "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/allergyintolerance-verification",
        [
          { code: "unconfirmed", display: "Unconfirmed" },
          { code: "confirmed", display: "Confirmed" },
          { code: "refuted", display: "Refuted" },
          { code: "entered-in-error", display: "Entered in Error" },
        ],
        "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/request-intent",
        [
          { code: "proposal", display: "Proposal" },
          { code: "plan", display: "Plan" },
          { code: "directive", display: "Directive" },
          { code: "order", display: "Order" },
          { code: "original-order", display: "Original Order" },
          { code: "reflex-order", display: "Reflex Order" },
          { code: "filler-order", display: "Filler Order" },
          { code: "instance-order", display: "Instance Order" },
          { code: "option", display: "Option" },
        ],
        "http://hl7.org/fhir/request-intent",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/request-priority",
        [
          { code: "routine", display: "Routine" },
          { code: "urgent", display: "Urgent" },
          { code: "asap", display: "ASAP" },
          { code: "stat", display: "STAT" },
        ],
        "http://hl7.org/fhir/request-priority",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/publication-status",
        [
          { code: "draft", display: "Draft" },
          { code: "active", display: "Active" },
          { code: "retired", display: "Retired" },
          { code: "unknown", display: "Unknown" },
        ],
        "http://hl7.org/fhir/publication-status",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/medicationrequest-intent",
        [
          { code: "proposal", display: "Proposal" },
          { code: "plan", display: "Plan" },
          { code: "order", display: "Order" },
          { code: "original-order", display: "Original Order" },
          { code: "reflex-order", display: "Reflex Order" },
          { code: "filler-order", display: "Filler Order" },
          { code: "instance-order", display: "Instance Order" },
          { code: "option", display: "Option" },
        ],
        "http://hl7.org/fhir/CodeSystem/medicationrequest-intent",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/medicationrequest-category",
        [
          { code: "inpatient", display: "Inpatient" },
          { code: "outpatient", display: "Outpatient" },
          { code: "community", display: "Community" },
          { code: "discharge", display: "Discharge" },
        ],
        "http://terminology.hl7.org/CodeSystem/medicationrequest-category",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/event-status",
        [
          { code: "preparation", display: "Preparation" },
          { code: "in-progress", display: "In Progress" },
          { code: "not-done", display: "Not Done" },
          { code: "on-hold", display: "On Hold" },
          { code: "stopped", display: "Stopped" },
          { code: "completed", display: "Completed" },
          { code: "entered-in-error", display: "Entered in Error" },
          { code: "unknown", display: "Unknown" },
        ],
        "http://hl7.org/fhir/event-status",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/procedure-category",
        [
          { code: "24642003", display: "Psychiatry procedure or service" },
          { code: "409063005", display: "Counselling" },
          { code: "409073007", display: "Education" },
          { code: "387713003", display: "Surgical procedure" },
          { code: "103693007", display: "Diagnostic procedure" },
          { code: "46947000", display: "Chiropractic manipulation" },
          { code: "410606002", display: "Social service procedure" },
        ],
        "http://snomed.info/sct",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/immunization-status",
        [
          { code: "completed", display: "Completed" },
          { code: "entered-in-error", display: "Entered in Error" },
          { code: "not-done", display: "Not Done" },
        ],
        "http://hl7.org/fhir/event-status",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/allergy-intolerance-category",
        [
          { code: "food", display: "Food" },
          { code: "medication", display: "Medication" },
          { code: "environment", display: "Environment" },
          { code: "biologic", display: "Biologic" },
        ],
        "http://hl7.org/fhir/allergy-intolerance-category",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/allergy-intolerance-criticality",
        [
          { code: "low", display: "Low Risk" },
          { code: "high", display: "High Risk" },
          { code: "unable-to-assess", display: "Unable to Assess Risk" },
        ],
        "http://hl7.org/fhir/allergy-intolerance-criticality",
      ),
      mk(
        "http://hl7.org/fhir/ValueSet/allergy-intolerance-type",
        [
          { code: "allergy", display: "Allergy" },
          { code: "intolerance", display: "Intolerance" },
        ],
        "http://hl7.org/fhir/allergy-intolerance-type",
      ),
      mk(
        // Patient.maritalStatus binding (extensible). Bundles the v3-MaritalStatus
        // codes; the spec's ValueSet also includes NullFlavor#UNK which users can
        // still enter via the "Other…" escape on extensible bindings.
        "http://hl7.org/fhir/ValueSet/marital-status",
        [
          { code: "A", display: "Annulled" },
          { code: "D", display: "Divorced" },
          { code: "I", display: "Interlocutory" },
          { code: "L", display: "Legally Separated" },
          { code: "M", display: "Married" },
          { code: "P", display: "Polygamous" },
          { code: "S", display: "Never Married" },
          { code: "T", display: "Domestic Partner" },
          { code: "U", display: "Unmarried" },
          { code: "W", display: "Widowed" },
        ],
        "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus",
      ),
      mk(
        // Patient.contact.relationship binding (extensible). v2-0131 codes.
        "http://hl7.org/fhir/ValueSet/patient-contactrelationship",
        [
          { code: "C", display: "Emergency Contact" },
          { code: "E", display: "Employer" },
          { code: "F", display: "Federal Agency" },
          { code: "I", display: "Insurance Company" },
          { code: "N", display: "Next-of-Kin" },
          { code: "S", display: "State Agency" },
          { code: "U", display: "Unknown" },
        ],
        "http://terminology.hl7.org/CodeSystem/v2-0131",
      ),
      mk(
        "http://terminology.hl7.org/ValueSet/v3-ActEncounterCode",
        [
          { code: "AMB", display: "Ambulatory" },
          { code: "EMER", display: "Emergency" },
          { code: "FLD", display: "Field" },
          { code: "HH", display: "Home Health" },
          { code: "IMP", display: "Inpatient Encounter" },
          { code: "ACUTE", display: "Inpatient Acute" },
          { code: "NONAC", display: "Inpatient Non-Acute" },
          { code: "OBSENC", display: "Observation Encounter" },
          { code: "PRENC", display: "Pre-Admission" },
          { code: "SS", display: "Short Stay" },
          { code: "VR", display: "Virtual" },
        ],
        "http://terminology.hl7.org/CodeSystem/v3-ActCode",
      ),
    ] as const
  ).map((vs): [string, ValueSet] => [vs.url!, vs]),
);

/**
 * Returns the library's bundled copy of a R4 core ValueSet by canonical URL,
 * or `undefined` if we don't ship one. Used by `useValueSet` as a last-resort
 * fallback when the server can't resolve it.
 *
 * The hand-curated entries in `coreValueSets` are always available. The much
 * larger generated set is only consulted after `preloadCoreLookups()` resolves.
 */
export function coreValueSet(canonical: string | undefined): ValueSet | undefined {
  if (!canonical) return undefined;
  return coreValueSets.get(canonical) ?? _generatedCoreValueSets?.get(canonical);
}

/**
 * Canonical URLs for every bundled ValueSet.
 *
 * Starts with only the hand-curated entries. After `preloadCoreLookups()`
 * resolves, the generated URLs are appended to the end of this array in place.
 * Consumers that hold a reference to this array will automatically see the
 * full list once the preload is complete.
 */
export const bundledValueSetUrls: string[] = Array.from(coreValueSets.keys());

/**
 * Lazy index of (system → code → display) built once on first access from
 * every bundled ValueSet expansion AND CodeSystem concept list. Lets
 * renderers surface a friendly label (e.g. "Active") for
 * `(http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical, active)`
 * even when the resource omits `Coding.display`.
 */
let codeDisplayIndex: Map<string, Map<string, string>> | undefined;

function buildCodeDisplayIndex(): Map<string, Map<string, string>> {
  const index = new Map<string, Map<string, string>>();
  const set = (system: string, code: string, display: string) => {
    let bySystem = index.get(system);
    if (!bySystem) {
      bySystem = new Map();
      index.set(system, bySystem);
    }
    // First write wins — hand-curated `coreValueSets` are visited first
    // and tend to have the canonical, title-cased displays.
    if (!bySystem.has(code)) bySystem.set(code, display);
  };
  for (const vs of coreValueSets.values()) {
    for (const c of vs.expansion?.contains ?? []) {
      if (c.system && c.code && c.display) set(c.system, c.code, c.display);
    }
  }
  if (_generatedCoreValueSets) {
    for (const vs of _generatedCoreValueSets.values()) {
      for (const c of vs.expansion?.contains ?? []) {
        if (c.system && c.code && c.display) set(c.system, c.code, c.display);
      }
    }
  }
  if (_generatedCoreConcepts) {
    for (const [system, codes] of Object.entries(_generatedCoreConcepts)) {
      for (const [code, info] of Object.entries(codes)) {
        if (info.d) set(system, code, info.d);
      }
    }
  }
  return index;
}

/**
 * Look up a human-readable display for a `(system, code)` pair using the
 * library's bundled ValueSets and CodeSystems. Returns `undefined` if we
 * don't have one.
 *
 * Designed for renderers that want to surface a friendly label when the
 * source `Coding` lacks `.display` — e.g. servers that only return
 * `{ system, code }` for status fields like AllergyIntolerance.clinicalStatus.
 */
export function lookupCoreDisplay(
  system: string | undefined,
  code: string | undefined,
): string | undefined {
  if (!system || !code) return undefined;
  if (!codeDisplayIndex) codeDisplayIndex = buildCodeDisplayIndex();
  return codeDisplayIndex.get(system)?.get(code);
}

/**
 * Look up the long-form definition for a `(system, code)` pair from the
 * library's bundled CodeSystems. Returns `undefined` for systems we don't
 * bundle (SNOMED, LOINC, etc.) — for those, use `useCodeLookup` to fetch
 * via a configured terminology server.
 */
export function lookupCoreDefinition(
  system: string | undefined,
  code: string | undefined,
): string | undefined {
  if (!system || !code) return undefined;
  return _generatedCoreConcepts?.[system]?.[code]?.x;
}

/**
 * Combined display + definition lookup. Convenience for tooltip-style UI
 * that wants both at once without two map lookups.
 */
export function lookupCoreConcept(
  system: string | undefined,
  code: string | undefined,
): { display?: string; definition?: string } | undefined {
  if (!system || !code) return undefined;
  const display = lookupCoreDisplay(system, code);
  const definition = lookupCoreDefinition(system, code);
  if (display === undefined && definition === undefined) return undefined;
  return { display, definition };
}
