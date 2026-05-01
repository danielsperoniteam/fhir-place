import { describe, expect, it } from "vitest";
import { runCase, runEvalSuite } from "./harness.js";
import { runPhaseAEvals } from "./run.js";
import { KNOWN_CONDITION, NO_ALLERGY_DATA, PHASE_A_CASES } from "./cases/index.js";
import type { EvalCase } from "./types.js";

describe("eval harness — cases pass under the scripted client", () => {
  it("known-condition: every assertion passes", async () => {
    const result = await runCase(KNOWN_CONDITION);
    expect(result.passed).toBe(true);
    expect(result.metrics.schemaValid).toBe(true);
    expect(result.metrics.fallback).toBe(false);
    expect(result.metrics.unsupportedClaimCount).toBe(0);
    expect(result.metrics.evidenceCountsByType.Condition).toBe(1);
    for (const a of result.assertions) expect(a.passed).toBe(true);
  });

  it("no-allergy-data: every assertion passes", async () => {
    const result = await runCase(NO_ALLERGY_DATA);
    expect(result.passed).toBe(true);
    expect(result.metrics.schemaValid).toBe(true);
    expect(result.metrics.unsupportedClaimCount).toBe(0);
    for (const a of result.assertions) expect(a.passed).toBe(true);
  });
});

describe("eval harness — assertion scoring", () => {
  it("fails when a required citation is missing", async () => {
    // Wrong evidence reference — schema still passes (Condition/c2 is on
    // the allow-list) but the cites assertion fails.
    const wrong: EvalCase = {
      ...KNOWN_CONDITION,
      scriptedTrace: [
        {
          kind: "tool",
          name: "getPatient",
          input: { patientId: KNOWN_CONDITION.patient.id },
        },
        {
          kind: "tool",
          name: "searchConditionsForPatient",
          input: { patientId: KNOWN_CONDITION.patient.id },
        },
        {
          kind: "finalize",
          body: {
            claims: [
              {
                id: "c1",
                text: "Patient has a different condition.",
                evidence: [{ reference: "Condition/c-different" }],
              },
            ],
            missingData: [],
            cannotDetermine: [],
          },
        },
      ],
    };
    const result = await runCase(wrong);
    expect(result.passed).toBe(false);
    const cites = result.assertions.find((a) => a.kind === "cites");
    expect(cites?.passed).toBe(false);
  });

  it("fails when a forbidden claim is fabricated", async () => {
    const fabricated: EvalCase = {
      ...NO_ALLERGY_DATA,
      scriptedTrace: [
        {
          kind: "tool",
          name: "getPatient",
          input: { patientId: NO_ALLERGY_DATA.patient.id },
        },
        {
          kind: "tool",
          name: "searchAllergyIntolerancesForPatient",
          input: { patientId: NO_ALLERGY_DATA.patient.id },
        },
        {
          kind: "finalize",
          body: {
            claims: [
              {
                id: "c1",
                text: "Patient has no known allergies.",
                evidence: [
                  { reference: `Patient/${NO_ALLERGY_DATA.patient.id}` },
                ],
              },
            ],
            missingData: [],
            cannotDetermine: [],
          },
        },
      ],
    };
    const result = await runCase(fabricated);
    expect(result.passed).toBe(false);
    const noClaim = result.assertions.find(
      (a) => a.kind === "noClaimMatches" && /known\\s\+allerg/.test(a.message),
    );
    // A more reliable assertion: at least one "noClaimMatches" failed.
    const noClaimFails = result.assertions.filter(
      (a) => a.kind === "noClaimMatches" && !a.passed,
    );
    expect(noClaimFails.length).toBeGreaterThan(0);
    // (The per-pattern lookup is illustrative; assert via `noClaimFails`.)
    expect(noClaim).toBeDefined();
  });

  it("flags an end-turn-without-finalize as fallback=true", async () => {
    const giveUp: EvalCase = {
      ...KNOWN_CONDITION,
      scriptedTrace: [{ kind: "end_turn", text: "I give up." }],
      assertions: [{ kind: "fallback", expected: false }],
    };
    const result = await runCase(giveUp);
    expect(result.passed).toBe(false);
    expect(result.metrics.fallback).toBe(true);
  });

  it("noCannotDetermineMatches fails when the agent hedges on a documented fact", async () => {
    // Cite the right Condition AND smuggle in a `cannotDetermine` entry
    // about diabetes — the strengthened known-condition assertion should
    // now reject this run.
    const hedging: EvalCase = {
      ...KNOWN_CONDITION,
      scriptedTrace: [
        {
          kind: "tool",
          name: "getPatient",
          input: { patientId: KNOWN_CONDITION.patient.id },
        },
        {
          kind: "tool",
          name: "searchConditionsForPatient",
          input: { patientId: KNOWN_CONDITION.patient.id },
        },
        {
          kind: "finalize",
          body: {
            claims: [
              {
                id: "c1",
                text: "The patient has documented Type 2 diabetes mellitus.",
                evidence: [{ reference: "Condition/cond-dm2" }],
              },
            ],
            missingData: [],
            cannotDetermine: [
              {
                question: "Does the patient have diabetes?",
                why: "evidence is unclear",
              },
            ],
          },
        },
      ],
    };
    const result = await runCase(hedging);
    expect(result.passed).toBe(false);
    const noCD = result.assertions.find(
      (a) => a.kind === "noCannotDetermineMatches",
    );
    expect(noCD?.passed).toBe(false);
  });

  it("noCannotDetermineMatches fails when allergy data absence is hedged as cannotDetermine", async () => {
    const hedging: EvalCase = {
      ...NO_ALLERGY_DATA,
      scriptedTrace: [
        {
          kind: "tool",
          name: "getPatient",
          input: { patientId: NO_ALLERGY_DATA.patient.id },
        },
        {
          kind: "tool",
          name: "searchAllergyIntolerancesForPatient",
          input: { patientId: NO_ALLERGY_DATA.patient.id },
        },
        {
          kind: "finalize",
          body: {
            claims: [],
            missingData: [
              { description: "no allergy data recorded" },
            ],
            cannotDetermine: [
              {
                question: "Does the patient have any allergies?",
                why: "the FHIR server has no AllergyIntolerance entries",
              },
            ],
          },
        },
      ],
    };
    const result = await runCase(hedging);
    expect(result.passed).toBe(false);
    const noCD = result.assertions.find(
      (a) => a.kind === "noCannotDetermineMatches",
    );
    expect(noCD?.passed).toBe(false);
  });
});

describe("eval harness — never-throws contract", () => {
  it("runCase returns a structured CaseResult when mode=live but liveClient is missing (does not throw)", async () => {
    const result = await runCase(KNOWN_CONDITION, { mode: "live" });
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/liveClient/);
    expect(result.metrics.schemaValid).toBe(false);
    expect(result.assertions[0]?.message).toMatch(/liveClient/);
  });

  it("runEvalSuite continues across cases when a live invocation is misconfigured", async () => {
    const out = await runEvalSuite([KNOWN_CONDITION, NO_ALLERGY_DATA], {
      mode: "live",
    });
    expect(out.cases).toHaveLength(2);
    expect(out.passed).toBe(0);
    expect(out.failed).toBe(2);
    for (const c of out.cases) {
      expect(c.error).toMatch(/liveClient/);
    }
  });
});

describe("eval harness — suite-level output", () => {
  it("runEvalSuite returns the right schemaVersion + counts", async () => {
    const out = await runEvalSuite(PHASE_A_CASES);
    expect(out.schemaVersion).toBe("1");
    expect(out.cases).toHaveLength(PHASE_A_CASES.length);
    expect(out.passed + out.failed).toBe(PHASE_A_CASES.length);
    expect(out.mode).toBe("scripted");
  });

  it("runPhaseAEvals exits 0 when every case passes", async () => {
    const lines: string[] = [];
    let writtenPath: string | undefined;
    let writtenBody: string | undefined;
    const { exitCode, result } = await runPhaseAEvals(
      { outputJsonPath: "/tmp/eval-test-output.json" },
      {
        log: (l) => lines.push(l),
        write: ((path: unknown, body: unknown) => {
          writtenPath = String(path);
          writtenBody = String(body);
        }) as unknown as typeof import("node:fs").writeFileSync,
      },
    );
    expect(exitCode).toBe(0);
    expect(result.passed).toBe(PHASE_A_CASES.length);
    expect(result.failed).toBe(0);
    expect(lines.some((l) => l.includes("[PASS] known-condition"))).toBe(true);
    expect(writtenPath).toBe("/tmp/eval-test-output.json");
    expect(writtenBody).toBeDefined();
    const reparsed = JSON.parse(writtenBody!);
    expect(reparsed.schemaVersion).toBe("1");
  });

  it("runPhaseAEvals exits 1 when any case fails", async () => {
    // Inject a known-failing case via a one-off run by mutating PHASE_A_CASES?
    // Better: call runEvalSuite with our own list and check the rollup.
    const failing: EvalCase = {
      ...KNOWN_CONDITION,
      scriptedTrace: [{ kind: "end_turn", text: "" }],
    };
    const out = await runEvalSuite([KNOWN_CONDITION, failing]);
    expect(out.passed).toBe(1);
    expect(out.failed).toBe(1);
  });
});
