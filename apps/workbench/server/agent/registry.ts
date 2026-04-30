import { z, type ZodIssue, type ZodTypeAny } from "zod";
import type { DataConnection, AgentSession } from "../../db/schema.js";
import type { ResourceType } from "../schemas.js";
import {
  err,
  ok,
  type ToolEnvelope,
  type ToolEnvelopeOk,
} from "./envelope.js";
import type { ToolCallLogEntry, ToolLogger } from "./tool-log.js";

/**
 * Per-tool execution context. Tools never see the raw connection store or
 * the DB — they get exactly the connection row and an injectable `fetch`.
 */
export interface ToolContext {
  connection: DataConnection;
  fetch: typeof fetch;
  signal: AbortSignal;
}

export interface ToolDef<I extends { patientId: string }, O> {
  name: string;
  version: string;
  description: string;
  /**
   * Zod schema for the tool's input. MUST contain a string `patientId`
   * field — patient scope is enforced at the runner level by comparing
   * `input.patientId` to the session's authorized patient.
   */
  input: ZodTypeAny;
  /** FHIR resource types the tool reads. Sub-set of the proxy allow-list. */
  resourceAllowlist: ReadonlyArray<ResourceType>;
  /**
   * Maximum number of resources the tool may return. The runner truncates
   * if `execute` returns more, sets `envelope.truncated = true`, and never
   * lets the upstream blow past this limit.
   */
  resultLimit: number;
  timeoutMs: number;
  execute: (
    ctx: ToolContext,
    input: I,
  ) => Promise<ToolExecuteOutput<O>>;
}

export type ToolExecuteOutput<O> =
  | { kind: "ok"; data: O; count?: number; truncated?: boolean }
  | {
      kind: "upstream_error";
      message: string;
      upstream?: unknown;
    };

export interface ToolRegistry {
  list(): ReadonlyArray<{
    name: string;
    version: string;
    description: string;
    resourceAllowlist: ReadonlyArray<ResourceType>;
    resultLimit: number;
    timeoutMs: number;
  }>;
  has(name: string): boolean;
  /** Registry lookup; not for external callers. */
  get(name: string): ToolDef<{ patientId: string }, unknown> | null;
  run(args: RunArgs): Promise<ToolEnvelope>;
}

export interface RunArgs {
  toolName: string;
  rawInput: unknown;
  session: AgentSession;
  connection: DataConnection;
  fetchFn?: typeof fetch;
  logger?: ToolLogger;
}

export function createRegistry(
  defs: ReadonlyArray<ToolDef<{ patientId: string }, unknown>>,
): ToolRegistry {
  const byName = new Map<string, ToolDef<{ patientId: string }, unknown>>();
  for (const d of defs) {
    if (byName.has(d.name)) {
      throw new Error(`duplicate tool definition: ${d.name}`);
    }
    byName.set(d.name, d);
  }

  return {
    list() {
      return [...byName.values()].map(({ execute: _e, input: _i, ...meta }) => meta);
    },
    has(name) {
      return byName.has(name);
    },
    get(name) {
      return byName.get(name) ?? null;
    },
    async run(args) {
      const startedAt = new Date().toISOString();
      const startMs = Date.now();
      const def = byName.get(args.toolName);
      const meta = {
        tool: args.toolName,
        toolVersion: def?.version ?? "0",
      };

      const finalize = (envelope: ToolEnvelope) => {
        const completedAt = new Date().toISOString();
        const entry: ToolCallLogEntry = {
          sessionId: args.session.id,
          connectionId: args.session.connectionId,
          patientId: args.session.patientId,
          tool: meta.tool,
          toolVersion: meta.toolVersion,
          input: args.rawInput,
          envelope,
          startedAt,
          completedAt,
        };
        try {
          args.logger?.record(entry);
        } catch {
          // logging never breaks tool execution
        }
        return envelope;
      };

      if (!def) {
        return finalize(
          err(
            { ...meta, durationMs: Date.now() - startMs },
            "unknown_tool",
            `unknown tool: ${args.toolName}`,
          ),
        );
      }

      const parsed = def.input.safeParse(args.rawInput);
      if (!parsed.success) {
        return finalize(
          err(
            { ...meta, durationMs: Date.now() - startMs },
            "invalid_input",
            "invalid_input",
            { issues: parsed.error.issues as ZodIssue[] },
          ),
        );
      }
      const input = parsed.data as { patientId: string };

      if (input.patientId !== args.session.patientId) {
        return finalize(
          err(
            { ...meta, durationMs: Date.now() - startMs },
            "unauthorized_patient",
            "patientId does not match the session's authorized patient",
          ),
        );
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), def.timeoutMs);
      const ctx: ToolContext = {
        connection: args.connection,
        fetch: args.fetchFn ?? fetch,
        signal: controller.signal,
      };

      try {
        const result = await def.execute(ctx, input);
        clearTimeout(timeout);
        if (result.kind === "upstream_error") {
          return finalize(
            err(
              { ...meta, durationMs: Date.now() - startMs },
              "upstream_error",
              result.message,
              { upstream: result.upstream },
            ),
          );
        }

        let data = result.data;
        let count = result.count;
        let truncated = result.truncated;
        if (
          Array.isArray(data) &&
          (data as unknown[]).length > def.resultLimit
        ) {
          data = (data as unknown[]).slice(0, def.resultLimit) as typeof data;
          count = def.resultLimit;
          truncated = true;
        }

        const envelope: ToolEnvelopeOk = {
          ok: true,
          ...meta,
          data,
          ...(typeof count === "number" ? { count } : {}),
          ...(typeof truncated === "boolean" ? { truncated } : {}),
          durationMs: Date.now() - startMs,
        };
        return finalize(envelope);
      } catch (error) {
        clearTimeout(timeout);
        const reason =
          (error as { name?: string })?.name === "AbortError"
            ? "timeout"
            : "internal_error";
        const message = error instanceof Error ? error.message : String(error);
        return finalize(
          err({ ...meta, durationMs: Date.now() - startMs }, reason, message),
        );
      }
    },
  };
}

/**
 * The patient-id field every tool's input must accept. Tools build their
 * input schema by intersecting/extending this base instead of importing a
 * generic factory — keeping each tool's input shape concretely typed.
 */
export const PatientIdField = z.string().min(1).max(64);

export const PatientScopedBase = z.object({ patientId: PatientIdField });
