import { fileURLToPath } from "node:url";
import { parseAgentAnswer, type AgentAnswer } from "../src/agent/answer-schema.js";
import { unsupportedClaimCount } from "../src/agent/answer-extractors.js";

interface EvalCase {
  id: string;
  description: string;
  input: unknown;
  expect: {
    mustIncludeClaimText?: string;
    mustIncludeReference?: string;
    mustIncludeMissingDataReason?: string;
  };
}

interface EvalResult {
  id: string;
  pass: boolean;
  schemaValid: boolean;
  unsupportedClaims: number;
  toolCallCount: number;
  checks: Record<string, boolean>;
  errors: string[];
}

interface EvalSummary {
  ranAt: string;
  total: number;
  passed: number;
  failed: number;
  schemaFailures: number;
  unsupportedClaims: number;
  toolCalls: number;
}

interface EvalRun {
  summary: EvalSummary;
  results: EvalResult[];
}

const KNOWN_CONDITION_ANSWER: AgentAnswer = {
  schemaVersion: "1",
  sessionId: "sess-eval-known-condition",
  connectionId: "demo-conn",
  patientId: "patient-1",
  prompt: "Summarize this patient.",
  promptVersion: "patient-summary@v0",
  summary: "Patient has documented type 2 diabetes mellitus.",
  claims: [
    {
      id: "c1",
      text: "Type 2 diabetes mellitus is documented.",
      evidence: [{ reference: "Condition/type2-diabetes" }],
    },
  ],
  missingData: [],
  cannotDetermine: [],
  toolCalls: [
    {
      tool: "searchConditionsForPatient",
      toolVersion: "1",
      ok: true,
      count: 1,
      durationMs: 10,
    },
  ],
  createdAt: "2026-05-01T00:00:00.000Z",
};

const NO_ALLERGY_DATA_ANSWER: AgentAnswer = {
  schemaVersion: "1",
  sessionId: "sess-eval-no-allergy",
  connectionId: "demo-conn",
  patientId: "patient-2",
  prompt: "Summarize this patient.",
  promptVersion: "patient-summary@v0",
  summary: "No allergy data found in retrieved resources.",
  claims: [
    {
      id: "c1",
      text: "No allergy data found in available records.",
      evidence: [{ reference: "Patient/patient-2" }],
    },
  ],
  missingData: [
    {
      description: "No AllergyIntolerance resources were returned for this patient.",
    },
  ],
  cannotDetermine: [],
  toolCalls: [
    {
      tool: "searchAllergyIntolerancesForPatient",
      toolVersion: "1",
      ok: true,
      count: 0,
      durationMs: 9,
    },
  ],
  createdAt: "2026-05-01T00:00:00.000Z",
};

const CASES: EvalCase[] = [
  {
    id: "known-condition",
    description: "Documented Type 2 diabetes includes Condition citation",
    input: KNOWN_CONDITION_ANSWER,
    expect: {
      mustIncludeClaimText: "Type 2 diabetes mellitus",
      mustIncludeReference: "Condition/type2-diabetes",
    },
  },
  {
    id: "no-allergy-data",
    description: "No allergy resources produces explicit missing-data language",
    input: NO_ALLERGY_DATA_ANSWER,
    expect: {
      mustIncludeClaimText: "No allergy data found",
      mustIncludeMissingDataReason: "No AllergyIntolerance resources",
    },
  },
];

function includesClaimText(answer: AgentAnswer, text: string): boolean {
  return answer.claims.some((claim) => claim.text.includes(text));
}

function includesReference(answer: AgentAnswer, ref: string): boolean {
  return answer.claims.some((claim) =>
    claim.evidence.some((evidence) => evidence.reference === ref),
  );
}

function includesMissingDataReason(answer: AgentAnswer, reason: string): boolean {
  return answer.missingData.some((entry) => entry.description.includes(reason));
}

function evaluateCase(evalCase: EvalCase): EvalResult {
  const parsed = parseAgentAnswer(evalCase.input);
  if (!parsed.ok) {
    return {
      id: evalCase.id,
      pass: false,
      schemaValid: false,
      unsupportedClaims: 0,
      toolCallCount: 0,
      checks: { schemaValid: false },
      errors: [parsed.error],
    };
  }

  const answer = parsed.answer;
  const checks: Record<string, boolean> = { schemaValid: true };

  if (evalCase.expect.mustIncludeClaimText) {
    checks.claimText = includesClaimText(answer, evalCase.expect.mustIncludeClaimText);
  }
  if (evalCase.expect.mustIncludeReference) {
    checks.reference = includesReference(answer, evalCase.expect.mustIncludeReference);
  }
  if (evalCase.expect.mustIncludeMissingDataReason) {
    checks.missingDataReason = includesMissingDataReason(
      answer,
      evalCase.expect.mustIncludeMissingDataReason,
    );
  }

  const pass = Object.values(checks).every(Boolean);
  return {
    id: evalCase.id,
    pass,
    schemaValid: true,
    unsupportedClaims: unsupportedClaimCount(answer.claims),
    toolCallCount: answer.toolCalls.length,
    checks,
    errors: pass ? [] : ["One or more eval checks failed"],
  };
}

function runEvals(): EvalRun {
  const results = CASES.map(evaluateCase);
  return {
    summary: {
      ranAt: new Date().toISOString(),
      total: results.length,
      passed: results.filter((result) => result.pass).length,
      failed: results.filter((result) => !result.pass).length,
      schemaFailures: results.filter((result) => !result.schemaValid).length,
      unsupportedClaims: results.reduce(
        (sum, result) => sum + result.unsupportedClaims,
        0,
      ),
      toolCalls: results.reduce((sum, result) => sum + result.toolCallCount, 0),
    },
    results,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const run = runEvals();
  console.log(JSON.stringify(run, null, 2));
  if (run.summary.failed > 0) process.exitCode = 1;
}

export { evaluateCase, runEvals, type EvalCase, type EvalRun };
