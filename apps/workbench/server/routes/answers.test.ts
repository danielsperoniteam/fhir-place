import { afterEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { jsonResponse, makeTestApp } from "../test-utils.js";
import type { ModelConfig } from "../agent/model-config.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function newApp(opts: {
  fetchFn?: typeof fetch;
  modelConfig?: ModelConfig | null;
} = {}) {
  const t = makeTestApp(opts);
  cleanups.push(t.cleanup);
  return t;
}

function toolUse(name: string, input: unknown, id = "toolu_x"): Anthropic.Message {
  return {
    id: "msg_x",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    stop_reason: "tool_use",
    stop_sequence: null,
    content: [
      {
        type: "tool_use",
        id,
        name,
        input: input as Record<string, unknown>,
      },
    ],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  } as unknown as Anthropic.Message;
}

function scriptedConfig(
  messages: ReadonlyArray<Anthropic.Message>,
): ModelConfig {
  const queue = [...messages];
  return {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    async messagesCreate() {
      const next = queue.shift();
      if (!next) throw new Error("scripted client out of responses");
      return next;
    },
  };
}

async function createConn(app: ReturnType<typeof makeTestApp>["app"]) {
  const res = await app.request("/api/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "test",
      kind: "fhir_clinical",
      baseUrl: "https://upstream.test/fhir",
      authType: "none",
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()).connection.id) as string;
}

async function createSession(
  app: ReturnType<typeof makeTestApp>["app"],
  cid: string,
  pid = "pat-1",
) {
  const res = await app.request("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: cid, patientId: pid }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()).session.id) as string;
}

const HAPPY_PATH_FETCH: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes("/Patient/pat-1")) {
    return jsonResponse({ resourceType: "Patient", id: "pat-1" });
  }
  if (url.includes("/Condition")) {
    return jsonResponse({
      resourceType: "Bundle",
      type: "searchset",
      entry: [
        {
          resource: {
            resourceType: "Condition",
            id: "cond-dm2",
            code: { text: "T2DM" },
          },
        },
      ],
    });
  }
  return jsonResponse({ resourceType: "Bundle", type: "searchset", entry: [] });
};

const HAPPY_PATH_SCRIPT: ReadonlyArray<Anthropic.Message> = [
  toolUse("getPatient", { patientId: "pat-1" }, "tu1"),
  toolUse("searchConditionsForPatient", { patientId: "pat-1" }, "tu2"),
  toolUse(
    "finalize",
    {
      summary: "Patient summary.",
      claims: [
        {
          id: "c1",
          text: "Documented Type 2 diabetes.",
          evidence: [{ reference: "Condition/cond-dm2" }],
        },
      ],
      missingData: [],
      cannotDetermine: [],
    },
    "tu3",
  ),
];

describe("POST /api/sessions/:sid/answer — without agent api key", () => {
  it("returns 503 with hint when no model is configured", async () => {
    const { app } = newApp({ modelConfig: null });
    const cid = await createConn(app);
    const sid = await createSession(app, cid);

    const res = await app.request(`/api/sessions/${sid}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("agent_unavailable");
    expect(body.hint).toMatch(/ANTHROPIC_API_KEY|WORKBENCH_AGENT_API_KEY/);
  });
});

describe("POST /api/sessions/:sid/answer — persistence", () => {
  it("persists the agent_answer + tool_call + evidence_claim rows on a happy run", async () => {
    const { app, audit } = newApp({
      fetchFn: HAPPY_PATH_FETCH,
      modelConfig: scriptedConfig(HAPPY_PATH_SCRIPT),
    });
    const cid = await createConn(app);
    const sid = await createSession(app, cid);

    const res = await app.request(`/api/sessions/${sid}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fallback).toBe(false);
    expect(body.answerId).toBeTruthy();

    const persisted = audit.getAnswer(body.answerId);
    expect(persisted).not.toBeNull();
    expect(persisted?.fallback).toBe(false);
    expect(persisted?.turns).toBe(3);
    expect(persisted?.answer.claims).toHaveLength(1);
    expect(persisted?.toolCalls.map((t) => t.tool)).toEqual([
      "getPatient",
      "searchConditionsForPatient",
    ]);
    expect(persisted?.toolCalls.every((t) => t.answerId === body.answerId)).toBe(
      true,
    );
    expect(persisted?.claims).toHaveLength(1);
    expect(persisted?.claims[0]?.evidenceRefs).toEqual(["Condition/cond-dm2"]);
  });

  it("persists fallback runs (end_turn without finalize) with finalIssues null", async () => {
    const endTurn: Anthropic.Message = {
      id: "msg_e",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn",
      stop_sequence: null,
      content: [{ type: "text", text: "I give up.", citations: null }],
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    } as unknown as Anthropic.Message;

    const { app, audit } = newApp({
      modelConfig: scriptedConfig([endTurn]),
    });
    const cid = await createConn(app);
    const sid = await createSession(app, cid);

    const res = await app.request(`/api/sessions/${sid}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fallback).toBe(true);

    const persisted = audit.getAnswer(body.answerId);
    expect(persisted?.fallback).toBe(true);
    expect(persisted?.finalIssues).toBeNull();
    expect(persisted?.answer.cannotDetermine[0]?.why).toMatch(/end_turn/);
  });
});

describe("audit GETs", () => {
  it("GET /api/sessions/:sid/answers lists persisted answers", async () => {
    const { app } = newApp({
      fetchFn: HAPPY_PATH_FETCH,
      modelConfig: scriptedConfig(HAPPY_PATH_SCRIPT),
    });
    const cid = await createConn(app);
    const sid = await createSession(app, cid);

    await app.request(`/api/sessions/${sid}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const list = await app.request(`/api/sessions/${sid}/answers`);
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.answers).toHaveLength(1);
    expect(body.answers[0].fallback).toBe(false);
  });

  it("GET /api/sessions/:sid/answers/:aid returns the detail with toolCalls + claims", async () => {
    const { app } = newApp({
      fetchFn: HAPPY_PATH_FETCH,
      modelConfig: scriptedConfig(HAPPY_PATH_SCRIPT),
    });
    const cid = await createConn(app);
    const sid = await createSession(app, cid);

    const runRes = await app.request(`/api/sessions/${sid}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const { answerId } = await runRes.json();

    const detail = await app.request(`/api/sessions/${sid}/answers/${answerId}`);
    expect(detail.status).toBe(200);
    const body = await detail.json();
    expect(body.id).toBe(answerId);
    expect(body.toolCalls).toHaveLength(2);
    expect(body.claims).toHaveLength(1);
  });

  it("GET /api/sessions/:sid/answers/:aid 404s for an answer in another session", async () => {
    const { app } = newApp({
      fetchFn: HAPPY_PATH_FETCH,
      modelConfig: scriptedConfig(HAPPY_PATH_SCRIPT),
    });
    const cid = await createConn(app);
    const sid1 = await createSession(app, cid);
    const sid2 = await createSession(app, cid, "pat-2");
    const runRes = await app.request(`/api/sessions/${sid1}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const { answerId } = await runRes.json();

    const cross = await app.request(
      `/api/sessions/${sid2}/answers/${answerId}`,
    );
    expect(cross.status).toBe(404);
  });

  it("GET /api/sessions/:sid/audit exports the session as a downloadable JSON", async () => {
    const { app } = newApp({
      fetchFn: HAPPY_PATH_FETCH,
      modelConfig: scriptedConfig(HAPPY_PATH_SCRIPT),
    });
    const cid = await createConn(app);
    const sid = await createSession(app, cid);

    await app.request(`/api/sessions/${sid}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const exp = await app.request(`/api/sessions/${sid}/audit`);
    expect(exp.status).toBe(200);
    expect(exp.headers.get("content-disposition")).toMatch(
      /attachment; filename=/,
    );
    const body = await exp.json();
    expect(body.schemaVersion).toBe("1");
    expect(body.session.id).toBe(sid);
    expect(body.answers).toHaveLength(1);
    expect(body.answers[0].toolCalls).toHaveLength(2);
  });
});

describe("POST /api/sessions/:sid/answer — failure path audit", () => {
  it("persists buffered tool calls as unbound rows when the run throws mid-loop", async () => {
    // First model call: a tool_use that will execute and log a tool
    // call. Second model call: throw, simulating a model-provider
    // failure on a later turn.
    let callCount = 0;
    const queue: ReadonlyArray<Anthropic.Message> = [
      toolUse("getPatient", { patientId: "pat-1" }, "tu1"),
    ];
    const modelConfig: ModelConfig = {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      async messagesCreate() {
        callCount += 1;
        if (callCount === 1) return queue[0]!;
        throw new Error("upstream model 503");
      },
    };

    const { app, audit } = newApp({
      fetchFn: async () =>
        jsonResponse({ resourceType: "Patient", id: "pat-1" }),
      modelConfig,
    });
    const cid = await createConn(app);
    const sid = await createSession(app, cid);

    const res = await app.request(`/api/sessions/${sid}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("model_provider_error");

    // No agent_answer row was written, but the tool call from the
    // successful first turn must still be present, attributed to the
    // session with answerId = null.
    expect(audit.listAnswers(sid)).toHaveLength(0);
    const calls = audit.listToolCalls({ sessionId: sid });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.tool).toBe("getPatient");
    expect(calls[0]?.answerId).toBeNull();
  });
});

describe("debug-runner tool calls are persisted", () => {
  it("/api/sessions/:sid/tools/:toolName writes a tool_call row with answer_id NULL", async () => {
    const { app, audit } = newApp({
      fetchFn: async () =>
        jsonResponse({ resourceType: "Patient", id: "pat-1" }),
    });
    const cid = await createConn(app);
    const sid = await createSession(app, cid);

    await app.request(`/api/sessions/${sid}/tools/getPatient`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: "pat-1" }),
    });

    const calls = audit.listToolCalls({ sessionId: sid });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.answerId).toBeNull();
    expect(calls[0]?.tool).toBe("getPatient");
  });
});
