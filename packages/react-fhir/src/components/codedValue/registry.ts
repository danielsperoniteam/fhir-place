import type { Coding } from "fhir/r4";

/**
 * Known FHIR code-system URIs with a friendly label and a priority class.
 *
 * Priority drives "which coding wins" in {@link pickPrimary}: lower number
 * wins. Class 1 covers the terminologies clinicians read daily (SNOMED,
 * LOINC, RxNorm) and the small set of HL7 administrative code systems whose
 * codes are essentially data attributes (e.g. `clinicalStatus`,
 * `verificationStatus`); class 2 covers reimbursement / classification
 * systems (ICD-10, CPT, CVX) that are still routinely consumed but tend to
 * lose to a clinical concept when both are present.
 *
 * URIs not listed here are "hidden" — the {@link CodedValue} popover tucks
 * them behind an expander instead of giving them a system pill.
 */
export const FHIR_CODE_SYSTEMS: Record<
  string,
  { label: string; priority: 1 | 2 }
> = {
  "http://snomed.info/sct": { label: "SNOMED CT", priority: 1 },
  "http://loinc.org": { label: "LOINC", priority: 1 },
  "http://www.nlm.nih.gov/research/umls/rxnorm": {
    label: "RxNorm",
    priority: 1,
  },
  "http://unitsofmeasure.org": { label: "UCUM", priority: 1 },
  "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical": {
    label: "HL7 AllergyIntolerance Clinical",
    priority: 1,
  },
  "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification": {
    label: "HL7 AllergyIntolerance Verification",
    priority: 1,
  },
  "http://terminology.hl7.org/CodeSystem/condition-clinical": {
    label: "HL7 Condition Clinical",
    priority: 1,
  },
  "http://terminology.hl7.org/CodeSystem/condition-ver-status": {
    label: "HL7 Condition Verification",
    priority: 1,
  },
  "http://terminology.hl7.org/CodeSystem/observation-category": {
    label: "HL7 Observation Category",
    priority: 1,
  },
  "http://hl7.org/fhir/sid/icd-10": { label: "ICD-10", priority: 2 },
  "http://hl7.org/fhir/sid/icd-10-cm": { label: "ICD-10-CM", priority: 2 },
  "http://hl7.org/fhir/sid/icd-9-cm": { label: "ICD-9-CM", priority: 2 },
  "http://hl7.org/fhir/sid/cvx": { label: "CVX", priority: 2 },
  "http://hl7.org/fhir/sid/ndc": { label: "NDC", priority: 2 },
  "http://www.ama-assn.org/go/cpt": { label: "CPT", priority: 2 },
  "http://terminology.hl7.org/CodeSystem/v3-ActCode": {
    label: "HL7 v3 ActCode",
    priority: 2,
  },
};

/**
 * Strips a FHIR canonical version suffix (`|x.y.z`) and trailing whitespace
 * from a system URI. Servers and IGs frequently emit version-suffixed
 * canonicals (`http://snomed.info/sct|http://snomed.info/sct/731000124108`)
 * — the registry is keyed by the bare URI, so callers normalize first.
 */
export function normalizeSystem(system: string | undefined): string | undefined {
  if (!system) return undefined;
  const bare = system.split("|")[0]!.trim();
  return bare || undefined;
}

/**
 * Friendly label for a known FHIR code-system URI. Returns `undefined` for
 * URIs not in {@link FHIR_CODE_SYSTEMS} so callers can render unknown systems
 * differently (e.g. show the raw URI in the expander section).
 */
export function labelForSystem(system: string | undefined): string | undefined {
  const uri = normalizeSystem(system);
  if (!uri) return undefined;
  return FHIR_CODE_SYSTEMS[uri]?.label;
}

/** True if the coding's system is in the known registry. */
export function isKnown(coding: Coding): boolean {
  const uri = normalizeSystem(coding.system);
  return Boolean(uri && FHIR_CODE_SYSTEMS[uri]);
}

/**
 * Split a coding list into `{ known, hidden }` while preserving original
 * array order within each bucket.
 */
export function partition(codings: readonly Coding[]): {
  known: Coding[];
  hidden: Coding[];
} {
  const known: Coding[] = [];
  const hidden: Coding[] = [];
  for (const c of codings) {
    (isKnown(c) ? known : hidden).push(c);
  }
  return { known, hidden };
}

/**
 * Pick the "primary" coding from a list using the registry's priority
 * ordering:
 *
 *   1. Any coding with `userSelected: true` wins outright (FHIR spec
 *      semantics — the source system explicitly tagged it as the human-
 *      curated answer).
 *   2. Otherwise, lowest registry priority number wins; unknown systems
 *      sort after every known one.
 *   3. Original array order breaks ties.
 *
 * If every coding has an unknown system, the first coding is returned so the
 * caller still has something to render (the popover renders it muted via the
 * "all hidden" branch).
 */
export function pickPrimary(
  codings: readonly Coding[],
): Coding | undefined {
  if (codings.length === 0) return undefined;
  const userSelected = codings.find((c) => c.userSelected === true);
  if (userSelected) return userSelected;
  let best: Coding | undefined;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const c of codings) {
    const uri = normalizeSystem(c.system);
    const entry = uri ? FHIR_CODE_SYSTEMS[uri] : undefined;
    // Unknown systems get a higher rank than any known priority so a known
    // coding always wins over an unknown one even when the unknown appears
    // first in the array.
    const rank = entry?.priority ?? 99;
    if (rank < bestRank) {
      best = c;
      bestRank = rank;
    }
  }
  return best ?? codings[0];
}
