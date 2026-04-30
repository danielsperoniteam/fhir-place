import { Hono } from "hono";
import { z } from "zod";
import type { ConnectionStore } from "../services/connection-store.js";
import type { SessionStore } from "../services/session-store.js";
import type { ToolRegistry } from "../agent/registry.js";
import type { ToolLogger } from "../agent/tool-log.js";
import { ConnectionId } from "../schemas.js";

const CreateSessionInput = z.object({
  connectionId: ConnectionId,
  patientId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9\-.]{1,64}$/, "invalid FHIR id"),
});

interface Deps {
  sessions: SessionStore;
  connections: ConnectionStore;
  registry: ToolRegistry;
  fetchFn?: typeof fetch;
  logger?: ToolLogger;
}

export function sessionsRoutes(deps: Deps) {
  const app = new Hono();

  app.get("/", (c) => c.json({ sessions: deps.sessions.list() }));

  app.get("/tools", (c) => c.json({ tools: deps.registry.list() }));

  app.post("/", async (c) => {
    const body = await safeJson(c);
    const parsed = CreateSessionInput.safeParse(body);
    if (!parsed.success) {
      return jsonBody(400, {
        error: "invalid_input",
        issues: parsed.error.issues,
      });
    }
    const conn = deps.connections.getInternal(parsed.data.connectionId);
    if (!conn) return jsonBody(404, { error: "connection_not_found" });

    const session = deps.sessions.create(parsed.data);
    return jsonBody(201, { session });
  });

  app.get("/:sid", (c) => {
    const sid = c.req.param("sid");
    if (!sid) return jsonBody(404, { error: "session_not_found" });
    const session = deps.sessions.get(sid);
    if (!session) return jsonBody(404, { error: "session_not_found" });
    return jsonBody(200, { session });
  });

  app.delete("/:sid", (c) => {
    const sid = c.req.param("sid");
    if (!sid) return jsonBody(404, { error: "session_not_found" });
    return deps.sessions.delete(sid)
      ? new Response(null, { status: 204 })
      : jsonBody(404, { error: "session_not_found" });
  });

  app.post("/:sid/tools/:toolName", async (c) => {
    const sid = c.req.param("sid");
    const toolName = c.req.param("toolName");
    if (!sid || !toolName) {
      return jsonBody(404, { error: "not_found" });
    }
    const session = deps.sessions.get(sid);
    if (!session) return jsonBody(404, { error: "session_not_found" });

    const conn = deps.connections.getInternal(session.connectionId);
    if (!conn) return jsonBody(404, { error: "connection_not_found" });

    const rawInput = (await safeJson(c)) ?? {};

    const envelope = await deps.registry.run({
      toolName,
      rawInput,
      session,
      connection: conn,
      fetchFn: deps.fetchFn,
      logger: deps.logger,
    });

    // The envelope is itself the body; HTTP status mirrors error reason so
    // the agent / UI can treat 4xx/5xx generically while the envelope's
    // `reason` field stays the source of truth for branching.
    const status = envelope.ok
      ? 200
      : envelope.reason === "unknown_tool"
        ? 404
        : envelope.reason === "invalid_input"
          ? 400
          : envelope.reason === "unauthorized_patient"
            ? 403
            : envelope.reason === "session_not_found" ||
                envelope.reason === "connection_not_found"
              ? 404
              : envelope.reason === "timeout"
                ? 504
                : 502;
    return jsonBody(status, envelope);
  });

  return app;
}

import type { Context } from "hono";

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
