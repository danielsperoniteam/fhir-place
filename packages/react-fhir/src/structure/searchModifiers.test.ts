import { describe, expect, it } from "vitest";
import {
  joinModifierKey,
  modifiersForType,
  splitModifierKey,
} from "./searchModifiers.js";

describe("modifiersForType", () => {
  it("narrows modifiers per FHIR search type", () => {
    expect(modifiersForType("string")).toEqual(["exact", "contains", "missing"]);
    expect(modifiersForType("token")).toContain("not");
    expect(modifiersForType("token")).not.toContain("exact");
    expect(modifiersForType("reference")).toEqual(["identifier", "missing"]);
    expect(modifiersForType("date")).toEqual(["missing"]);
  });

  it("returns empty for composite/special/unknown types", () => {
    expect(modifiersForType("composite")).toEqual([]);
    expect(modifiersForType("special")).toEqual([]);
    expect(modifiersForType(undefined)).toEqual([]);
    expect(modifiersForType("banana")).toEqual([]);
  });
});

describe("splitModifierKey / joinModifierKey", () => {
  it("splits a modifier key and round-trips through join", () => {
    expect(splitModifierKey("given:exact")).toEqual({
      name: "given",
      modifier: "exact",
    });
    expect(joinModifierKey("given", "exact")).toBe("given:exact");
    expect(joinModifierKey("given")).toBe("given");
  });

  it("leaves bare names untouched", () => {
    expect(splitModifierKey("given")).toEqual({ name: "given" });
  });

  it("does not treat chained or type-qualified keys as modifiers", () => {
    // `subject:Patient` qualifies the reference type; `subject:Patient.name`
    // is a chain — both belong to PR C's chain handling, not modifiers.
    expect(splitModifierKey("subject:Patient")).toEqual({
      name: "subject:Patient",
    });
    expect(splitModifierKey("subject:Patient.name")).toEqual({
      name: "subject:Patient.name",
    });
  });
});
