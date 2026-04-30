import type { ToolEnvelope } from "./envelope.js";

export interface ToolCallLogEntry {
  sessionId: string;
  connectionId: string;
  patientId: string;
  tool: string;
  toolVersion: string;
  input: unknown;
  envelope: ToolEnvelope;
  startedAt: string;
  completedAt: string;
  /**
   * Set by the orchestrator's per-run scoped logger so persisted tool
   * calls associate to their owning agent answer. `undefined` for
   * standalone debug calls via `/api/sessions/:sid/tools/:toolName`.
   */
  answerId?: string;
}

/**
 * The registry calls `record()` after every tool execution, regardless
 * of success or failure. Phase A ships in-memory + console impls for
 * tests and dev; the DB-backed impl in `services/audit-store.ts`
 * persists to `tool_call` so the audit log can replay.
 *
 * Tools never call this themselves — the runner is the single
 * chokepoint.
 */
export interface ToolLogger {
  record(entry: ToolCallLogEntry): void | Promise<void>;
}

export function inMemoryLogger(): ToolLogger & {
  entries: ReadonlyArray<ToolCallLogEntry>;
  clear(): void;
} {
  const entries: ToolCallLogEntry[] = [];
  return {
    entries,
    clear() {
      entries.length = 0;
    },
    record(entry) {
      entries.push(entry);
    },
  };
}

export function consoleLogger(): ToolLogger {
  return {
    record(entry) {
      const tag = entry.envelope.ok ? "ok" : `err(${entry.envelope.reason})`;
      // eslint-disable-next-line no-console
      console.log(
        `[tool] ${entry.tool}@${entry.toolVersion} ${tag} ` +
          `session=${entry.sessionId} patient=${entry.patientId} ` +
          `${entry.envelope.durationMs}ms`,
      );
    },
  };
}

/**
 * Compose two loggers; both `record()` calls fire on every entry. Used
 * to fan a tool call to both an in-memory store (for tests / the
 * orchestrator's own bookkeeping) and the DB-backed audit store at
 * once.
 */
export function teeLogger(...loggers: ReadonlyArray<ToolLogger>): ToolLogger {
  return {
    async record(entry) {
      for (const l of loggers) {
        await l.record(entry);
      }
    },
  };
}

/**
 * Returns a logger that wraps `base` and tags every entry with
 * `answerId`. Used by the answers route to associate every tool call
 * made during one `runPatientSummary` invocation with its persisted
 * `agent_answer` row.
 */
export function scopeLoggerToAnswer(
  base: ToolLogger,
  answerId: string,
): ToolLogger {
  return {
    record(entry) {
      return base.record({ ...entry, answerId });
    },
  };
}
