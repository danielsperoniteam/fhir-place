import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  agentAnswer,
  evidenceClaim,
  toolCall,
  type AgentAnswerRow,
  type EvidenceClaimRow,
  type ToolCallRow,
} from "../../db/schema.js";
import type { WorkbenchDb } from "../../db/client.js";
import type { AgentAnswer } from "../../src/agent/answer-schema.js";
import type { ToolCallLogEntry } from "../agent/tool-log.js";

export interface PersistAnswerInput {
  /**
   * Pre-generated id so the answers route can scope tool-call records
   * to this answer *before* the row is inserted (the orchestrator's
   * scoped logger needs the id during the loop).
   */
  answerId: string;
  sessionId: string;
  prompt: string;
  promptVersion: string;
  provider: string;
  model: string;
  fallback: boolean;
  turns: number;
  /** A validated `AgentAnswer`. Persisted verbatim in `answer_json`. */
  answer: AgentAnswer;
  /** Zod issues, if the orchestrator fell back due to validation. */
  finalIssues?: unknown;
  createdAt: string;
}

export interface AnswerSummary {
  id: string;
  sessionId: string;
  prompt: string;
  promptVersion: string;
  provider: string;
  model: string;
  fallback: boolean;
  turns: number;
  createdAt: string;
}

export interface AnswerDetail extends AnswerSummary {
  answer: AgentAnswer;
  finalIssues: unknown | null;
  toolCalls: ToolCallSummary[];
  claims: EvidenceClaimSummary[];
}

export interface ToolCallSummary {
  id: string;
  sessionId: string;
  answerId: string | null;
  tool: string;
  toolVersion: string;
  ok: boolean;
  reason: string | null;
  count: number | null;
  truncated: boolean | null;
  durationMs: number;
  resourceIds: string[];
  startedAt: string;
  completedAt: string;
}

export interface EvidenceClaimSummary {
  id: string;
  claimId: string;
  text: string;
  evidenceRefs: string[];
}

export interface SessionExport {
  exportedAt: string;
  schemaVersion: "1";
  session: { id: string; connectionId: string; patientId: string };
  answers: AnswerDetail[];
  /** Tool calls *not* attached to an answer (debug-runner calls). */
  unboundToolCalls: ToolCallSummary[];
}

export function createAuditStore(
  db: WorkbenchDb,
  options: { generateId?: () => string; now?: () => string } = {},
) {
  const generateId = options.generateId ?? defaultId;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    /**
     * Persist a single `runPatientSummary` outcome AND the tool-call
     * entries collected during the loop, atomically. The insert order
     * is:
     *
     *   1. `agent_answer`     — parent row.
     *   2. `tool_call`        — children with `answer_id = answerId`.
     *   3. `evidence_claim`   — derived from the validated answer.
     *
     * Wrapped in `db.transaction(...)` so a mid-sequence failure
     * rolls back the whole unit; the caller's catch-path can then
     * fall back to writing buffered tool calls as unbound rows
     * without producing duplicated/inconsistent audit history for
     * the same run. SQLite FKs are enforced (PRAGMA
     * `foreign_keys = ON` in `db/client.ts`), so ordering matters
     * inside the transaction too.
     *
     * Idempotency: re-inserts with the same `answerId` fail on the
     * primary-key constraint. The route generates a fresh id per run,
     * so this is the desired behaviour.
     */
    persistAnswer(
      input: PersistAnswerInput,
      toolEntries: ReadonlyArray<ToolCallLogEntry> = [],
    ): { id: string; toolCallIds: string[] } {
      const toolCallIds: string[] = [];
      db.transaction((tx) => {
        tx.insert(agentAnswer)
          .values({
            id: input.answerId,
            sessionId: input.sessionId,
            prompt: input.prompt,
            promptVersion: input.promptVersion,
            provider: input.provider,
            model: input.model,
            fallback: input.fallback ? 1 : 0,
            turns: input.turns,
            answerJson: JSON.stringify(input.answer),
            finalIssuesJson:
              input.finalIssues === undefined
                ? null
                : JSON.stringify(input.finalIssues),
            createdAt: input.createdAt,
          })
          .run();

        for (const entry of toolEntries) {
          const id = insertToolCall(tx, generateId(), entry);
          toolCallIds.push(id);
        }

        for (const claim of input.answer.claims) {
          tx.insert(evidenceClaim)
            .values({
              id: generateId(),
              answerId: input.answerId,
              claimId: claim.id,
              text: claim.text,
              evidenceRefsJson: JSON.stringify(claim.evidence),
            })
            .run();
        }
      });

      return { id: input.answerId, toolCallIds };
    },

    /**
     * Persist a standalone `tool_call` row (no owning answer). Used by
     * the `/api/sessions/:sid/tools/:toolName` debug runner so its
     * activity is also captured in the audit log.
     */
    recordToolCall(entry: ToolCallLogEntry): { id: string } {
      const id = insertToolCall(db, generateId(), entry);
      return { id };
    },

    listAnswers(sessionId: string): AnswerSummary[] {
      const rows = db
        .select()
        .from(agentAnswer)
        .where(eq(agentAnswer.sessionId, sessionId))
        .orderBy(desc(agentAnswer.createdAt))
        .all();
      return rows.map(toAnswerSummary);
    },

    getAnswer(answerId: string): AnswerDetail | null {
      const row = db
        .select()
        .from(agentAnswer)
        .where(eq(agentAnswer.id, answerId))
        .get();
      if (!row) return null;
      const tcs = db
        .select()
        .from(toolCall)
        .where(eq(toolCall.answerId, answerId))
        .orderBy(asc(toolCall.startedAt))
        .all()
        .map(toToolCallSummary);
      const claims = db
        .select()
        .from(evidenceClaim)
        .where(eq(evidenceClaim.answerId, answerId))
        .all()
        .map(toEvidenceClaimSummary);
      return {
        ...toAnswerSummary(row),
        answer: JSON.parse(row.answerJson) as AgentAnswer,
        finalIssues:
          row.finalIssuesJson === null ? null : JSON.parse(row.finalIssuesJson),
        toolCalls: tcs,
        claims,
      };
    },

    listToolCalls(args: {
      sessionId: string;
      answerId?: string | null;
    }): ToolCallSummary[] {
      let rows: ToolCallRow[];
      if (args.answerId === undefined) {
        rows = db
          .select()
          .from(toolCall)
          .where(eq(toolCall.sessionId, args.sessionId))
          .orderBy(asc(toolCall.startedAt))
          .all();
      } else if (args.answerId === null) {
        rows = db
          .select()
          .from(toolCall)
          .where(
            and(
              eq(toolCall.sessionId, args.sessionId),
              isNullExpr(toolCall.answerId),
            ),
          )
          .orderBy(asc(toolCall.startedAt))
          .all();
      } else {
        rows = db
          .select()
          .from(toolCall)
          .where(
            and(
              eq(toolCall.sessionId, args.sessionId),
              eq(toolCall.answerId, args.answerId),
            ),
          )
          .orderBy(asc(toolCall.startedAt))
          .all();
      }
      return rows.map(toToolCallSummary);
    },

    /**
     * Full audit export for a session. Includes every persisted answer
     * (with its tool calls + claims) and any debug tool calls that
     * weren't attached to an answer. The output is plain JSON so the
     * UI can stream it as a download without any further shaping.
     */
    exportSession(args: {
      sessionId: string;
      connectionId: string;
      patientId: string;
    }): SessionExport {
      const answers = db
        .select()
        .from(agentAnswer)
        .where(eq(agentAnswer.sessionId, args.sessionId))
        .orderBy(desc(agentAnswer.createdAt))
        .all();

      const allCalls = db
        .select()
        .from(toolCall)
        .where(eq(toolCall.sessionId, args.sessionId))
        .orderBy(asc(toolCall.startedAt))
        .all();

      const allClaims = db
        .select()
        .from(evidenceClaim)
        .all();

      const detailed: AnswerDetail[] = answers.map((row) => ({
        ...toAnswerSummary(row),
        answer: JSON.parse(row.answerJson) as AgentAnswer,
        finalIssues:
          row.finalIssuesJson === null ? null : JSON.parse(row.finalIssuesJson),
        toolCalls: allCalls
          .filter((c) => c.answerId === row.id)
          .map(toToolCallSummary),
        claims: allClaims
          .filter((c) => c.answerId === row.id)
          .map(toEvidenceClaimSummary),
      }));

      const unbound = allCalls
        .filter((c) => c.answerId === null)
        .map(toToolCallSummary);

      return {
        exportedAt: now(),
        schemaVersion: "1",
        session: {
          id: args.sessionId,
          connectionId: args.connectionId,
          patientId: args.patientId,
        },
        answers: detailed,
        unboundToolCalls: unbound,
      };
    },
  };
}

export type AuditStore = ReturnType<typeof createAuditStore>;

function toAnswerSummary(row: AgentAnswerRow): AnswerSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    prompt: row.prompt,
    promptVersion: row.promptVersion,
    provider: row.provider,
    model: row.model,
    fallback: row.fallback === 1,
    turns: row.turns,
    createdAt: row.createdAt,
  };
}

function toToolCallSummary(row: ToolCallRow): ToolCallSummary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    answerId: row.answerId,
    tool: row.tool,
    toolVersion: row.toolVersion,
    ok: row.ok === 1,
    reason: row.reason,
    count: row.resultCount,
    truncated:
      row.truncated === null ? null : row.truncated === 1,
    durationMs: row.durationMs,
    resourceIds:
      row.resourceIdsJson === null
        ? []
        : (JSON.parse(row.resourceIdsJson) as string[]),
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

function toEvidenceClaimSummary(row: EvidenceClaimRow): EvidenceClaimSummary {
  const refs = JSON.parse(row.evidenceRefsJson) as
    | Array<{ reference: string }>
    | string[];
  const flat = refs.map((r) => (typeof r === "string" ? r : r.reference));
  return {
    id: row.id,
    claimId: row.claimId,
    text: row.text,
    evidenceRefs: flat,
  };
}

function collectResourceIds(data: unknown): string[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data
      .map((item) => extractRef(item))
      .filter((ref): ref is string => Boolean(ref));
  }
  const ref = extractRef(data);
  return ref ? [ref] : [];
}

function extractRef(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const o = item as { resourceType?: unknown; id?: unknown };
  if (typeof o.resourceType !== "string" || typeof o.id !== "string") {
    return null;
  }
  return `${o.resourceType}/${o.id}`;
}

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isNullExpr(column: unknown) {
  return sql`${column} IS NULL`;
}

/** Accepts either the top-level client or a `db.transaction(...)` tx;
 * both expose the same `insert` API. */
type Insertable = Pick<WorkbenchDb, "insert">;

function insertToolCall(
  db: Insertable,
  id: string,
  entry: ToolCallLogEntry,
): string {
  const env = entry.envelope;
  db.insert(toolCall)
    .values({
      id,
      sessionId: entry.sessionId,
      answerId: entry.answerId ?? null,
      connectionId: entry.connectionId,
      patientId: entry.patientId,
      tool: entry.tool,
      toolVersion: entry.toolVersion,
      inputJson: JSON.stringify(entry.input ?? null),
      envelopeJson: JSON.stringify(env),
      ok: env.ok ? 1 : 0,
      reason: env.ok ? null : env.reason,
      resultCount:
        env.ok && typeof env.count === "number" ? env.count : null,
      truncated:
        env.ok && typeof env.truncated === "boolean"
          ? env.truncated
            ? 1
            : 0
          : null,
      durationMs: env.durationMs,
      resourceIdsJson: env.ok
        ? JSON.stringify(collectResourceIds(env.data))
        : null,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
    })
    .run();
  return id;
}
