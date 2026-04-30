import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { ConnectionStore } from "../services/connection-store.js";
import type { SessionStore } from "../services/session-store.js";
import type { ToolRegistry } from "../agent/registry.js";
import type { ToolLogger } from "../agent/tool-log.js";
import type { ModelConfig } from "../agent/model-config.js";
import { runPatientSummary } from "../agent/orchestrator.js";
import {
  PHASE_A_PROMPT_VERSION,
  STANDARD_PATIENT_SUMMARY_PROMPT,
  SUGGESTED_PROMPTS,
} from "../agent/prompts.js";

const RunAnswerInput = z.object({
  prompt: z.string().min(1).max(2000).optional(),
  /** Override default maxTurns / maxTokens for testing. */
  maxTurns: z.number().int().min(1).max(32).optional(),
  maxTokens: z.number().int().min(256).max(16000).optional(),
});

interface Deps {
  sessions: SessionStore;
  connections: ConnectionStore;
  registry: ToolRegistry;
  fetchFn?: typeof fetch;
  logger?: ToolLogger;
  /** When null, /api/sessions/:sid/answer returns 503. */
  modelConfig: ModelConfig | null;
}

/**
 * Mounts at `/api/sessions/:sid/answer`. Only the `answer` sub-path is
 * registered, so this can be `app.route()`d alongside the existing
 * sessionsRoutes without colliding on `/:sid` or `/:sid/tools/:toolName`.
 */
export function answersRoutes(deps: Deps) {
  const app = new Hono();

  app.post("/:sid/answer", async (c) => {
    if (!deps.modelConfig) {
      return jsonBody(503, {
        error: "agent_unavailable",
        hint:
          "ANTHROPIC_API_KEY is not configured. Set it in the workbench " +
          "server's environment to enable the patient-summary agent. The " +
          "rest of the workbench (patient search, FHIR proxy, tool runner) " +
          "remains usable without it.",
      });
    }

    const sid = c.req.param("sid");
    if (!sid) return jsonBody(404, { error: "session_not_found" });

    const session = deps.sessions.get(sid);
    if (!session) return jsonBody(404, { error: "session_not_found" });

    const conn = deps.connections.getInternal(session.connectionId);
    if (!conn) return jsonBody(404, { error: "connection_not_found" });

    const body = await safeJson(c);
    const parsed = RunAnswerInput.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonBody(400, {
        error: "invalid_input",
        issues: parsed.error.issues,
      });
    }

    try {
      const result = await runPatientSummary(
        {
          registry: deps.registry,
          messagesCreate: deps.modelConfig.messagesCreate,
          model: deps.modelConfig.model,
          provider: deps.modelConfig.provider,
          fetchFn: deps.fetchFn,
          logger: deps.logger,
          ...(parsed.data.maxTurns !== undefined
            ? { maxTurns: parsed.data.maxTurns }
            : {}),
          ...(parsed.data.maxTokens !== undefined
            ? { maxTokens: parsed.data.maxTokens }
            : {}),
        },
        {
          prompt: parsed.data.prompt ?? STANDARD_PATIENT_SUMMARY_PROMPT,
          session,
          connection: conn,
        },
      );
      return jsonBody(200, {
        answer: result.answer,
        turns: result.turns,
        fallback: result.fallback,
        ...(result.finalIssues ? { finalIssues: result.finalIssues } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonBody(502, { error: "model_provider_error", detail: message });
    }
  });

  return app;
}

/**
 * Separate router for `/api/agent/*` so the status check doesn't collide
 * with `sessionsRoutes`'s `/:sid` wildcard.
 */
export function agentInfoRoutes(deps: Pick<Deps, "modelConfig">) {
  const app = new Hono();

  app.get("/status", (c) =>
    c.json({
      ready: deps.modelConfig !== null,
      provider: deps.modelConfig?.provider ?? null,
      model: deps.modelConfig?.model ?? null,
      promptVersion: PHASE_A_PROMPT_VERSION,
      suggestedPrompts: SUGGESTED_PROMPTS,
      hint:
        deps.modelConfig === null
          ? "Set ANTHROPIC_API_KEY in the server's environment to enable the agent."
          : null,
    }),
  );

  return app;
}

async function safeJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function jsonBody(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
