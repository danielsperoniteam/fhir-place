import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { openDb } from "../../db/client.js";
import { agentSession, dataConnection } from "../../db/schema.js";
import { createAuditStore } from "./audit-store.js";
import type { ToolCallLogEntry } from "../agent/tool-log.js";
import type { AgentAnswer } from "../../src/agent/answer-schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "db", "migrations");

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function makeDb() {
  const dir = mkdtempSync(join(tmpdir(), "audit-store-"));
  const url = join(dir, "test.sqlite");
  const sqlite = new Database(url);
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  sqlite.close();
  const db = openDb(url);
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return db;
}

function seedSession(db: ReturnType<typeof makeDb>, sid = "sess-1") {
  const ts = "2026-04-30T00:00:00.000Z";
  db.insert(dataConnection)
    .values({
      id: "conn-1",
      name: "test",
      kind: "fhir_clinical",
      baseUrl: "https://upstream.test/fhir",
      authType: "none",
      authToken: null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  db.insert(agentSession)
    .values({
      id: sid,
      connectionId: "conn-1",
      patientId: "pat-1",
      createdAt: ts,
      updatedAt: ts,
    })
    .run();
  return { sid, connectionId: "conn-1", patientId: "pat-1" };
}

function makeStore(db: ReturnType<typeof makeDb>) {
  let counter = 0;
  return createAuditStore(db, {
    generateId: () => `aud_${String(++counter).padStart(4, "0")}`,
    now: () => "2026-04-30T13:00:00.000Z",
  });
}

const ANSWER: AgentAnswer = {
  schemaVersion: "1",
  sessionId: "sess-1",
  connectionId: "conn-1",
  patientId: "pat-1",
  prompt: "Summarise this patient.",
  promptVersion: "patient-summary@v1",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  summary: "Short summary.",
  claims: [
    {
      id: "c1",
      text: "The patient has documented Type 2 diabetes.",
      evidence: [{ reference: "Condition/cond-dm2" }],
    },
  ],
  missingData: [{ description: "no allergy data recorded" }],
  cannotDetermine: [],
  toolCalls: [
    {
      tool: "searchConditionsForPatient",
      toolVersion: "1",
      ok: true,
      durationMs: 42,
    },
  ],
  createdAt: "2026-04-30T13:00:00.000Z",
};

function toolEntry(over: Partial<ToolCallLogEntry> = {}): ToolCallLogEntry {
  return {
    sessionId: "sess-1",
    connectionId: "conn-1",
    patientId: "pat-1",
    tool: "searchConditionsForPatient",
    toolVersion: "1",
    input: { patientId: "pat-1" },
    envelope: {
      ok: true,
      tool: "searchConditionsForPatient",
      toolVersion: "1",
      data: [
        { resourceType: "Condition", id: "cond-dm2" },
        { resourceType: "Condition", id: "cond-htn" },
      ],
      count: 2,
      truncated: false,
      durationMs: 42,
    },
    startedAt: "2026-04-30T12:59:59.000Z",
    completedAt: "2026-04-30T13:00:00.000Z",
    ...over,
  };
}

describe("audit-store: persistAnswer", () => {
  it("inserts agent_answer + tool_call (with answer_id) + evidence_claim rows in one logical unit", () => {
    const db = makeDb();
    seedSession(db);
    const store = makeStore(db);

    const result = store.persistAnswer(
      {
        answerId: "ans-1",
        sessionId: "sess-1",
        prompt: ANSWER.prompt,
        promptVersion: ANSWER.promptVersion!,
        provider: ANSWER.provider!,
        model: ANSWER.model!,
        fallback: false,
        turns: 3,
        answer: ANSWER,
        createdAt: "2026-04-30T13:00:00.000Z",
      },
      [toolEntry({ answerId: "ans-1" })],
    );

    expect(result.id).toBe("ans-1");

    const detail = store.getAnswer("ans-1");
    expect(detail).not.toBeNull();
    expect(detail?.fallback).toBe(false);
    expect(detail?.turns).toBe(3);
    expect(detail?.answer.claims[0]?.evidence[0]?.reference).toBe(
      "Condition/cond-dm2",
    );
    expect(detail?.toolCalls).toHaveLength(1);
    expect(detail?.toolCalls[0]?.answerId).toBe("ans-1");
    expect(detail?.toolCalls[0]?.resourceIds).toEqual([
      "Condition/cond-dm2",
      "Condition/cond-htn",
    ]);
    expect(detail?.claims).toHaveLength(1);
    expect(detail?.claims[0]?.claimId).toBe("c1");
    expect(detail?.claims[0]?.evidenceRefs).toEqual(["Condition/cond-dm2"]);
  });

  it("persists finalIssues when the orchestrator fell back to a partial answer", () => {
    const db = makeDb();
    seedSession(db);
    const store = makeStore(db);
    store.persistAnswer({
      answerId: "ans-2",
      sessionId: "sess-1",
      prompt: "Summarise this patient.",
      promptVersion: "patient-summary@v1",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      fallback: true,
      turns: 2,
      answer: { ...ANSWER, claims: [] },
      finalIssues: [{ path: ["claims", 0, "evidence"], message: "min(1)" }],
      createdAt: "2026-04-30T13:00:00.000Z",
    });

    const detail = store.getAnswer("ans-2");
    expect(detail?.fallback).toBe(true);
    expect(detail?.finalIssues).toEqual([
      { path: ["claims", 0, "evidence"], message: "min(1)" },
    ]);
  });

  it("rejects a duplicate answerId via the primary-key constraint", () => {
    const db = makeDb();
    seedSession(db);
    const store = makeStore(db);
    store.persistAnswer({
      answerId: "ans-dup",
      sessionId: "sess-1",
      prompt: "Summarise this patient.",
      promptVersion: "patient-summary@v1",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      fallback: false,
      turns: 1,
      answer: ANSWER,
      createdAt: "2026-04-30T13:00:00.000Z",
    });
    expect(() =>
      store.persistAnswer({
        answerId: "ans-dup",
        sessionId: "sess-1",
        prompt: "Summarise this patient.",
        promptVersion: "patient-summary@v1",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        fallback: false,
        turns: 1,
        answer: ANSWER,
        createdAt: "2026-04-30T13:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rolls back agent_answer + tool_call when a later insert fails", () => {
    const db = makeDb();
    seedSession(db);
    // Force the evidence-claim insert to fail by throwing on the
    // generateId call that would produce its id. The throw happens
    // mid-transaction (after agent_answer + tool_call have already
    // been inserted), so the transaction should roll the whole unit
    // back rather than leaving a partial run on disk.
    let idCalls = 0;
    const store = createAuditStore(db, {
      generateId: () => {
        idCalls += 1;
        if (idCalls === 2) throw new Error("simulated mid-write failure");
        return `aud_${idCalls}`;
      },
      now: () => "2026-04-30T13:00:00.000Z",
    });

    expect(() =>
      store.persistAnswer(
        {
          answerId: "ans-rollback",
          sessionId: "sess-1",
          prompt: ANSWER.prompt,
          promptVersion: ANSWER.promptVersion!,
          provider: ANSWER.provider!,
          model: ANSWER.model!,
          fallback: false,
          turns: 1,
          answer: ANSWER,
          createdAt: "2026-04-30T13:00:00.000Z",
        },
        [toolEntry({ answerId: "ans-rollback" })],
      ),
    ).toThrow(/simulated mid-write failure/);

    // The whole unit must have rolled back: no agent_answer, no
    // tool_call, no evidence_claim row from this run.
    expect(store.getAnswer("ans-rollback")).toBeNull();
    expect(store.listToolCalls({ sessionId: "sess-1" })).toHaveLength(0);
    expect(store.listAnswers("sess-1")).toHaveLength(0);
  });
});

describe("audit-store: recordToolCall (debug-runner path)", () => {
  it("persists a tool_call row with answer_id NULL", () => {
    const db = makeDb();
    seedSession(db);
    const store = makeStore(db);

    store.recordToolCall(toolEntry());

    const calls = store.listToolCalls({ sessionId: "sess-1", answerId: null });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.answerId).toBeNull();
    expect(calls[0]?.tool).toBe("searchConditionsForPatient");
  });

  it("persists envelope reason + ok=false for failure envelopes", () => {
    const db = makeDb();
    seedSession(db);
    const store = makeStore(db);

    store.recordToolCall(
      toolEntry({
        envelope: {
          ok: false,
          tool: "getPatient",
          toolVersion: "1",
          error: "patientId does not match",
          reason: "unauthorized_patient",
          durationMs: 1,
        },
      }),
    );
    const calls = store.listToolCalls({ sessionId: "sess-1" });
    expect(calls[0]?.ok).toBe(false);
    expect(calls[0]?.reason).toBe("unauthorized_patient");
    expect(calls[0]?.resourceIds).toEqual([]);
  });
});

describe("audit-store: exportSession", () => {
  it("returns answers (with their tool calls + claims) plus debug-runner tool calls", () => {
    const db = makeDb();
    seedSession(db);
    const store = makeStore(db);

    // a debug-runner tool call (no answer)
    store.recordToolCall(toolEntry());

    // an agent run
    store.persistAnswer(
      {
        answerId: "ans-x",
        sessionId: "sess-1",
        prompt: "Summarise this patient.",
        promptVersion: "patient-summary@v1",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        fallback: false,
        turns: 3,
        answer: ANSWER,
        createdAt: "2026-04-30T13:01:00.000Z",
      },
      [toolEntry({ answerId: "ans-x" })],
    );

    const exp = store.exportSession({
      sessionId: "sess-1",
      connectionId: "conn-1",
      patientId: "pat-1",
    });

    expect(exp.schemaVersion).toBe("1");
    expect(exp.session).toEqual({
      id: "sess-1",
      connectionId: "conn-1",
      patientId: "pat-1",
    });
    expect(exp.answers).toHaveLength(1);
    expect(exp.answers[0]?.id).toBe("ans-x");
    expect(exp.answers[0]?.toolCalls).toHaveLength(1);
    expect(exp.answers[0]?.toolCalls[0]?.answerId).toBe("ans-x");
    expect(exp.answers[0]?.claims).toHaveLength(1);
    expect(exp.unboundToolCalls).toHaveLength(1);
    expect(exp.unboundToolCalls[0]?.answerId).toBeNull();
  });

  it("listAnswers returns sessions in newest-first order", () => {
    const db = makeDb();
    seedSession(db);
    const store = makeStore(db);

    for (let i = 1; i <= 3; i++) {
      store.persistAnswer({
        answerId: `ans-${i}`,
        sessionId: "sess-1",
        prompt: `prompt ${i}`,
        promptVersion: "patient-summary@v1",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        fallback: false,
        turns: 1,
        answer: ANSWER,
        createdAt: `2026-04-30T13:0${i}:00.000Z`,
      });
    }

    const list = store.listAnswers("sess-1");
    expect(list.map((r) => r.id)).toEqual(["ans-3", "ans-2", "ans-1"]);
  });
});

describe("audit-store: cascade behaviour", () => {
  it("deleting a session cascades agent_answer + tool_call rows", () => {
    const db = makeDb();
    seedSession(db);
    const store = makeStore(db);

    store.persistAnswer(
      {
        answerId: "ans-c",
        sessionId: "sess-1",
        prompt: "p",
        promptVersion: "patient-summary@v1",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        fallback: false,
        turns: 1,
        answer: ANSWER,
        createdAt: "2026-04-30T13:00:00.000Z",
      },
      [toolEntry({ answerId: "ans-c" })],
    );
    expect(store.listToolCalls({ sessionId: "sess-1" })).toHaveLength(1);
    expect(store.listAnswers("sess-1")).toHaveLength(1);

    db.delete(agentSession).run();

    expect(store.listToolCalls({ sessionId: "sess-1" })).toHaveLength(0);
    expect(store.listAnswers("sess-1")).toHaveLength(0);
  });
});
