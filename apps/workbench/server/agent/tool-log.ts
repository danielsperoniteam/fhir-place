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
}

/**
 * The registry calls `record()` after every tool execution, regardless of
 * success or failure. Phase A ships an in-memory implementation so PR 4's
 * tests can assert on the log without persistence; PR 7 will swap in a
 * Drizzle-backed implementation that writes to a `tool_call` table.
 *
 * Tools never call this themselves — the runner is the single chokepoint.
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
