import { describe, expect, it } from "vitest";
import {
  AgentAnswer,
  EvidenceBackedClaim,
  RESOURCE_REFERENCE_REGEX,
  ResourceReference,
  parseAgentAnswer,
  parseResourceReference,
} from "./answer-schema.js";
import { SAMPLE_AGENT_ANSWER } from "./fixtures.js";

describe("RESOURCE_REFERENCE_REGEX", () => {
  it.each([
    "Patient/abc-123",
    "Condition/cond-dm2",
    "MedicationRequest/mr-1",
    "AllergyIntolerance/al.1",
    "Encounter/enc-2024-10",
    "Observation/obs-9",
  ])("accepts %s", (ref) => {
    expect(RESOURCE_REFERENCE_REGEX.test(ref)).toBe(true);
  });

  it.each([
    "Procedure/abc-123",
    "DocumentReference/doc-1",
    "patient/abc-123",
    "Patient",
    "Patient/",
    "Patient/foo bar",
    "Patient/../OperationDefinition",
    `Patient/${"a".repeat(65)}`,
  ])("rejects %s", (ref) => {
    expect(RESOURCE_REFERENCE_REGEX.test(ref)).toBe(false);
  });
});

describe("parseResourceReference", () => {
  it("parses a valid reference", () => {
    expect(parseResourceReference("Condition/abc-123")).toEqual({
      resourceType: "Condition",
      id: "abc-123",
    });
  });

  it("returns null for an invalid reference", () => {
    expect(parseResourceReference("Procedure/abc")).toBeNull();
    expect(parseResourceReference("nonsense")).toBeNull();
  });
});

describe("ResourceReference schema", () => {
  it("validates `Condition/abc-123` with optional display", () => {
    const result = ResourceReference.safeParse({
      reference: "Condition/abc-123",
      display: "Type 2 diabetes",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a reference outside the Phase A allow-list", () => {
    expect(
      ResourceReference.safeParse({ reference: "Procedure/abc-123" }).success,
    ).toBe(false);
  });
});

describe("EvidenceBackedClaim schema", () => {
  it("rejects a claim with zero evidence (the load-bearing safety property)", () => {
    const result = EvidenceBackedClaim.safeParse({
      id: "c1",
      text: "The patient has diabetes.",
      evidence: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join(".") === "evidence"),
      ).toBe(true);
    }
  });

  it("accepts a claim with one valid reference", () => {
    expect(
      EvidenceBackedClaim.safeParse({
        id: "c1",
        text: "Documented Type 2 diabetes.",
        evidence: [{ reference: "Condition/abc-123" }],
      }).success,
    ).toBe(true);
  });
});

describe("AgentAnswer schema", () => {
  it("accepts the sample fixture", () => {
    expect(AgentAnswer.safeParse(SAMPLE_AGENT_ANSWER).success).toBe(true);
  });

  it("rejects a different schemaVersion", () => {
    const bad = { ...SAMPLE_AGENT_ANSWER, schemaVersion: "0" };
    expect(AgentAnswer.safeParse(bad).success).toBe(false);
  });

  it("rejects an answer with a supported claim that has no evidence", () => {
    const bad = {
      ...SAMPLE_AGENT_ANSWER,
      claims: [
        {
          id: "bad",
          text: "I think this patient has diabetes.",
          evidence: [],
        },
      ],
    };
    const result = AgentAnswer.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.startsWith("claims.0.evidence"))).toBe(true);
    }
  });

  it(
    "rejects an answer whose claim cites a Procedure (outside the Phase A " +
      "allow-list)",
    () => {
      const bad = {
        ...SAMPLE_AGENT_ANSWER,
        claims: [
          {
            id: "c1",
            text: "Recent procedure.",
            evidence: [{ reference: "Procedure/p1" }],
          },
        ],
      };
      expect(AgentAnswer.safeParse(bad).success).toBe(false);
    },
  );

  it(
    "treats `missingData` and `cannotDetermine` as required top-level " +
      "arrays — even when empty, the keys must be present",
    () => {
      const { missingData, ...withoutMissing } = SAMPLE_AGENT_ANSWER;
      expect(missingData).toBeDefined();
      expect(AgentAnswer.safeParse(withoutMissing).success).toBe(false);
    },
  );

  it("rejects an empty prompt", () => {
    const bad = { ...SAMPLE_AGENT_ANSWER, prompt: "" };
    expect(AgentAnswer.safeParse(bad).success).toBe(false);
  });
});

describe("parseAgentAnswer", () => {
  it("returns ok on the fixture", () => {
    const result = parseAgentAnswer(SAMPLE_AGENT_ANSWER);
    expect(result.ok).toBe(true);
  });

  it("returns ok=false with the issues array for an invalid input", () => {
    const result = parseAgentAnswer({ schemaVersion: "1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });
});
