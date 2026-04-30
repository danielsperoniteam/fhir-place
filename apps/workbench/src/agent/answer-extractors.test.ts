import { describe, expect, it } from "vitest";
import {
  citedReferences,
  dedupeReferences,
  duplicateClaimIds,
  evidenceCountsByType,
  resourceViewerHref,
  unsupportedClaimCount,
  uniqueEvidence,
} from "./answer-extractors.js";
import { SAMPLE_AGENT_ANSWER } from "./fixtures.js";
import type { AgentAnswer } from "./answer-schema.js";

describe("citedReferences", () => {
  it("returns one entry per claim's evidence in claim order", () => {
    const refs = citedReferences(SAMPLE_AGENT_ANSWER);
    expect(refs.map((r) => r.reference)).toEqual([
      "Condition/cond-dm2",
      "MedicationRequest/mr-metformin",
      "Encounter/enc-2024-10",
    ]);
  });
});

describe("dedupeReferences", () => {
  it("collapses duplicates while preserving first-seen order", () => {
    const out = dedupeReferences([
      { reference: "Condition/a" },
      { reference: "Condition/b" },
      { reference: "Condition/a" },
    ]);
    expect(out.map((r) => r.reference)).toEqual([
      "Condition/a",
      "Condition/b",
    ]);
  });
});

describe("evidenceCountsByType", () => {
  it("counts distinct cited resources by FHIR type", () => {
    expect(evidenceCountsByType(SAMPLE_AGENT_ANSWER)).toEqual({
      Patient: 0,
      Condition: 1,
      MedicationRequest: 1,
      AllergyIntolerance: 0,
      Encounter: 1,
      Observation: 0,
    });
  });

  it("does not double-count when the same reference appears in two claims", () => {
    const answer: AgentAnswer = {
      ...SAMPLE_AGENT_ANSWER,
      claims: [
        ...SAMPLE_AGENT_ANSWER.claims,
        {
          id: "c4",
          text: "Same condition referenced again.",
          evidence: [{ reference: "Condition/cond-dm2" }],
        },
      ],
    };
    expect(evidenceCountsByType(answer).Condition).toBe(1);
  });
});

describe("unsupportedClaimCount", () => {
  it("is 0 for any schema-valid answer", () => {
    expect(unsupportedClaimCount(SAMPLE_AGENT_ANSWER.claims)).toBe(0);
  });

  it("counts claims with empty evidence (used as a sanity metric in evals)", () => {
    expect(
      unsupportedClaimCount([
        { evidence: [{ reference: "Condition/a" }] },
        { evidence: [] },
        { evidence: [] },
      ]),
    ).toBe(2);
  });
});

describe("duplicateClaimIds", () => {
  it("returns ids that appear more than once", () => {
    const answer: AgentAnswer = {
      ...SAMPLE_AGENT_ANSWER,
      claims: [
        { id: "c1", text: "first", evidence: [{ reference: "Condition/a" }] },
        { id: "c1", text: "again", evidence: [{ reference: "Condition/b" }] },
        { id: "c2", text: "ok", evidence: [{ reference: "Condition/c" }] },
      ],
    };
    expect(duplicateClaimIds(answer)).toEqual(["c1"]);
  });
});

describe("resourceViewerHref", () => {
  it(
    "builds `/connections/:cid/patients/:pid/<Type>/<id>` from an evidence " +
      "ref",
    () => {
      expect(
        resourceViewerHref(SAMPLE_AGENT_ANSWER, {
          reference: "Condition/cond-dm2",
        }),
      ).toBe(
        "/connections/conn-sample/patients/pat-sample/Condition/cond-dm2",
      );
    },
  );

  it("returns null for a malformed reference", () => {
    expect(
      resourceViewerHref(SAMPLE_AGENT_ANSWER, {
        reference: "Procedure/x",
      }),
    ).toBeNull();
  });
});

describe("uniqueEvidence", () => {
  it("dedupes within a single claim", () => {
    const claim = {
      id: "c",
      text: "x",
      evidence: [
        { reference: "Condition/a" },
        { reference: "Condition/a" },
        { reference: "Condition/b" },
      ],
    };
    expect(uniqueEvidence(claim).map((r) => r.reference)).toEqual([
      "Condition/a",
      "Condition/b",
    ]);
  });
});
