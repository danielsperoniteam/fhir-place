import type { LayoutHint } from "./types.js";

/**
 * Tier 1 hint registry: the top resource types that get a hand-shaped layout.
 * Tier 0 (everything else) renders via the generic StructureDefinition walker
 * — `getLayoutHint` returns `undefined` for those.
 *
 * Ten initial entries were chosen to match the spec's "top 10 perceived custom
 * feel" set. Adding more is a matter of dropping another entry into this map;
 * the schema is intentionally narrow so each definition stays ~30 lines.
 */
const PATIENT: LayoutHint = {
  list: {
    columns: ["name", "gender", "birthDate", "address.city", "id"],
    title: "name",
    subtitle: "birthDate",
    sortBy: "name.family",
  },
  detail: {
    hero: ["name", "gender", "birthDate"],
    sections: [
      { title: "Identifiers", fields: ["identifier", "active"] },
      { title: "Contact", fields: ["telecom", "address"] },
      {
        title: "Demographics",
        fields: [
          "maritalStatus",
          "communication",
          "deceasedBoolean",
          "deceasedDateTime",
        ],
      },
      {
        title: "Care relationships",
        fields: ["generalPractitioner", "managingOrganization", "contact"],
      },
    ],
  },
  search: {
    priorityParams: ["name", "family", "given", "gender", "birthdate", "address-city"],
  },
};

const OBSERVATION: LayoutHint = {
  list: {
    columns: ["status", "code", "effectiveDateTime", "valueQuantity"],
    title: "code",
    subtitle: "effectiveDateTime",
    tone: {
      field: "status",
      map: {
        final: "success",
        amended: "success",
        corrected: "warn",
        preliminary: "warn",
        registered: "neutral",
        cancelled: "neutral",
        "entered-in-error": "danger",
      },
    },
    sortBy: "effectiveDateTime",
  },
  detail: {
    hero: ["code", "value[x]", "effectiveDateTime", "status"],
    sections: [
      { title: "Subject", fields: ["subject", "encounter", "performer"] },
      { title: "Context", fields: ["category", "method", "bodySite"] },
      { title: "Result", fields: ["interpretation", "referenceRange", "note"] },
      { title: "Components", fields: ["component"] },
    ],
  },
  search: {
    priorityParams: ["patient", "code", "category", "status", "date"],
  },
};

const CONDITION: LayoutHint = {
  list: {
    columns: ["clinicalStatus", "code", "onsetDateTime"],
    title: "code",
    subtitle: "onsetDateTime",
    tone: {
      field: "clinicalStatus.coding.code",
      map: {
        active: "warn",
        recurrence: "warn",
        relapse: "warn",
        inactive: "neutral",
        remission: "success",
        resolved: "success",
      },
    },
    sortBy: "onsetDateTime",
  },
  detail: {
    hero: ["code", "clinicalStatus", "verificationStatus", "onsetDateTime"],
    sections: [
      { title: "Subject", fields: ["subject", "encounter", "recorder", "asserter"] },
      { title: "Clinical detail", fields: ["category", "severity", "bodySite", "stage"] },
      { title: "Course", fields: ["abatementDateTime", "recordedDate", "evidence", "note"] },
    ],
  },
  search: {
    priorityParams: ["patient", "code", "category", "clinical-status", "onset-date"],
  },
};

const ENCOUNTER: LayoutHint = {
  list: {
    columns: ["status", "class.code", "type", "period.start"],
    title: "type",
    subtitle: "period.start",
    tone: {
      field: "status",
      map: {
        finished: "success",
        "in-progress": "warn",
        planned: "neutral",
        arrived: "neutral",
        cancelled: "neutral",
        "entered-in-error": "danger",
      },
    },
    sortBy: "period.start",
  },
  detail: {
    hero: ["type", "class", "status", "period"],
    sections: [
      { title: "Subject", fields: ["subject", "participant", "serviceProvider"] },
      { title: "Reason", fields: ["reasonCode", "reasonReference", "diagnosis"] },
      { title: "Location", fields: ["location", "hospitalization"] },
    ],
  },
  search: {
    priorityParams: ["patient", "status", "class", "type", "date"],
  },
};

const MEDICATION_REQUEST: LayoutHint = {
  list: {
    columns: ["status", "medicationCodeableConcept", "authoredOn"],
    title: "medicationCodeableConcept",
    subtitle: "authoredOn",
    tone: {
      field: "status",
      map: {
        active: "success",
        completed: "success",
        "on-hold": "warn",
        cancelled: "neutral",
        stopped: "neutral",
        draft: "neutral",
        "entered-in-error": "danger",
      },
    },
    sortBy: "authoredOn",
  },
  detail: {
    hero: ["medicationCodeableConcept", "status", "intent", "authoredOn"],
    sections: [
      { title: "Subject", fields: ["subject", "encounter", "requester", "performer"] },
      { title: "Reason", fields: ["reasonCode", "reasonReference", "category"] },
      { title: "Dosage", fields: ["dosageInstruction", "dispenseRequest", "substitution"] },
    ],
  },
  search: {
    priorityParams: ["patient", "code", "status", "intent", "authoredon"],
  },
};

const ALLERGY_INTOLERANCE: LayoutHint = {
  list: {
    columns: ["clinicalStatus", "code", "reaction.manifestation"],
    title: "code",
    subtitle: "reaction.manifestation",
    tone: {
      field: "criticality",
      map: {
        high: "danger",
        low: "warn",
        "unable-to-assess": "neutral",
      },
    },
    sortBy: "recordedDate",
  },
  detail: {
    hero: ["code", "clinicalStatus"],
    sections: [
      { title: "Subject", fields: ["patient", "encounter", "recorder", "asserter"] },
      { title: "Classification", fields: ["type", "category", "onsetDateTime", "recordedDate"] },
      { title: "Notes", fields: ["note"] },
    ],
    collections: {
      reaction: { mode: "cards", cardTitle: "manifestation" },
    },
  },
  search: {
    priorityParams: ["patient", "code", "clinical-status", "type", "category"],
  },
};

const DIAGNOSTIC_REPORT: LayoutHint = {
  list: {
    columns: ["status", "code", "effectiveDateTime"],
    title: "code",
    subtitle: "effectiveDateTime",
    tone: {
      field: "status",
      map: {
        final: "success",
        amended: "success",
        corrected: "warn",
        preliminary: "warn",
        registered: "neutral",
        cancelled: "neutral",
        "entered-in-error": "danger",
      },
    },
    sortBy: "effectiveDateTime",
  },
  detail: {
    hero: ["code", "status", "effectiveDateTime", "issued"],
    sections: [
      { title: "Subject", fields: ["subject", "encounter", "performer", "resultsInterpreter"] },
      { title: "Context", fields: ["category", "basedOn", "specimen"] },
      { title: "Findings", fields: ["result", "conclusion", "conclusionCode", "presentedForm"] },
    ],
  },
  search: {
    priorityParams: ["patient", "code", "category", "status", "date"],
  },
};

const PROCEDURE: LayoutHint = {
  list: {
    columns: ["status", "code", "performedDateTime"],
    title: "code",
    subtitle: "performedDateTime",
    tone: {
      field: "status",
      map: {
        completed: "success",
        "in-progress": "warn",
        "on-hold": "warn",
        preparation: "neutral",
        "not-done": "neutral",
        stopped: "neutral",
        "entered-in-error": "danger",
      },
    },
    sortBy: "performedDateTime",
  },
  detail: {
    hero: ["code", "status", "performedDateTime"],
    sections: [
      { title: "Subject", fields: ["subject", "encounter", "performer", "recorder", "asserter"] },
      { title: "Reason", fields: ["reasonCode", "reasonReference", "category"] },
      { title: "Outcome", fields: ["outcome", "complication", "followUp", "note"] },
    ],
  },
  search: {
    priorityParams: ["patient", "code", "status", "date"],
  },
};

const IMMUNIZATION: LayoutHint = {
  list: {
    columns: ["status", "vaccineCode", "occurrenceDateTime"],
    title: "vaccineCode",
    subtitle: "occurrenceDateTime",
    tone: {
      field: "status",
      map: {
        completed: "success",
        "not-done": "neutral",
        "entered-in-error": "danger",
      },
    },
    sortBy: "occurrenceDateTime",
  },
  detail: {
    hero: ["vaccineCode", "status", "occurrenceDateTime"],
    sections: [
      { title: "Subject", fields: ["patient", "encounter", "performer"] },
      { title: "Administration", fields: ["site", "route", "doseQuantity", "lotNumber", "expirationDate"] },
      { title: "Context", fields: ["statusReason", "reasonCode", "reasonReference", "note"] },
    ],
  },
  search: {
    priorityParams: ["patient", "vaccine-code", "status", "date"],
  },
};

const DOCUMENT_REFERENCE: LayoutHint = {
  list: {
    columns: ["status", "type", "date"],
    title: "type",
    subtitle: "date",
    tone: {
      field: "status",
      map: {
        current: "success",
        superseded: "neutral",
        "entered-in-error": "danger",
      },
    },
    sortBy: "date",
  },
  detail: {
    hero: ["type", "status", "date"],
    sections: [
      { title: "Subject", fields: ["subject", "author", "authenticator", "custodian"] },
      { title: "Content", fields: ["category", "description", "content"] },
      { title: "Context", fields: ["context"] },
    ],
  },
  search: {
    priorityParams: ["patient", "type", "category", "status", "date"],
  },
};

/**
 * The Tier 1 registry. Adding a new entry promotes a resource type from
 * Tier 0 to Tier 1 — no other wiring required. Adding a custom React view to
 * the bespoke registry (in the renderer layer) promotes Tier 1 to Tier 2.
 */
const TIER_1_HINTS: Readonly<Record<string, LayoutHint>> = Object.freeze({
  Patient: PATIENT,
  Observation: OBSERVATION,
  Condition: CONDITION,
  Encounter: ENCOUNTER,
  MedicationRequest: MEDICATION_REQUEST,
  AllergyIntolerance: ALLERGY_INTOLERANCE,
  DiagnosticReport: DIAGNOSTIC_REPORT,
  Procedure: PROCEDURE,
  Immunization: IMMUNIZATION,
  DocumentReference: DOCUMENT_REFERENCE,
});

export const LAYOUT_HINTS = TIER_1_HINTS;

/** Returns the registered hint for `resourceType`, or `undefined` for Tier 0. */
export function getLayoutHint(resourceType: string): LayoutHint | undefined {
  return TIER_1_HINTS[resourceType];
}

/**
 * Tier classifier.
 *
 * - 0: no hint registered (renders via generic SD walker).
 * - 1: hint registered, no bespoke React view.
 * - 2: hint registered AND a bespoke view is registered for `resourceType` in
 *   the optional `bespokeViewKeys` set. The set is passed in (rather than
 *   imported) to keep the data layer free of React/JSX dependencies.
 */
export function getTier(
  resourceType: string,
  bespokeViewKeys?: ReadonlySet<string> | readonly string[],
): 0 | 1 | 2 {
  const hint = TIER_1_HINTS[resourceType];
  if (!hint) return 0;
  if (!bespokeViewKeys) return 1;
  const has =
    bespokeViewKeys instanceof Set
      ? bespokeViewKeys.has(resourceType)
      : (bespokeViewKeys as readonly string[]).includes(resourceType);
  return has ? 2 : 1;
}

/** All resource types with a Tier 1 hint, in registration order. */
export function tier1ResourceTypes(): readonly string[] {
  return Object.keys(TIER_1_HINTS);
}
