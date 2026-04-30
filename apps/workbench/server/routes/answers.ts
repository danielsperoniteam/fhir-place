import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { ConnectionStore } from "../services/connection-store.js";
import type { SessionStore } from "../services/session-store.js";
import type { AuditStore } from "../services/audit-store.js";
import type { ToolRegistry } from "../agent/registry.js";
import {
  inMemoryLogger,
  scopeLoggerToAnswer,
  teeLogger,
  type ToolLogger,
} from "../agent/tool-log.js";
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
  audit: AuditStore;
  registry: ToolRegistry;
  fetchFn?: typeof fetch;
  logger?: ToolLogger;
  /** When null, /api/sessions/:sid/answer returns 503. */
  modelConfig: ModelConfig | null;
  generateAnswerId?: () => string;
  now?: () => string;
}

/**
 * Mounts at `/api/sessions/:sid/...`. Hosts the agent endpoint and the
 * audit-log GETs. Mounted alongside `sessionsRoutes` and does not
 * collide on `/:sid` or `/:sid/tools/:toolName`.
 */
export function answersRoutes(deps: Deps) {
  const app = new Hono();
  const generateId = deps.generateAnswerId ?? defaultId;
  const now = deps.now ?? (() => new Date().toISOString());

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

    // Buffer tool calls in memory during the loop, then bulk-insert
    // them after `agent_answer` is written (FK ordering: SQLite has
    // `PRAGMA foreign_keys = ON` so a tool_call.answer_id insert
    // before the agent_answer row would fail).
    const answerId = generateId();
    const buffer = inMemoryLogger();
    const baseLogger: ToolLogger = deps.logger
      ? teeLogger(deps.logger, buffer)
      : buffer;
    const scopedLogger = scopeLoggerToAnswer(baseLogger, answerId);

    try {
      const result = await runPatientSummary(
        {
          registry: deps.registry,
          messagesCreate: deps.modelConfig.messagesCreate,
          model: deps.modelConfig.model,
          provider: deps.modelConfig.provider,
          fetchFn: deps.fetchFn,
          logger: scopedLogger,
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

      deps.audit.persistAnswer(
        {
          answerId,
          sessionId: session.id,
          prompt: parsed.data.prompt ?? STANDARD_PATIENT_SUMMARY_PROMPT,
          promptVersion: PHASE_A_PROMPT_VERSION,
          provider: deps.modelConfig.provider,
          model: deps.modelConfig.model,
          fallback: result.fallback,
          turns: result.turns,
          answer: result.answer,
          ...(result.finalIssues !== undefined
            ? { finalIssues: result.finalIssues }
            : {}),
          createdAt: now(),
        },
        buffer.entries,
      );

      return jsonBody(200, {
        answerId,
        answer: result.answer,
        turns: result.turns,
        fallback: result.fallback,
        ...(result.finalIssues ? { finalIssues: result.finalIssues } : {}),
      });
    } catch (error) {
      // Preserve any tool calls that executed before the throw —
      // otherwise failure scenarios produce silent gaps in the audit
      // log. Detach them from the (never-written) agent_answer row
      // and persist as standalone, matching the debug-runner path.
      for (const entry of buffer.entries) {
        const { answerId: _drop, ...detached } = entry;
        deps.audit.recordToolCall(detached);
      }
      const message = error instanceof Error ? error.message : String(error);
      return jsonBody(502, { error: "model_provider_error", detail: message });
    }
  });

  app.get("/:sid/answers", (c) => {
    const sid = c.req.param("sid");
    if (!sid) return jsonBody(404, { error: "session_not_found" });
    if (!deps.sessions.get(sid))
      return jsonBody(404, { error: "session_not_found" });
    return jsonBody(200, { answers: deps.audit.listAnswers(sid) });
  });

  app.get("/:sid/answers/:aid", (c) => {
    const sid = c.req.param("sid");
    const aid = c.req.param("aid");
    if (!sid || !aid)
      return jsonBody(404, { error: "answer_not_found" });
    const session = deps.sessions.get(sid);
    if (!session) return jsonBody(404, { error: "session_not_found" });
    const detail = deps.audit.getAnswer(aid);
    if (!detail || detail.sessionId !== sid)
      return jsonBody(404, { error: "answer_not_found" });
    return jsonBody(200, detail);
  });

  app.get("/:sid/audit", (c) => {
    const sid = c.req.param("sid");
    if (!sid) return jsonBody(404, { error: "session_not_found" });
    const session = deps.sessions.get(sid);
    if (!session) return jsonBody(404, { error: "session_not_found" });
    const exp = deps.audit.exportSession({
      sessionId: session.id,
      connectionId: session.connectionId,
      patientId: session.patientId,
    });
    // Add a Content-Disposition so the UI's "Export" button can
    // browser-download the JSON without an extra wrapper.
    const filename = `workbench-session-${session.id}.json`;
    return new Response(JSON.stringify(exp, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
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

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `ans_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
