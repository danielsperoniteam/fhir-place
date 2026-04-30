import { Hono } from "hono";
import type { ConnectionStore } from "./services/connection-store.js";
import type { SessionStore } from "./services/session-store.js";
import type { ToolRegistry } from "./agent/registry.js";
import type { ToolLogger } from "./agent/tool-log.js";
import { connectionsRoutes } from "./routes/connections.js";
import { fhirRoutes } from "./routes/fhir.js";
import { sessionsRoutes } from "./routes/sessions.js";

export interface ServerDeps {
  connections: ConnectionStore;
  sessions: SessionStore;
  registry: ToolRegistry;
  fetchFn?: typeof fetch;
  logger?: ToolLogger;
}

export function createApp(deps: ServerDeps) {
  const app = new Hono();

  app.get("/api/health", (c) =>
    c.json({ ok: true, app: "fhir-place/workbench", phase: "A" }),
  );

  app.route("/api/connections", connectionsRoutes(deps.connections));
  app.route(
    "/api/connections/:cid/fhir",
    fhirRoutes({ store: deps.connections, fetchFn: deps.fetchFn }),
  );
  app.route(
    "/api/sessions",
    sessionsRoutes({
      sessions: deps.sessions,
      connections: deps.connections,
      registry: deps.registry,
      fetchFn: deps.fetchFn,
      logger: deps.logger,
    }),
  );

  return app;
}
