import { describe, expect, it } from "vitest";
import {
  LAYOUT_HINTS,
  getLayoutHint,
  getTier,
  tier1ResourceTypes,
} from "./hints.js";

describe("getLayoutHint", () => {
  it("returns the hint for a registered resource type", () => {
    const hint = getLayoutHint("AllergyIntolerance");
    expect(hint).toBeDefined();
    expect(hint?.detail?.hero).toContain("code");
    expect(hint?.list?.title).toBe("code");
  });

  it("returns undefined for unregistered resource types", () => {
    expect(getLayoutHint("MeasureReport")).toBeUndefined();
    expect(getLayoutHint("CapabilityStatement")).toBeUndefined();
    expect(getLayoutHint("")).toBeUndefined();
  });

  it("exposes the same registry via LAYOUT_HINTS", () => {
    expect(LAYOUT_HINTS["Patient"]).toBe(getLayoutHint("Patient"));
  });
});

describe("getTier", () => {
  it("returns 0 for resources without a hint", () => {
    expect(getTier("MeasureReport")).toBe(0);
    expect(getTier("CapabilityStatement")).toBe(0);
    expect(getTier("Bundle")).toBe(0);
  });

  it("returns 1 for hint-only resources", () => {
    expect(getTier("Patient")).toBe(1);
    expect(getTier("Observation")).toBe(1);
    expect(getTier("AllergyIntolerance")).toBe(1);
  });

  it("returns 2 when the resource is also in the bespoke view registry", () => {
    const bespoke = new Set(["Patient", "Observation"]);
    expect(getTier("Patient", bespoke)).toBe(2);
    expect(getTier("Observation", bespoke)).toBe(2);
    expect(getTier("AllergyIntolerance", bespoke)).toBe(1);
    expect(getTier("MeasureReport", bespoke)).toBe(0);
  });

  it("accepts a plain array for the bespoke set", () => {
    expect(getTier("Patient", ["Patient"])).toBe(2);
    expect(getTier("Patient", [])).toBe(1);
  });
});

describe("tier1ResourceTypes", () => {
  it("includes the spec's top 10 resource types", () => {
    const required = [
      "Patient",
      "Observation",
      "Condition",
      "Encounter",
      "MedicationRequest",
      "AllergyIntolerance",
      "DiagnosticReport",
      "Procedure",
      "Immunization",
      "DocumentReference",
    ];
    const actual = tier1ResourceTypes();
    for (const rt of required) {
      expect(actual).toContain(rt);
    }
  });
});

describe("hint shape", () => {
  it("every Tier 1 hint has a list and detail block", () => {
    for (const rt of tier1ResourceTypes()) {
      const hint = getLayoutHint(rt);
      expect(hint, rt).toBeDefined();
      expect(hint?.list, `${rt}.list`).toBeDefined();
      expect(hint?.detail, `${rt}.detail`).toBeDefined();
      expect(hint?.detail?.hero.length, `${rt}.detail.hero`).toBeGreaterThan(0);
      expect(hint?.detail?.sections.length, `${rt}.detail.sections`).toBeGreaterThan(0);
    }
  });

  it("hint values are JSON-serialisable (no closures, no JSX)", () => {
    for (const rt of tier1ResourceTypes()) {
      const hint = getLayoutHint(rt);
      expect(() => JSON.parse(JSON.stringify(hint))).not.toThrow();
      const round = JSON.parse(JSON.stringify(hint));
      expect(round).toEqual(hint);
    }
  });
});
