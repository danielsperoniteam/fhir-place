import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AgentSession, DataConnection } from "../../db/schema.js";
import { createRegistry, PatientIdField, type ToolDef } from "./registry.js";
import { inMemoryLogger } from "./tool-log.js";

const SESSION: AgentSession = {
  id: "sess_1",
  connectionId: "conn_1",
  patientId: "pat-1",
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

const CONNECTION: DataConnection = {
  id: "conn_1",
  name: "test",
  kind: "fhir_clinical",
  baseUrl: "https://upstream.test/fhir",
  authType: "none",
  authToken: null,
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
  lastCapabilityAt: null,
  lastCapabilityStatus: null,
  lastCapabilityFhirVersion: null,
  lastCapabilitySoftware: null,
  lastCapabilityJson: null,
  lastCapabilityError: null,
};

function passthroughTool(): ToolDef<{ patientId: string }, { hello: string }> {
  return {
    name: "passthrough",
    version: "1",
    description: "test",
    input: z.object({ patientId: PatientIdField }),
    resourceAllowlist: ["Patient"],
    resultLimit: 1,
    timeoutMs: 1000,
    async execute(_ctx, input) {
      return { kind: "ok", data: { hello: input.patientId } };
    },
  };
}

describe("registry runner", () => {
  it("returns unknown_tool when the name isn't registered", async () => {
    const reg = createRegistry([passthroughTool()]);
    const env = await reg.run({
      toolName: "noSuchTool",
      rawInput: { patientId: "pat-1" },
      session: SESSION,
      connection: CONNECTION,
    });
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.reason).toBe("unknown_tool");
      expect(env.tool).toBe("noSuchTool");
    }
  });

  it("returns invalid_input with structured Zod issues", async () => {
    const reg = createRegistry([passthroughTool()]);
    const env = await reg.run({
      toolName: "passthrough",
      rawInput: { patientId: "" },
      session: SESSION,
      connection: CONNECTION,
    });
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.reason).toBe("invalid_input");
      expect(env.issues).toBeDefined();
    }
  });

  it("returns unauthorized_patient when patientId disagrees with the session", async () => {
    const reg = createRegistry([passthroughTool()]);
    const env = await reg.run({
      toolName: "passthrough",
      rawInput: { patientId: "different-patient" },
      session: SESSION,
      connection: CONNECTION,
    });
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.reason).toBe("unauthorized_patient");
  });

  it("invokes execute on the happy path and returns ok envelope with durationMs", async () => {
    const reg = createRegistry([passthroughTool()]);
    const env = await reg.run({
      toolName: "passthrough",
      rawInput: { patientId: "pat-1" },
      session: SESSION,
      connection: CONNECTION,
    });
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.tool).toBe("passthrough");
      expect(env.toolVersion).toBe("1");
      expect(env.data).toEqual({ hello: "pat-1" });
      expect(typeof env.durationMs).toBe("number");
    }
  });

  it("invokes the logger for both ok and error envelopes", async () => {
    const reg = createRegistry([passthroughTool()]);
    const logger = inMemoryLogger();

    await reg.run({
      toolName: "passthrough",
      rawInput: { patientId: "pat-1" },
      session: SESSION,
      connection: CONNECTION,
      logger,
    });
    await reg.run({
      toolName: "noSuchTool",
      rawInput: { patientId: "pat-1" },
      session: SESSION,
      connection: CONNECTION,
      logger,
    });

    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[0]?.envelope.ok).toBe(true);
    expect(logger.entries[1]?.envelope.ok).toBe(false);
    expect(logger.entries[0]?.sessionId).toBe("sess_1");
    expect(logger.entries[0]?.patientId).toBe("pat-1");
  });

  it("times out and returns reason: 'timeout' when execute exceeds timeoutMs", async () => {
    const slow: ToolDef<{ patientId: string }, never> = {
      name: "slow",
      version: "1",
      description: "test",
      input: z.object({ patientId: PatientIdField }),
      resourceAllowlist: ["Patient"],
      resultLimit: 1,
      timeoutMs: 30,
      async execute(ctx) {
        // Resolve when aborted; reject as AbortError otherwise
        return new Promise((_resolve, reject) => {
          ctx.signal.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        });
      },
    };
    const reg = createRegistry([slow]);
    const env = await reg.run({
      toolName: "slow",
      rawInput: { patientId: "pat-1" },
      session: SESSION,
      connection: CONNECTION,
    });
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.reason).toBe("timeout");
  });

  it("truncates array data above resultLimit and sets truncated:true", async () => {
    const overshoot: ToolDef<{ patientId: string }, number[]> = {
      name: "overshoot",
      version: "1",
      description: "test",
      input: z.object({ patientId: PatientIdField }),
      resourceAllowlist: ["Patient"],
      resultLimit: 3,
      timeoutMs: 1000,
      async execute() {
        return { kind: "ok", data: [1, 2, 3, 4, 5] };
      },
    };
    const reg = createRegistry([overshoot]);
    const env = await reg.run({
      toolName: "overshoot",
      rawInput: { patientId: "pat-1" },
      session: SESSION,
      connection: CONNECTION,
    });
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.data).toEqual([1, 2, 3]);
      expect(env.truncated).toBe(true);
      expect(env.count).toBe(3);
    }
  });

  it("rejects duplicate tool definitions at registry construction", () => {
    const dup = passthroughTool();
    expect(() => createRegistry([dup, dup])).toThrow(/duplicate/);
  });

  it("propagates upstream_error from execute as ok:false / reason:upstream_error", async () => {
    const broken: ToolDef<{ patientId: string }, unknown> = {
      name: "broken",
      version: "1",
      description: "test",
      input: z.object({ patientId: PatientIdField }),
      resourceAllowlist: ["Patient"],
      resultLimit: 1,
      timeoutMs: 1000,
      async execute() {
        return {
          kind: "upstream_error",
          message: "upstream HTTP 500",
          upstream: { resourceType: "OperationOutcome" },
        };
      },
    };
    const reg = createRegistry([broken]);
    const env = await reg.run({
      toolName: "broken",
      rawInput: { patientId: "pat-1" },
      session: SESSION,
      connection: CONNECTION,
    });
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.reason).toBe("upstream_error");
      expect(env.upstream).toMatchObject({ resourceType: "OperationOutcome" });
    }
  });

  it("internal_error when execute throws a non-AbortError", async () => {
    const explode: ToolDef<{ patientId: string }, never> = {
      name: "explode",
      version: "1",
      description: "test",
      input: z.object({ patientId: PatientIdField }),
      resourceAllowlist: ["Patient"],
      resultLimit: 1,
      timeoutMs: 1000,
      async execute() {
        throw new Error("kaboom");
      },
    };
    const reg = createRegistry([explode]);
    const env = await reg.run({
      toolName: "explode",
      rawInput: { patientId: "pat-1" },
      session: SESSION,
      connection: CONNECTION,
    });
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.reason).toBe("internal_error");
      expect(env.error).toBe("kaboom");
    }
  });

  it("never lets a logger throw break tool execution", async () => {
    const reg = createRegistry([passthroughTool()]);
    const flaky = {
      record: vi.fn(() => {
        throw new Error("logger explosion");
      }),
    };
    const env = await reg.run({
      toolName: "passthrough",
      rawInput: { patientId: "pat-1" },
      session: SESSION,
      connection: CONNECTION,
      logger: flaky,
    });
    expect(env.ok).toBe(true);
    expect(flaky.record).toHaveBeenCalledTimes(1);
  });
});

describe("PatientIdField", () => {
  it("requires a non-empty string", () => {
    const schema = z.object({ patientId: PatientIdField });
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ patientId: "" }).success).toBe(false);
    expect(schema.safeParse({ patientId: "ok" }).success).toBe(true);
  });

  it("can be combined with extra fields in a tool input", () => {
    const schema = z.object({
      patientId: PatientIdField,
      limit: z.number().int(),
    });
    expect(schema.safeParse({ patientId: "p", limit: 5 }).success).toBe(true);
  });
});
