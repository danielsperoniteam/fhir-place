/**
 * Anthropic agent loop. Wraps `messages.create` calls into a tool-use loop
 * bounded by step count, wallclock, and cost ceilings. The terminal tool is
 * `report_outcome`; any other path out of the loop is recorded as a stop
 * reason so the runner can decide what to do.
 */

import Anthropic from "@anthropic-ai/sdk";
import { CostMeter } from "./cost.js";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "./tools.js";
import type { Outcome, OutcomeStatus, StepRecord, TaskDef } from "./types.js";

const SYSTEM_PROMPT = `You are an exploratory QA agent driving a real Chromium browser against a deployed React/FHIR PHR demo app.

The app is configured to talk to the SMART Health IT public R4 server (https://r4.smarthealthit.org). Real network, real data — patients and resources are Synthea-generated and may shift over time. Assert *behavior and structure*, not specific data values.

Routing uses HashRouter, so URLs look like '#/Patient', '#/Patient/<id>', '#/AllergyIntolerance', etc. Stay within the app — never navigate off-domain.

How to work:
1. Start with read_page({mode: 'testids'}) to learn what's on the current screen.
2. Prefer testid selectors over text. The app uses data-testid liberally (patient-row, compartment-links, resource-search, etc.).
3. Take a screenshot only when you need vision to disambiguate or when reporting a suspected bug as evidence.
4. Be decisive. If you can verify the goal in 5 steps, don't take 20.
5. When done, call report_outcome exactly once. Do not call any other tool after report_outcome.

Status guide:
- success: the goal was achievable and the app behaved correctly
- blocked: you could not reach a verdict (data missing, server flaky, navigation didn't load)
- bug-suspected: the app behaved incorrectly (errors, broken UI, wrong data flow). Include evidence steps.`;

export interface DriverConfig {
  apiKey: string;
  model: string;
  maxSteps: number;
  wallclockMs: number;
  costCeilingUsd: number;
}

export interface DriverResult {
  outcome: Outcome | null;
  finalStatus: OutcomeStatus;
  stopReason:
    | "agent-reported"
    | "max-steps"
    | "wallclock"
    | "cost-ceiling"
    | "error";
  steps: StepRecord[];
  cost: { inputTokens: number; outputTokens: number; estimatedUsd: number };
  errorMessage?: string;
}

export async function runAgent(
  task: TaskDef,
  toolCtx: ToolContext,
  cfg: DriverConfig,
): Promise<DriverResult> {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const meter = new CostMeter();
  const steps: StepRecord[] = [];
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Task ID: ${task.id}\n\nGoal: ${task.goal}${
            task.successHints?.length
              ? `\n\nSuccess hints:\n- ${task.successHints.join("\n- ")}`
              : ""
          }`,
        },
      ],
    },
  ];

  const startedAt = Date.now();
  const maxSteps = task.maxSteps ?? cfg.maxSteps;

  let outcome: Outcome | null = null;
  let stopReason: DriverResult["stopReason"] = "max-steps";
  let errorMessage: string | undefined;

  for (let step = 0; step < maxSteps; step++) {
    if (Date.now() - startedAt > cfg.wallclockMs) {
      stopReason = "wallclock";
      break;
    }
    if (meter.estimatedUsd() > cfg.costCeilingUsd) {
      stopReason = "cost-ceiling";
      break;
    }

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: cfg.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
        messages,
      });
    } catch (err) {
      stopReason = "error";
      errorMessage = err instanceof Error ? err.message : String(err);
      break;
    }

    meter.record({
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      // Model stopped without calling a tool — treat as blocked.
      stopReason = "agent-reported";
      outcome = {
        status: "blocked",
        summary:
          "Agent ended without calling report_outcome (no tool use in final turn).",
      };
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let terminal = false;

    for (const use of toolUses) {
      const input = (use.input ?? {}) as Record<string, unknown>;

      if (terminal) {
        // report_outcome already fired this turn. Anthropic requires a
        // tool_result for every tool_use we acknowledge, so reply with a
        // skip notice and record the skipped call so the trace is honest.
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: "Skipped: report_outcome already called; run is terminal.",
        });
        steps.push({
          index: steps.length,
          toolName: use.name,
          input,
          output: { ok: false, error: "skipped: post-report_outcome" },
          durationMs: 0,
        });
        continue;
      }

      if (use.name === "report_outcome") {
        outcome = {
          status: input.status as OutcomeStatus,
          summary: String(input.summary ?? ""),
          evidenceSteps: Array.isArray(input.evidenceSteps)
            ? (input.evidenceSteps as string[])
            : undefined,
        };
        stopReason = "agent-reported";
        terminal = true;
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: "Outcome recorded.",
        });
        continue;
      }

      const stepStart = Date.now();
      const result = await executeTool(use.name, input, toolCtx);
      steps.push({
        index: steps.length,
        toolName: use.name,
        input,
        output: result,
        durationMs: Date.now() - stepStart,
      });
      toolResults.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: JSON.stringify(result).slice(0, 4_000),
        is_error: !result.ok,
      });
    }

    messages.push({ role: "user", content: toolResults });

    if (terminal) break;
  }

  return {
    outcome,
    finalStatus: outcome?.status ?? "blocked",
    stopReason,
    steps,
    cost: meter.snapshot(),
    errorMessage,
  };
}
