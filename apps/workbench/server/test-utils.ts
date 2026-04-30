import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { openDb } from "../db/client.js";
import { createConnectionStore } from "./services/connection-store.js";
import { createSessionStore } from "./services/session-store.js";
import { createAuditStore } from "./services/audit-store.js";
import { createApp } from "./app.js";
import { createPhaseATools } from "./agent/tools/index.js";
import { inMemoryLogger } from "./agent/tool-log.js";
import type { ModelConfig } from "./agent/model-config.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "db", "migrations");

export function makeTestApp(
  options: { fetchFn?: typeof fetch; modelConfig?: ModelConfig | null } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "workbench-server-"));
  const url = join(dir, "test.sqlite");

  const sqlite = new Database(url);
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  sqlite.close();

  const db = openDb(url);

  let counter = 0;
  const connections = createConnectionStore(db, {
    generateId: () => `conn_${String(++counter).padStart(4, "0")}`,
    now: () => "2026-04-30T00:00:00.000Z",
    fetchFn: options.fetchFn,
  });

  let sessionCounter = 0;
  const sessions = createSessionStore(db, {
    generateId: () => `sess_${String(++sessionCounter).padStart(4, "0")}`,
    now: () => "2026-04-30T00:00:00.000Z",
  });

  let auditCounter = 0;
  const audit = createAuditStore(db, {
    generateId: () => `aud_${String(++auditCounter).padStart(4, "0")}`,
    now: () => "2026-04-30T00:00:00.000Z",
  });

  const registry = createPhaseATools();
  const logger = inMemoryLogger();

  let answerCounter = 0;
  const app = createApp({
    connections,
    sessions,
    audit,
    registry,
    fetchFn: options.fetchFn,
    logger,
    modelConfig: options.modelConfig ?? null,
    generateAnswerId: () => `ans_${String(++answerCounter).padStart(4, "0")}`,
    now: () => "2026-04-30T00:00:00.000Z",
  });

  return {
    app,
    connections,
    sessions,
    audit,
    registry,
    logger,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/fhir+json" },
    ...init,
  });
}
