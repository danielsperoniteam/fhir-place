import { describe, expect, it } from "vitest";
import { formatSearchRequest } from "./requestPreview.js";

describe("formatSearchRequest", () => {
  it("returns the bare resource path when no params are passed", () => {
    const r = formatSearchRequest("https://fhir.example/r4", "Patient");
    expect(r).toEqual({
      method: "GET",
      url: "https://fhir.example/r4/Patient",
      path: "/Patient",
      queryString: "",
      params: [],
    });
  });

  it("appends a query string when params are present", () => {
    const r = formatSearchRequest("https://fhir.example/r4", "Patient", {
      name: "smith",
      _count: 20,
    });
    expect(r.url).toBe("https://fhir.example/r4/Patient?name=smith&_count=20");
    expect(r.queryString).toBe("name=smith&_count=20");
    expect(r.params).toEqual([
      ["name", "smith"],
      ["_count", "20"],
    ]);
  });

  it("strips trailing slashes on the base URL", () => {
    const r = formatSearchRequest("https://fhir.example/r4//", "Patient", {
      name: "a",
    });
    expect(r.url).toBe("https://fhir.example/r4/Patient?name=a");
  });

  it("emits arrays as repeated keys (AND semantics)", () => {
    const r = formatSearchRequest("https://x", "Patient", {
      identifier: ["a", "b"],
    });
    expect(r.queryString).toBe("identifier=a&identifier=b");
    expect(r.params).toEqual([
      ["identifier", "a"],
      ["identifier", "b"],
    ]);
  });

  it("preserves FHIR prefix operators on date params", () => {
    const r = formatSearchRequest("https://x", "Observation", {
      date: "ge2024-01-01",
    });
    expect(r.queryString).toBe("date=ge2024-01-01");
  });
});
