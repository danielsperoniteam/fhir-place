import { serve } from "@hono/node-server";
import { openDb } from "../db/client.js";
import { createApp } from "./app.js";
import { createConnectionStore } from "./services/connection-store.js";
import { createSessionStore } from "./services/session-store.js";
import { createPhaseATools } from "./agent/tools/index.js";
import { consoleLogger } from "./agent/tool-log.js";
import { modelConfigFromEnv } from "./agent/model-config.js";

const port = Number(process.env.WORKBENCH_PORT ?? 5175);
const db = openDb();
const connections = createConnectionStore(db);
const sessions = createSessionStore(db);
const registry = createPhaseATools();
const modelConfig = modelConfigFromEnv();

if (modelConfig) {
  console.log(
    `workbench agent: provider=${modelConfig.provider} model=${modelConfig.model}`,
  );
} else {
  console.log(
    "workbench agent: ANTHROPIC_API_KEY not set — /api/sessions/:sid/answer returns 503",
  );
}

const app = createApp({
  connections,
  sessions,
  registry,
  logger: consoleLogger(),
  modelConfig,
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`workbench server listening on http://127.0.0.1:${info.port}`);
});
