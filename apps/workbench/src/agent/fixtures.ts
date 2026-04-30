import { type AgentAnswer } from "./answer-schema.js";

/**
 * A known-good `AgentAnswer` used by tests, the answer-preview page,
 * and (in PR 8) the eval-harness golden snapshots. The shape demonstrates:
 *
 *   - supported claims with FHIR-style relative references,
 *   - missing-data and cannot-determine as first-class top-level fields,
 *   - a tool-call timeline mirroring `ToolEnvelope` summaries,
 *   - resource-type breadth across the Phase A allow-list.
 */
export const SAMPLE_AGENT_ANSWER: AgentAnswer = {
  schemaVersion: "1",
  sessionId: "sess-sample",
  connectionId: "conn-sample",
  patientId: "pat-sample",
  prompt: "Summarise this patient.",
  promptVersion: "patient-summary@v0",
  summary:
    "78-year-old female with documented type 2 diabetes and hypertension. " +
    "Allergy data was queried but none was recorded.",
  claims: [
    {
      id: "c1",
      text: "The patient has documented Type 2 diabetes mellitus.",
      evidence: [
        {
          reference: "Condition/cond-dm2",
          display: "Type 2 diabetes mellitus (active)",
        },
      ],
    },
    {
      id: "c2",
      text: "The patient is currently prescribed metformin.",
      evidence: [
        {
          reference: "MedicationRequest/mr-metformin",
          display: "Metformin 500 mg PO BID (active)",
        },
      ],
    },
    {
      id: "c3",
      text: "The patient had a primary-care encounter in October 2024.",
      evidence: [
        {
          reference: "Encounter/enc-2024-10",
          display: "Primary-care visit · 2024-10-12",
        },
      ],
    },
  ],
  missingData: [
    {
      description:
        "No AllergyIntolerance resources were returned for this patient. " +
        "Treat as 'no allergy data recorded', not 'no known allergies'.",
    },
  ],
  cannotDetermine: [
    {
      question: "Is the patient's diabetes well controlled?",
      why:
        "No HbA1c laboratory Observation was returned in the last 12 months; " +
        "controlled / uncontrolled cannot be inferred without that data.",
    },
  ],
  toolCalls: [
    {
      tool: "getPatient",
      toolVersion: "1",
      ok: true,
      durationMs: 12,
      resourceIds: ["Patient/pat-sample"],
    },
    {
      tool: "searchConditionsForPatient",
      toolVersion: "1",
      ok: true,
      count: 2,
      durationMs: 18,
      resourceIds: ["Condition/cond-dm2", "Condition/cond-htn"],
    },
    {
      tool: "searchMedicationRequestsForPatient",
      toolVersion: "1",
      ok: true,
      count: 1,
      durationMs: 14,
      resourceIds: ["MedicationRequest/mr-metformin"],
    },
    {
      tool: "searchAllergyIntolerancesForPatient",
      toolVersion: "1",
      ok: true,
      count: 0,
      durationMs: 9,
    },
    {
      tool: "searchEncountersForPatient",
      toolVersion: "1",
      ok: true,
      count: 1,
      durationMs: 21,
      resourceIds: ["Encounter/enc-2024-10"],
    },
    {
      tool: "searchObservationsForPatient",
      toolVersion: "1",
      ok: true,
      count: 0,
      durationMs: 17,
    },
  ],
  createdAt: "2026-04-30T13:00:00.000Z",
};
