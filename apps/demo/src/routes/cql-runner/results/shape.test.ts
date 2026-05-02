import { describe, expect, it } from "vitest";
import { inferShape } from "./shape.js";

describe("inferShape", () => {
  it("classifies primitives", () => {
    expect(inferShape(true)).toBe("boolean");
    expect(inferShape(0)).toBe("number");
    expect(inferShape("hi")).toBe("string");
    expect(inferShape(null)).toBe("null");
    expect(inferShape(undefined)).toBe("null");
  });

  it("classifies CQL Date / DateTime", () => {
    expect(inferShape({ isDate: true, year: 2024, month: 1, day: 1 })).toBe("date");
    expect(inferShape({ isDateTime: true, year: 2024, month: 1, day: 1 })).toBe("datetime");
  });

  it("classifies Quantity / Code / Concept / Interval", () => {
    expect(inferShape({ value: 10, unit: "mg" })).toBe("quantity");
    expect(inferShape({ code: "abc", system: "http://x" })).toBe("code");
    expect(inferShape({ coding: [{ code: "x", system: "http://x" }], text: "X" })).toBe(
      "concept",
    );
    expect(
      inferShape({ low: { isDate: true, year: 2020 }, high: null, lowClosed: true }),
    ).toBe("interval");
  });

  it("classifies tuples vs FHIR resources", () => {
    expect(inferShape({ a: 1, b: 2 })).toBe("tuple");
    expect(inferShape({ resourceType: "Patient", id: "1" })).toBe("resource");
  });

  it("classifies list shapes", () => {
    expect(inferShape([])).toBe("list-empty");
    expect(inferShape([1, 2, 3])).toBe("list-primitive");
    expect(inferShape([{ resourceType: "Observation" }])).toBe("list-resource");
    expect(inferShape([{ a: 1 }, { a: 2 }])).toBe("list-tuple");
  });

  it("falls back to unknown for opaque shapes", () => {
    class Box {}
    expect(inferShape(new Box())).toBe("tuple");
    expect(inferShape(Symbol("x") as unknown)).toBe("unknown");
  });
});
