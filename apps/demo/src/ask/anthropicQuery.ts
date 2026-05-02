import Anthropic from "@anthropic-ai/sdk";
import type { FhirQueryPlan } from "./url.js";

const SYSTEM_PROMPT = `You convert natural-language clinical questions into a single FHIR R4 REST search.

Output exactly one JSON object with these fields:
- resourceType: the FHIR resource the search returns (e.g. Patient, Observation, Condition, MedicationRequest, Encounter, AllergyIntolerance, Procedure, Immunization).
- params: a flat object of FHIR search-parameter names to string values. Use the exact lowercase parameter names defined in FHIR R4. Multiple values for the same parameter are comma-separated.
- explanation: one short sentence describing the query in plain English.

Rules:
- Pick the resourceType whose rows the user actually wants to see. If the user says "patients with diabetes", they want Patient rows, so use resourceType="Patient" and filter by Condition with the reverse-chained parameter "_has:Condition:patient:code". If they say "diabetes diagnoses", use resourceType="Condition".
- For ages, convert to the "birthdate" parameter on Patient using FHIR prefixes "lt", "le", "gt", "ge". The current date is provided in the user message; do the math from there. Example: "over 65" with today=2026-05-02 -> birthdate=lt1961-05-02. Always emit absolute ISO dates (yyyy-mm-dd), never relative phrases.
- Use SNOMED CT codes when you confidently know them (e.g. diabetes mellitus = 73211009, hypertensive disorder = 38341003). Otherwise fall back to a plain text token (e.g. code:text=diabetes).
- Never invent search parameters that don't exist in FHIR R4. If you're unsure, prefer "_content" or a text-based search.
- Add "_count=20" by default unless the user specifies otherwise.
- Do NOT include the base URL in the output - only the resourceType and the params.`;

const SCHEMA: Anthropic.Messages.Tool["input_schema"] = {
  type: "object",
  properties: {
    resourceType: { type: "string" },
    params: {
      type: "object",
      additionalProperties: { type: "string" },
    },
    explanation: { type: "string" },
  },
  required: ["resourceType", "params", "explanation"],
};

export const naturalLanguageToFhirQuery = async (
  question: string,
  apiKey: string,
): Promise<FhirQueryPlan> => {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const today = new Date().toISOString().slice(0, 10);

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Today's date is ${today}.\n\nQuestion: ${question}`,
      },
    ],
    tools: [
      {
        name: "emit_fhir_query",
        description: "Emit the FHIR R4 search query that answers the question.",
        input_schema: SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "emit_fhir_query" },
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Anthropic returned no tool_use content");
  }
  const parsed = toolBlock.input as FhirQueryPlan;
  if (
    typeof parsed.resourceType !== "string" ||
    typeof parsed.params !== "object" ||
    parsed.params === null
  ) {
    throw new Error("Anthropic response did not match the expected schema");
  }
  return parsed;
};
