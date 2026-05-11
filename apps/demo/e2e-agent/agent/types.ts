/**
 * Type definitions for the LLM-agent browser harness.
 *
 * The harness lives alongside `apps/demo/e2e/` and `apps/demo/e2e-live/` but
 * is intentionally separate: deterministic Playwright suites use Playwright's
 * test runner, while this harness drives a single-task LLM loop and needs
 * different timeout/reporter semantics.
 */

export type Selector =
  | { testid: string; nth?: number }
  | { role: string; name?: string; nth?: number }
  | { text: string; nth?: number };

export interface TaskDef {
  id: string;
  goal: string;
  successHints?: string[];
  postChecks?: {
    noConsoleErrors?: boolean;
    noFailedNetwork5xx?: boolean;
    mustVisitRoute?: string;
  };
  mutatesData?: boolean;
  maxSteps?: number;
}

export type OutcomeStatus = "success" | "blocked" | "bug-suspected";

export interface Outcome {
  status: OutcomeStatus;
  summary: string;
  evidenceSteps?: string[];
}

export interface RunReport {
  taskId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  baseUrl: string;
  fhirBaseUrl: string;
  agentOutcome: Outcome | null;
  finalStatus: OutcomeStatus;
  stopReason:
    | "agent-reported"
    | "max-steps"
    | "wallclock"
    | "cost-ceiling"
    | "error";
  steps: StepRecord[];
  consoleErrors: string[];
  failedRequests: { url: string; status: number; method: string }[];
  visitedUrls: string[];
  cost: { inputTokens: number; outputTokens: number; estimatedUsd: number };
  errorMessage?: string;
}

export interface StepRecord {
  index: number;
  toolName: string;
  input: unknown;
  output: { ok: boolean; result?: unknown; error?: string };
  durationMs: number;
}
