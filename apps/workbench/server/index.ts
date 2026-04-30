import { serve } from "@hono/node-server";
import { openDb } from "../db/client.js";
import { createApp } from "./app.js";
import { createConnectionStore } from "./services/connection-store.js";
import { createSessionStore } from "./services/session-store.js";
import { createPhaseATools } from "./agent/tools/index.js";
import { consoleLogger } from "./agent/tool-log.js";

const port = Number(process.env.WORKBENCH_PORT ?? 5175);
const db = openDb();
const connections = createConnectionStore(db);
const sessions = createSessionStore(db);
const registry = createPhaseATools();

const app = createApp({
  connections,
  sessions,
  registry,
  logger: consoleLogger(),
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`workbench server listening on http://127.0.0.1:${info.port}`);
});
