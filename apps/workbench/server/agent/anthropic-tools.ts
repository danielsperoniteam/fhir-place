import type Anthropic from "@anthropic-ai/sdk";

/**
 * The Anthropic SDK's tool input is JSON Schema. The Phase A registry's
 * Zod schemas are well-known shapes (six tools, no recursion, no unions
 * outside of enums) — translating by hand is clearer than pulling in
 * `zod-to-json-schema`.
 *
 * Keep in sync with `apps/workbench/server/agent/tools/*`. A future
 * refactor could autogenerate these from the Zod schemas.
 */

const PATIENT_ID_FIELD = {
  type: "string",
  minLength: 1,
  maxLength: 64,
  description:
    "MUST be the session's authorized patient id. Any other value is rejected.",
} as const;

const LIMIT_FIELD = {
  type: "integer",
  minimum: 1,
  maximum: 50,
  description: "Optional. Max 50, default 20.",
} as const;

const DATE_RANGE = {
  type: "object",
  additionalProperties: false,
  properties: {
    from: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description: "ISO date YYYY-MM-DD, inclusive lower bound.",
    },
    to: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description: "ISO date YYYY-MM-DD, inclusive upper bound.",
    },
  },
} as const;

export const PATIENT_TOOLS: ReadonlyArray<Anthropic.Tool> = [
  {
    name: "getPatient",
    description:
      "Read the Patient resource for the session's authorized patient.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["patientId"],
      properties: { patientId: PATIENT_ID_FIELD },
    },
  },
  {
    name: "searchConditionsForPatient",
    description:
      "Search Condition resources for the patient. Optional `clinicalStatus` " +
      "narrows by FHIR clinical-status code.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["patientId"],
      properties: {
        patientId: PATIENT_ID_FIELD,
        clinicalStatus: {
          type: "string",
          enum: [
            "active",
            "recurrence",
            "relapse",
            "inactive",
            "remission",
            "resolved",
          ],
        },
        limit: LIMIT_FIELD,
      },
    },
  },
  {
    name: "searchMedicationRequestsForPatient",
    description:
      "Search MedicationRequest resources for the patient. Optional `status` " +
      "narrows by medication-request status.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["patientId"],
      properties: {
        patientId: PATIENT_ID_FIELD,
        status: {
          type: "string",
          enum: [
            "active",
            "on-hold",
            "cancelled",
            "completed",
            "entered-in-error",
            "stopped",
            "draft",
            "unknown",
          ],
        },
        limit: LIMIT_FIELD,
      },
    },
  },
  {
    name: "searchAllergyIntolerancesForPatient",
    description:
      "Search AllergyIntolerance resources for the patient. Returns the raw " +
      "resources; an empty array means 'no allergy data found' and MUST NOT " +
      "be summarised as 'no known allergies'.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["patientId"],
      properties: {
        patientId: PATIENT_ID_FIELD,
        limit: LIMIT_FIELD,
      },
    },
  },
  {
    name: "searchEncountersForPatient",
    description:
      "Search Encounter resources for the patient. Optional `dateRange` " +
      "narrows by encounter date.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["patientId"],
      properties: {
        patientId: PATIENT_ID_FIELD,
        dateRange: DATE_RANGE,
        limit: LIMIT_FIELD,
      },
    },
  },
  {
    name: "searchObservationsForPatient",
    description:
      "Search Observation resources for the patient. Optional `category` " +
      "narrows by observation category code; optional `dateRange` narrows by " +
      "effective date.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["patientId"],
      properties: {
        patientId: PATIENT_ID_FIELD,
        category: {
          type: "string",
          enum: [
            "vital-signs",
            "laboratory",
            "social-history",
            "exam",
            "therapy",
            "activity",
          ],
        },
        dateRange: DATE_RANGE,
        limit: LIMIT_FIELD,
      },
    },
  },
];

/**
 * The terminal tool. The agent calls this exactly once when ready to
 * commit a final answer; the orchestrator validates the input against
 * the AgentAnswer Zod schema before accepting. There is no other way to
 * end the loop cleanly — running out of turns triggers a partial-answer
 * fallback that the orchestrator constructs itself.
 */
export const FINALIZE_TOOL: Anthropic.Tool = {
  name: "finalize",
  description:
    "Submit the structured AgentAnswer for this run. Calling this tool ends " +
    "the loop. The input is validated against the AgentAnswer schema; if it " +
    "fails, you will receive an error tool_result and one chance to retry.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["claims", "missingData", "cannotDetermine"],
    properties: {
      summary: {
        type: "string",
        maxLength: 2000,
        description:
          "Optional brief overview. Never load-bearing — the structured " +
          "fields are the source of truth.",
      },
      claims: {
        type: "array",
        description:
          "Supported claims about the patient. Each claim MUST cite at " +
          "least one FHIR resource via the `evidence` array.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "text", "evidence"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 64 },
            text: { type: "string", minLength: 1, maxLength: 2000 },
            evidence: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["reference"],
                properties: {
                  reference: {
                    type: "string",
                    pattern:
                      "^(Patient|Condition|MedicationRequest|AllergyIntolerance|Encounter|Observation)/[A-Za-z0-9\\-.]{1,64}$",
                    description:
                      "FHIR-style relative URL, e.g. `Condition/abc-123`. " +
                      "Resource type must be on the Phase A allow-list.",
                  },
                  display: {
                    type: "string",
                    maxLength: 200,
                    description: "Optional human-readable label.",
                  },
                },
              },
            },
          },
        },
      },
      missingData: {
        type: "array",
        description:
          "Data that is absent from the FHIR server. Use this rather than " +
          "asserting absence as a supported claim.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description"],
          properties: {
            description: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
      },
      cannotDetermine: {
        type: "array",
        description:
          "Questions you cannot answer with the available data, with a " +
          "brief reason why.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "why"],
          properties: {
            question: { type: "string", minLength: 1, maxLength: 500 },
            why: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
      },
    },
  },
};

export const ALL_TOOLS: ReadonlyArray<Anthropic.Tool> = [
  ...PATIENT_TOOLS,
  FINALIZE_TOOL,
];
