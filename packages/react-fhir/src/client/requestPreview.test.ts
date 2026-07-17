import { describe, expect, it } from "vitest";
import { formatSearchRequest, parseSearchRequest } from "./requestPreview.js";

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

describe("parseSearchRequest", () => {
  it("parses an absolute URL into type, params, and baseUrl", () => {
    const r = parseSearchRequest(
      "https://hapi.fhir.org/baseR4/Patient?name=smith&_count=20",
    );
    expect(r).toEqual({
      resourceType: "Patient",
      params: { name: "smith", _count: "20" },
      baseUrl: "https://hapi.fhir.org/baseR4",
    });
  });

  it("parses a relative path and a bare query", () => {
    expect(parseSearchRequest("/Patient?name=smith")).toEqual({
      resourceType: "Patient",
      params: { name: "smith" },
      baseUrl: undefined,
    });
    expect(parseSearchRequest("Patient?name=smith")).toEqual({
      resourceType: "Patient",
      params: { name: "smith" },
      baseUrl: undefined,
    });
  });

  it("collapses repeated keys to arrays and keeps comma values intact", () => {
    const r = parseSearchRequest("/Patient?identifier=a&identifier=b&code=x,y");
    expect(r.params).toEqual({ identifier: ["a", "b"], code: "x,y" });
  });

  it("passes modifiers and chained params through unchanged", () => {
    const r = parseSearchRequest(
      "/Observation?subject:Patient.name=smith&code:text=glucose",
    );
    expect(r.params).toEqual({
      "subject:Patient.name": "smith",
      "code:text": "glucose",
    });
  });

  it("round-trips whatever formatSearchRequest produces", () => {
    const params = {
      name: "o'brien & sons",
      identifier: ["sys|a", "sys|b"],
      date: "ge2024-01-01",
      _count: 20,
    };
    const formatted = formatSearchRequest("https://fhir.example/r4", "Patient", params);
    const parsed = parseSearchRequest(formatted.url);
    expect(parsed.resourceType).toBe("Patient");
    expect(parsed.baseUrl).toBe("https://fhir.example/r4");
    // Numbers stringify on the wire; everything else survives verbatim.
    expect(parsed.params).toEqual({ ...params, _count: "20" });
    // And the parse output feeds straight back into format.
    expect(
      formatSearchRequest(parsed.baseUrl!, parsed.resourceType, parsed.params).url,
    ).toBe(formatted.url);
  });

  it("throws on input with no resource type", () => {
    expect(() => parseSearchRequest("?name=smith")).toThrow(/resource type/i);
    expect(() => parseSearchRequest("   ")).toThrow(/empty/i);
    expect(() => parseSearchRequest("https://x.test/lowercase?a=b")).toThrow(
      /resource type/i,
    );
  });
});
