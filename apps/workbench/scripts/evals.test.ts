import { describe, expect, it } from "vitest";
import { evaluateCase, runEvals, type EvalCase } from "./evals.js";

describe("eval runner", () => {
  it("runs baseline cases and passes both", () => {
    const run = runEvals();
    expect(run.summary.total).toBeGreaterThanOrEqual(2);
    expect(run.summary.failed).toBe(0);
    expect(run.summary.passed).toBe(run.summary.total);
    expect(run.summary.schemaFailures).toBe(0);
  });

  it("marks malformed answers as schema-invalid", () => {
    const badCase: EvalCase = {
      id: "bad",
      description: "invalid payload",
      input: { schemaVersion: "1" },
      expect: {},
    };
    const result = evaluateCase(badCase);
    expect(result.pass).toBe(false);
    expect(result.schemaValid).toBe(false);
    expect(result.errors[0]).toContain("schema validation");
  });
});
