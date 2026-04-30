import type Anthropic from "@anthropic-ai/sdk";
import type { AgentSession, DataConnection } from "../../db/schema.js";
import {
  AgentAnswer,
  type AgentAnswer as AgentAnswerType,
  type ToolCallSummary,
} from "../../src/agent/answer-schema.js";
import type { ToolEnvelope } from "./envelope.js";
import type { ToolRegistry } from "./registry.js";
import type { ToolLogger } from "./tool-log.js";
import type { AnthropicMessagesCreate } from "./model-config.js";
import { ALL_TOOLS, FINALIZE_TOOL } from "./anthropic-tools.js";
import {
  PHASE_A_PROMPT_VERSION,
  patientSummarySystemPrompt,
} from "./prompts.js";

export interface OrchestratorDeps {
  registry: ToolRegistry;
  messagesCreate: AnthropicMessagesCreate;
  model: string;
  provider: string;
  fetchFn?: typeof fetch;
  logger?: ToolLogger;
  /** Hard ceiling on agent loop iterations (each = 1 model call). Default 8. */
  maxTurns?: number;
  /** Hard ceiling on output tokens per call. Default 4000. */
  maxTokens?: number;
  /** Injected for deterministic timestamps in tests. */
  now?: () => string;
}

export interface RunPatientSummaryArgs {
  prompt: string;
  session: AgentSession;
  connection: DataConnection;
}

export interface RunPatientSummaryResult {
  answer: AgentAnswerType;
  /** Number of model calls made (≤ `maxTurns`). */
  turns: number;
  /** True if the orchestrator built a partial answer because the model exhausted its turns or returned an unrecoverable shape. */
  fallback: boolean;
  /** Tool-call envelopes captured during the run, in call order. */
  toolEnvelopes: ToolEnvelope[];
  /** Validation issues, if the final shape fell back to the schema-fail path. */
  finalIssues?: unknown;
}

const DEFAULT_MAX_TURNS = 8;
const DEFAULT_MAX_TOKENS = 4000;

/**
 * The patient-summary agent loop.
 *
 * Contract:
 *   - The model can ONLY call the typed tool registry (PR 4) plus the
 *     `finalize` tool. Any other tool name is rejected with a tool_result
 *     marked `is_error: true` so the model can correct itself.
 *   - Loop ends on `finalize` (with a schema-valid input), on
 *     `stop_reason: "end_turn"` without a finalize call (model gave up
 *     mid-loop — partial-answer fallback), or on `maxTurns` exhaustion.
 *   - Resource text from tool results NEVER reaches the system position;
 *     it is wrapped in `<resource_data>...</resource_data>` and given
 *     to the model as a `user` tool_result. The model is instructed in
 *     the system prompt that anything inside that wrapper is data, not
 *     instruction.
 *   - A `finalize` payload that fails AgentAnswer validation gets ONE
 *     retry — the orchestrator returns an `is_error` tool_result with
 *     the issues. After that, fall back to a partial answer.
 */
export async function runPatientSummary(
  deps: OrchestratorDeps,
  args: RunPatientSummaryArgs,
): Promise<RunPatientSummaryResult> {
  const maxTurns = deps.maxTurns ?? DEFAULT_MAX_TURNS;
  const maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;
  const now = deps.now ?? (() => new Date().toISOString());
  const toolEnvelopes: ToolEnvelope[] = [];

  const systemPrompt = patientSummarySystemPrompt({
    patientId: args.session.patientId,
  });

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: args.prompt },
  ];

  let turns = 0;
  let finalizeRetriesLeft = 1;
  let lastFinalizeIssues: unknown;

  while (turns < maxTurns) {
    turns += 1;

    const response = await deps.messagesCreate({
      model: deps.model,
      max_tokens: maxTokens,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: ALL_TOOLS as Anthropic.Tool[],
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      // The model decided to stop without finalizing (`end_turn`,
      // `max_tokens`, refusal, etc.). Build a partial answer.
      return {
        answer: buildFallbackAnswer({
          prompt: args.prompt,
          session: args.session,
          provider: deps.provider,
          model: deps.model,
          toolEnvelopes,
          reason: `model stopped with stop_reason=${response.stop_reason} before calling finalize`,
          createdAt: now(),
        }),
        turns,
        fallback: true,
        toolEnvelopes,
      };
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let finalizedAnswer: AgentAnswerType | null = null;
    let finalizeFailureForThisTurn = false;

    for (const tu of toolUses) {
      if (tu.name === FINALIZE_TOOL.name) {
        const parsed = AgentAnswer.safeParse(
          buildAgentAnswerFromFinalize({
            input: tu.input,
            prompt: args.prompt,
            session: args.session,
            provider: deps.provider,
            model: deps.model,
            toolEnvelopes,
            createdAt: now(),
          }),
        );
        if (parsed.success) {
          finalizedAnswer = parsed.data;
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: "ok",
          });
        } else {
          lastFinalizeIssues = parsed.error.issues;
          finalizeFailureForThisTurn = true;
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            is_error: true,
            content: JSON.stringify({
              error: "AgentAnswer schema validation failed",
              hint:
                finalizeRetriesLeft > 0
                  ? "You may retry `finalize` once with a corrected payload."
                  : "Retry budget exhausted. The orchestrator will fall back to a partial answer.",
              issues: parsed.error.issues,
            }),
          });
        }
        continue;
      }

      const envelope = await deps.registry.run({
        toolName: tu.name,
        rawInput: tu.input,
        session: args.session,
        connection: args.connection,
        fetchFn: deps.fetchFn,
        logger: deps.logger,
      });
      toolEnvelopes.push(envelope);

      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        is_error: !envelope.ok,
        content: wrapResourceData(envelope),
      });
    }

    if (finalizedAnswer) {
      return {
        answer: finalizedAnswer,
        turns,
        fallback: false,
        toolEnvelopes,
      };
    }

    if (finalizeFailureForThisTurn) {
      finalizeRetriesLeft -= 1;
      if (finalizeRetriesLeft < 0) {
        return {
          answer: buildFallbackAnswer({
            prompt: args.prompt,
            session: args.session,
            provider: deps.provider,
            model: deps.model,
            toolEnvelopes,
            reason:
              "model produced a finalize payload that failed AgentAnswer validation twice",
            createdAt: now(),
          }),
          turns,
          fallback: true,
          toolEnvelopes,
          finalIssues: lastFinalizeIssues,
        };
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    answer: buildFallbackAnswer({
      prompt: args.prompt,
      session: args.session,
      provider: deps.provider,
      model: deps.model,
      toolEnvelopes,
      reason: `agent exhausted maxTurns=${maxTurns} without calling finalize`,
      createdAt: now(),
    }),
    turns,
    fallback: true,
    toolEnvelopes,
  };
}

/**
 * Wrap a tool envelope's payload so the model sees data inside an
 * unambiguous container. The system prompt explicitly tells the model
 * that anything inside `<resource_data>` is patient or system data,
 * never instructions.
 */
function wrapResourceData(envelope: ToolEnvelope): string {
  return [
    `<tool_envelope tool="${envelope.tool}@${envelope.toolVersion}" ok="${envelope.ok}" duration_ms="${envelope.durationMs}">`,
    "<resource_data>",
    JSON.stringify(envelope, null, 0),
    "</resource_data>",
    "</tool_envelope>",
  ].join("\n");
}

interface BuildAgentAnswerArgs {
  prompt: string;
  session: AgentSession;
  provider: string;
  model: string;
  toolEnvelopes: ToolEnvelope[];
  createdAt: string;
}

function buildAgentAnswerFromFinalize(
  args: BuildAgentAnswerArgs & { input: unknown },
): unknown {
  const input =
    typeof args.input === "object" && args.input !== null
      ? (args.input as Record<string, unknown>)
      : {};
  return {
    schemaVersion: "1",
    sessionId: args.session.id,
    connectionId: args.session.connectionId,
    patientId: args.session.patientId,
    prompt: args.prompt,
    promptVersion: PHASE_A_PROMPT_VERSION,
    provider: args.provider,
    model: args.model,
    summary: input["summary"],
    claims: input["claims"] ?? [],
    missingData: input["missingData"] ?? [],
    cannotDetermine: input["cannotDetermine"] ?? [],
    toolCalls: summariseEnvelopes(args.toolEnvelopes),
    createdAt: args.createdAt,
  };
}

function buildFallbackAnswer(
  args: BuildAgentAnswerArgs & { reason: string },
): AgentAnswerType {
  // The fallback answer is itself schema-valid: zero claims (no evidence
  // claimed → trivially satisfies the .min(1) per claim because no
  // claims exist), one cannotDetermine entry that explains why.
  const fallback: AgentAnswerType = {
    schemaVersion: "1",
    sessionId: args.session.id,
    connectionId: args.session.connectionId,
    patientId: args.session.patientId,
    prompt: args.prompt,
    promptVersion: PHASE_A_PROMPT_VERSION,
    provider: args.provider,
    model: args.model,
    summary:
      "Partial answer: the agent did not produce a validated final answer.",
    claims: [],
    missingData: [],
    cannotDetermine: [
      {
        question: args.prompt,
        why: args.reason,
      },
    ],
    toolCalls: summariseEnvelopes(args.toolEnvelopes),
    createdAt: args.createdAt,
  };
  // Defensive parse: if any field above ever drifts, fail loudly in tests.
  return AgentAnswer.parse(fallback);
}

function summariseEnvelopes(
  envelopes: ReadonlyArray<ToolEnvelope>,
): ToolCallSummary[] {
  return envelopes.map((env) => {
    const data = env.ok ? env.data : null;
    const ids = collectResourceIds(data);
    return {
      tool: env.tool,
      toolVersion: env.toolVersion,
      ok: env.ok,
      ...(env.ok ? {} : { reason: env.reason }),
      ...(env.ok && typeof env.count === "number" ? { count: env.count } : {}),
      ...(env.ok && typeof env.truncated === "boolean"
        ? { truncated: env.truncated }
        : {}),
      durationMs: env.durationMs,
      ...(ids.length > 0 ? { resourceIds: ids } : {}),
    } satisfies ToolCallSummary;
  });
}

function collectResourceIds(data: unknown): string[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data
      .map((item) => extractRef(item))
      .filter((ref): ref is string => Boolean(ref));
  }
  const ref = extractRef(data);
  return ref ? [ref] : [];
}

function extractRef(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const o = item as { resourceType?: unknown; id?: unknown };
  if (typeof o.resourceType !== "string" || typeof o.id !== "string") {
    return null;
  }
  return `${o.resourceType}/${o.id}`;
}
