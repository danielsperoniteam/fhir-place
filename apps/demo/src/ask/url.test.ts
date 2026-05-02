import { describe, expect, it } from "vitest";
import { buildSearchUrl, parseSearchUrl, sameOrigin } from "./url.js";

describe("buildSearchUrl", () => {
  it("appends params to resource type", () => {
    expect(
      buildSearchUrl("https://hapi.fhir.org/baseR4", {
        resourceType: "Patient",
        params: {
          "_has:Condition:patient:code": "44054006",
          birthdate: "lt1961-01-01",
        },
      }),
    ).toBe(
      "https://hapi.fhir.org/baseR4/Patient?_has%3ACondition%3Apatient%3Acode=44054006&birthdate=lt1961-01-01",
    );
  });

  it("trims a trailing slash from baseUrl", () => {
    expect(
      buildSearchUrl("https://x.example/fhir/", {
        resourceType: "Observation",
        params: {},
      }),
    ).toBe("https://x.example/fhir/Observation");
  });

  it("skips empty values", () => {
    expect(
      buildSearchUrl("https://x/fhir", {
        resourceType: "Patient",
        params: { name: "ada", gender: "" },
      }),
    ).toBe("https://x/fhir/Patient?name=ada");
  });
});

describe("parseSearchUrl", () => {
  it("splits resource type, base, and params", () => {
    const parsed = parseSearchUrl(
      "https://hapi.fhir.org/baseR4/Patient?name=ada&_count=20",
    );
    expect(parsed.resourceType).toBe("Patient");
    expect(parsed.baseUrl).toBe("https://hapi.fhir.org/baseR4");
    expect(parsed.params).toEqual({ name: "ada", _count: "20" });
  });

  it("decodes encoded params", () => {
    const parsed = parseSearchUrl(
      "https://x/fhir/Patient?_has%3ACondition%3Apatient%3Acode=44054006",
    );
    expect(parsed.params).toEqual({
      "_has:Condition:patient:code": "44054006",
    });
  });
});

describe("sameOrigin", () => {
  const ref = "https://app.example/";

  it("matches identical absolute origins", () => {
    expect(
      sameOrigin(
        "https://hapi.fhir.org/baseR4/Patient?name=ada",
        "https://hapi.fhir.org/baseR4",
        ref,
      ),
    ).toBe(true);
  });

  it("rejects different hosts", () => {
    expect(
      sameOrigin(
        "https://attacker.example/Patient",
        "https://hapi.fhir.org/baseR4",
        ref,
      ),
    ).toBe(false);
  });

  it("rejects http vs https on the same host", () => {
    expect(
      sameOrigin(
        "http://hapi.fhir.org/baseR4/Patient",
        "https://hapi.fhir.org/baseR4",
        ref,
      ),
    ).toBe(false);
  });

  it("treats relative base URLs as same-origin against the reference", () => {
    expect(sameOrigin("https://app.example/fhir/Patient", "/fhir", ref)).toBe(true);
    expect(sameOrigin("https://other.example/fhir/Patient", "/fhir", ref)).toBe(false);
  });

  it("returns false for malformed inputs", () => {
    expect(sameOrigin("not a url", "https://x", ref)).toBe(false);
  });
});
