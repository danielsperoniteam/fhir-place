import type { AgentSession, DataConnection } from "../db/schema.js";
import {
  runPatientSummary,
  type RunPatientSummaryResult,
} from "../server/agent/orchestrator.js";
import { createPhaseATools } from "../server/agent/tools/index.js";
import { inMemoryLogger } from "../server/agent/tool-log.js";
import type { AnthropicMessagesCreate } from "../server/agent/model-config.js";
import {
  AgentAnswer,
  type AgentAnswer as AgentAnswerType,
} from "../src/agent/answer-schema.js";
import {
  evidenceCountsByType,
  unsupportedClaimCount,
} from "../src/agent/answer-extractors.js";
import { buildFakeFhirFetch } from "./fake-fhir.js";
import { scriptedAnthropicClient } from "./scripted-client.js";
import type {
  Assertion,
  AssertionResult,
  CaseMetrics,
  CaseResult,
  EvalCase,
  EvalRunResult,
} from "./types.js";

const FAKE_BASE_URL = "https://eval.fhir.local/baseR4";

export interface RunHarnessOptions {
  /**
   * Live mode uses a real Anthropic client. Scripted mode (default)
   * uses the case's `scriptedTrace`. The same FHIR fixture and the same
   * assertions apply to both.
   */
  mode?: "scripted" | "live";
  /** Required in live mode. Provider/model the AgentAnswer rows record. */
  liveClient?: {
    messagesCreate: AnthropicMessagesCreate;
    provider: string;
    model: string;
  };
  /** Cap on agent loop turns. Default: orchestrator default (8). */
  maxTurns?: number;
}

/**
 * Run every case in `cases` and return an `EvalRunResult`.
 *
 * Cases are run sequentially (the live mode would otherwise hammer the
 * provider). Failures of one case do not abort the run — the result
 * shape always contains every case the caller asked about.
 */
export async function runEvalSuite(
  cases: ReadonlyArray<EvalCase>,
  options: RunHarnessOptions = {},
): Promise<EvalRunResult> {
  const startedAt = new Date();
  const results: CaseResult[] = [];
  for (const c of cases) {
    results.push(await runCase(c, options));
  }
  const passed = results.filter((r) => r.passed).length;
  return {
    schemaVersion: "1",
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    mode: options.mode ?? "scripted",
    model: options.liveClient?.model ?? "scripted",
    provider: options.liveClient?.provider ?? "scripted",
    passed,
    failed: results.length - passed,
    cases: results,
  };
}

/**
 * Run a single case end-to-end, score the resulting `AgentAnswer`
 * against the case's assertions, and return a `CaseResult`. Never
 * throws — orchestrator exceptions are surfaced via `CaseResult.error`.
 */
export async function runCase(
  c: EvalCase,
  options: RunHarnessOptions = {},
): Promise<CaseResult> {
  const t0 = Date.now();
  const session: AgentSession = {
    id: `eval-sess-${c.id}`,
    connectionId: "eval-conn",
    patientId: c.patient.id,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const connection: DataConnection = {
    id: "eval-conn",
    name: "eval",
    kind: "fhir_clinical",
    baseUrl: FAKE_BASE_URL,
    authType: "none",
    authToken: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    lastCapabilityAt: null,
    lastCapabilityStatus: null,
    lastCapabilityFhirVersion: null,
    lastCapabilitySoftware: null,
    lastCapabilityJson: null,
    lastCapabilityError: null,
  };

  const fakeFetch = buildFakeFhirFetch({
    baseUrl: FAKE_BASE_URL,
    patientId: c.patient.id,
    bundle: c.bundle,
  });

  let messagesCreate: AnthropicMessagesCreate;
  let provider = "scripted";
  let model = "scripted";
  if (options.mode === "live") {
    if (!options.liveClient) {
      // `runCase` is contractually never-throws (see `runEvalSuite`'s
      // sequential per-case loop). A misconfigured live invocation
      // surfaces as a structured failure on this case rather than
      // aborting the whole suite.
      return {
        id: c.id,
        description: c.description,
        passed: false,
        durationMs: Date.now() - t0,
        metrics: emptyMetrics(),
        assertions: [
          {
            kind: "schemaValid",
            passed: false,
            message:
              "live mode requires options.liveClient — pass a configured Anthropic client",
          },
        ],
        error: "live mode requires options.liveClient",
      };
    }
    messagesCreate = options.liveClient.messagesCreate;
    provider = options.liveClient.provider;
    model = options.liveClient.model;
  } else {
    const scripted = scriptedAnthropicClient(c.scriptedTrace);
    messagesCreate = scripted.messagesCreate as AnthropicMessagesCreate;
  }

  let result: RunPatientSummaryResult | null = null;
  let runError: string | undefined;
  try {
    result = await runPatientSummary(
      {
        registry: createPhaseATools(),
        messagesCreate,
        model,
        provider,
        fetchFn: fakeFetch,
        logger: inMemoryLogger(),
        ...(options.maxTurns !== undefined ? { maxTurns: options.maxTurns } : {}),
        now: () => new Date(0).toISOString(),
      },
      {
        prompt: c.prompt,
        session,
        connection,
      },
    );
  } catch (e) {
    runError = e instanceof Error ? e.message : String(e);
  }

  if (!result) {
    return {
      id: c.id,
      description: c.description,
      passed: false,
      durationMs: Date.now() - t0,
      metrics: emptyMetrics(),
      assertions: [
        {
          kind: "schemaValid",
          passed: false,
          message: `harness threw: ${runError ?? "unknown error"}`,
        },
      ],
      error: runError,
    };
  }

  const metrics = computeMetrics(result);
  const assertionResults = c.assertions.map((a) => evaluate(a, result, metrics));
  const passed = assertionResults.every((r) => r.passed);

  return {
    id: c.id,
    description: c.description,
    passed,
    durationMs: Date.now() - t0,
    metrics,
    assertions: assertionResults,
  };
}

function computeMetrics(result: RunPatientSummaryResult): CaseMetrics {
  const schemaValid = AgentAnswer.safeParse(result.answer).success;
  // The orchestrator only ever returns schema-valid answers; if this is
  // ever false, something has drifted and the metric will catch it.
  const counts = evidenceCountsByType(result.answer);
  return {
    turns: result.turns,
    fallback: result.fallback,
    toolCallCount: result.toolEnvelopes.length,
    schemaValid,
    unsupportedClaimCount: unsupportedClaimCount(result.answer.claims),
    evidenceCountsByType: counts as Record<string, number>,
  };
}

function emptyMetrics(): CaseMetrics {
  return {
    turns: 0,
    fallback: true,
    toolCallCount: 0,
    schemaValid: false,
    unsupportedClaimCount: 0,
    evidenceCountsByType: {
      Patient: 0,
      Condition: 0,
      MedicationRequest: 0,
      AllergyIntolerance: 0,
      Encounter: 0,
      Observation: 0,
    },
  };
}

function evaluate(
  a: Assertion,
  result: RunPatientSummaryResult,
  metrics: CaseMetrics,
): AssertionResult {
  const ans = result.answer;
  switch (a.kind) {
    case "cites": {
      const found = ans.claims.some((c) =>
        c.evidence.some((e) => e.reference === a.reference),
      );
      return mk(a, found, `cites ${a.reference}`);
    }
    case "missingDataMatches": {
      const found = ans.missingData.some((m) => a.pattern.test(m.description));
      return mk(
        a,
        found,
        `missingData[] matches ${a.pattern.toString()}`,
      );
    }
    case "cannotDetermineMatches": {
      const found = ans.cannotDetermine.some(
        (c) => a.pattern.test(c.why) || a.pattern.test(c.question),
      );
      return mk(
        a,
        found,
        `cannotDetermine[] matches ${a.pattern.toString()}`,
      );
    }
    case "noCannotDetermineMatches": {
      const offending = ans.cannotDetermine.find(
        (c) => a.pattern.test(c.why) || a.pattern.test(c.question),
      );
      return mk(
        a,
        !offending,
        offending
          ? `no cannotDetermine[] should match ${a.pattern.toString()}; offending question="${offending.question}"`
          : `no cannotDetermine[] matches ${a.pattern.toString()}`,
      );
    }
    case "noClaimMatches": {
      const offending = ans.claims.find((c) => a.pattern.test(c.text));
      return mk(
        a,
        !offending,
        offending
          ? `no claim should match ${a.pattern.toString()}; offending claim id=${offending.id}`
          : `no claim matches ${a.pattern.toString()}`,
      );
    }
    case "fallback":
      return mk(
        a,
        result.fallback === a.expected,
        `fallback === ${a.expected}`,
      );
    case "schemaValid":
      return mk(a, metrics.schemaValid, "AgentAnswer schema-valid");
    case "unsupportedClaimCount":
      return mk(
        a,
        metrics.unsupportedClaimCount === a.expected,
        `unsupportedClaimCount === ${a.expected} (got ${metrics.unsupportedClaimCount})`,
      );
    case "toolCallCount": {
      const n = metrics.toolCallCount;
      let ok = true;
      const parts: string[] = [];
      if (a.exact !== undefined) {
        ok = ok && n === a.exact;
        parts.push(`exact ${a.exact}`);
      }
      if (a.min !== undefined) {
        ok = ok && n >= a.min;
        parts.push(`min ${a.min}`);
      }
      if (a.max !== undefined) {
        ok = ok && n <= a.max;
        parts.push(`max ${a.max}`);
      }
      return mk(
        a,
        ok,
        `toolCallCount ${parts.join(", ")} (got ${n})`,
      );
    }
  }
}

function mk(a: Assertion, passed: boolean, base: string): AssertionResult {
  const desc = a.description ? ` — ${a.description}` : "";
  return { kind: a.kind, passed, message: `${base}${desc}` };
}

// `AgentAnswerType` is exported for case authors who want to type-check
// their finalize bodies against the live schema.
export type { AgentAnswerType };
