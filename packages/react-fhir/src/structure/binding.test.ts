import type { ValueSet } from "fhir/r4";
import { describe, expect, it } from "vitest";
import { bindingFor, codesFromValueSet, isOpenBinding } from "./binding.js";

describe("bindingFor", () => {
  it("returns empty fields when element has no binding", () => {
    expect(bindingFor({ path: "Foo.bar" })).toEqual({
      strength: undefined,
      valueSet: undefined,
      description: undefined,
    });
  });

  it("returns undefined when element is undefined", () => {
    expect(bindingFor(undefined)).toEqual({
      strength: undefined,
      valueSet: undefined,
      description: undefined,
    });
  });

  it("extracts strength + valueSet when present", () => {
    expect(
      bindingFor({
        path: "Patient.gender",
        binding: {
          strength: "required",
          valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender",
          description: "The gender of a person used for administrative purposes.",
        },
      }),
    ).toEqual({
      strength: "required",
      valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender",
      description: "The gender of a person used for administrative purposes.",
    });
  });
});

describe("isOpenBinding", () => {
  it("returns false for required — hard enumeration, no free-text escape", () => {
    expect(isOpenBinding("required")).toBe(false);
  });

  it("returns false for extensible — closed enumeration per FHIR spec", () => {
    expect(isOpenBinding("extensible")).toBe(false);
  });

  it("returns true for preferred — FHIR spec allows implementers to use any code", () => {
    expect(isOpenBinding("preferred")).toBe(true);
  });

  it("returns true for example — non-normative binding, implementers MAY use any code", () => {
    expect(isOpenBinding("example")).toBe(true);
  });

  it("returns false when strength is undefined (no binding)", () => {
    expect(isOpenBinding(undefined)).toBe(false);
  });
});

describe("codesFromValueSet", () => {
  it("returns [] for undefined input", () => {
    expect(codesFromValueSet(undefined)).toEqual([]);
  });

  it("reads the expanded expansion.contains list when present", () => {
    const vs: ValueSet = {
      resourceType: "ValueSet",
      status: "active",
      url: "http://hl7.org/fhir/ValueSet/administrative-gender",
      expansion: {
        identifier: "x",
        timestamp: "2024-01-01T00:00:00Z",
        contains: [
          { system: "http://hl7.org/fhir/administrative-gender", code: "male", display: "Male" },
          { system: "http://hl7.org/fhir/administrative-gender", code: "female", display: "Female" },
          { system: "http://hl7.org/fhir/administrative-gender", code: "other", display: "Other" },
          { system: "http://hl7.org/fhir/administrative-gender", code: "unknown", display: "Unknown" },
        ],
      },
    };
    const codes = codesFromValueSet(vs);
    expect(codes.map((c) => c.code)).toEqual(["male", "female", "other", "unknown"]);
    expect(codes.every((c) => c.system === "http://hl7.org/fhir/administrative-gender")).toBe(true);
  });

  it("flattens nested expansion.contains (hierarchical ValueSets)", () => {
    const vs: ValueSet = {
      resourceType: "ValueSet",
      status: "active",
      expansion: {
        identifier: "x",
        timestamp: "2024-01-01T00:00:00Z",
        contains: [
          {
            system: "s",
            code: "group-A",
            display: "Group A",
            contains: [
              { system: "s", code: "a1" },
              { system: "s", code: "a2" },
            ],
          },
          { system: "s", code: "b1" },
        ],
      },
    };
    const codes = codesFromValueSet(vs);
    expect(codes.map((c) => c.code)).toEqual(["group-A", "b1", "a1", "a2"]);
  });

  it("falls back to compose.include[].concept[] when there is no expansion", () => {
    const vs: ValueSet = {
      resourceType: "ValueSet",
      status: "active",
      compose: {
        include: [
          {
            system: "http://hl7.org/fhir/task-status",
            concept: [
              { code: "draft", display: "Draft" },
              { code: "requested", display: "Requested" },
              { code: "in-progress", display: "In Progress" },
            ],
          },
        ],
      },
    };
    const codes = codesFromValueSet(vs);
    expect(codes).toHaveLength(3);
    expect(codes[0]).toEqual({
      system: "http://hl7.org/fhir/task-status",
      code: "draft",
      display: "Draft",
    });
  });

  it("prefers expansion over compose when both are present", () => {
    const vs: ValueSet = {
      resourceType: "ValueSet",
      status: "active",
      expansion: {
        identifier: "x",
        timestamp: "2024-01-01T00:00:00Z",
        contains: [{ system: "s", code: "from-expansion" }],
      },
      compose: {
        include: [{ system: "s", concept: [{ code: "from-compose" }] }],
      },
    };
    expect(codesFromValueSet(vs).map((c) => c.code)).toEqual(["from-expansion"]);
  });

  it("ignores compose.include entries that only reference other ValueSets when no resolver is provided", () => {
    const vs: ValueSet = {
      resourceType: "ValueSet",
      status: "active",
      compose: {
        include: [
          {
            system: "http://hl7.org/fhir/task-status",
            concept: [{ code: "draft" }],
          },
          {
            valueSet: ["http://example.com/other"], // recursive includes not supported
          },
        ],
      },
    };
    expect(codesFromValueSet(vs).map((c) => c.code)).toEqual(["draft"]);
  });

  describe("recursive compose.include.valueSet resolution", () => {
    it("resolves a single-level compose.include.valueSet reference via the resolver", () => {
      const referenced: ValueSet = {
        resourceType: "ValueSet",
        status: "active",
        url: "http://example.com/colors",
        compose: {
          include: [
            { system: "http://example.com/cs", concept: [{ code: "red" }, { code: "green" }] },
          ],
        },
      };
      const root: ValueSet = {
        resourceType: "ValueSet",
        status: "active",
        url: "http://example.com/root",
        compose: {
          include: [
            { system: "http://example.com/cs", concept: [{ code: "blue" }] },
            { valueSet: ["http://example.com/colors"] },
          ],
        },
      };
      const resolve = (url: string) => (url === referenced.url ? referenced : undefined);
      expect(
        codesFromValueSet(root, { resolve }).map((c) => c.code),
      ).toEqual(["blue", "red", "green"]);
    });

    it("resolves two levels of compose.include.valueSet", () => {
      const c: ValueSet = {
        resourceType: "ValueSet",
        status: "active",
        url: "http://example/c",
        compose: { include: [{ system: "s", concept: [{ code: "c1" }] }] },
      };
      const b: ValueSet = {
        resourceType: "ValueSet",
        status: "active",
        url: "http://example/b",
        compose: {
          include: [
            { system: "s", concept: [{ code: "b1" }] },
            { valueSet: ["http://example/c"] },
          ],
        },
      };
      const a: ValueSet = {
        resourceType: "ValueSet",
        status: "active",
        url: "http://example/a",
        compose: { include: [{ valueSet: ["http://example/b"] }] },
      };
      const map = new Map([["http://example/b", b], ["http://example/c", c]]);
      expect(
        codesFromValueSet(a, { resolve: (u) => map.get(u) }).map((c) => c.code),
      ).toEqual(["b1", "c1"]);
    });

    it("guards against self-reference cycles", () => {
      const a: ValueSet = {
        resourceType: "ValueSet",
        status: "active",
        url: "http://example/a",
        compose: {
          include: [
            { system: "s", concept: [{ code: "a1" }] },
            { valueSet: ["http://example/a"] }, // refers to itself
          ],
        },
      };
      const resolve = (u: string) => (u === a.url ? a : undefined);
      // should not infinite-loop, and should yield exactly one round of codes
      expect(codesFromValueSet(a, { resolve }).map((c) => c.code)).toEqual(["a1"]);
    });

    it("guards against transitive cycles (A → B → A)", () => {
      const a: ValueSet = {
        resourceType: "ValueSet",
        status: "active",
        url: "http://example/a",
        compose: {
          include: [
            { system: "s", concept: [{ code: "a1" }] },
            { valueSet: ["http://example/b"] },
          ],
        },
      };
      const b: ValueSet = {
        resourceType: "ValueSet",
        status: "active",
        url: "http://example/b",
        compose: {
          include: [
            { system: "s", concept: [{ code: "b1" }] },
            { valueSet: ["http://example/a"] },
          ],
        },
      };
      const map = new Map([[a.url!, a], [b.url!, b]]);
      const codes = codesFromValueSet(a, { resolve: (u) => map.get(u) }).map((c) => c.code);
      // first traversal of A yields a1, then B yields b1, then B's reference
      // back to A is short-circuited by the seen-set
      expect(codes).toEqual(["a1", "b1"]);
    });

    it("strips optional `|version` suffix on referenced canonicals", () => {
      const referenced: ValueSet = {
        resourceType: "ValueSet",
        status: "active",
        url: "http://example/v",
        compose: { include: [{ system: "s", concept: [{ code: "v1" }] }] },
      };
      const root: ValueSet = {
        resourceType: "ValueSet",
        status: "active",
        compose: { include: [{ valueSet: ["http://example/v|1.0.0"] }] },
      };
      expect(
        codesFromValueSet(root, {
          resolve: (u) => (u === "http://example/v" ? referenced : undefined),
        }).map((c) => c.code),
      ).toEqual(["v1"]);
    });
  });
});
