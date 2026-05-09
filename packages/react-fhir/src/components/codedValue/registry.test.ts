import type { Coding } from "fhir/r4";
import { describe, expect, it } from "vitest";
import {
  FHIR_CODE_SYSTEMS,
  isKnown,
  labelForSystem,
  normalizeSystem,
  partition,
  pickPrimary,
} from "./registry.js";

describe("labelForSystem", () => {
  it("returns the registry label for known URIs", () => {
    expect(labelForSystem("http://snomed.info/sct")).toBe("SNOMED CT");
    expect(labelForSystem("http://loinc.org")).toBe("LOINC");
    expect(labelForSystem("http://www.nlm.nih.gov/research/umls/rxnorm")).toBe(
      "RxNorm",
    );
  });

  it("strips a `|version` suffix before lookup", () => {
    expect(
      labelForSystem("http://snomed.info/sct|http://snomed.info/sct/731000124108"),
    ).toBe("SNOMED CT");
  });

  it("returns undefined for unknown systems and undefined input", () => {
    expect(labelForSystem("http://example.org/custom")).toBeUndefined();
    expect(labelForSystem(undefined)).toBeUndefined();
    expect(labelForSystem("")).toBeUndefined();
  });
});

describe("normalizeSystem", () => {
  it("strips a `|version` suffix", () => {
    expect(normalizeSystem("http://snomed.info/sct|2024-09")).toBe(
      "http://snomed.info/sct",
    );
  });
  it("trims surrounding whitespace", () => {
    expect(normalizeSystem("  http://loinc.org  ")).toBe("http://loinc.org");
  });
  it("returns undefined for empty input", () => {
    expect(normalizeSystem(undefined)).toBeUndefined();
    expect(normalizeSystem("")).toBeUndefined();
    expect(normalizeSystem("|x")).toBeUndefined();
  });
});

describe("isKnown / partition", () => {
  const snomed: Coding = { system: "http://snomed.info/sct", code: "1" };
  const loinc: Coding = { system: "http://loinc.org", code: "2" };
  const oid: Coding = { system: "urn:oid:2.16.840.1.113883.6.96", code: "3" };
  const local: Coding = { system: "http://example.org/local", code: "4" };

  it("identifies known systems", () => {
    expect(isKnown(snomed)).toBe(true);
    expect(isKnown(loinc)).toBe(true);
    expect(isKnown(oid)).toBe(false);
    expect(isKnown(local)).toBe(false);
  });

  it("treats version-suffixed URIs as known", () => {
    expect(
      isKnown({ system: "http://snomed.info/sct|2024-09", code: "x" }),
    ).toBe(true);
  });

  it("partitions while preserving original order within each bucket", () => {
    const codings = [oid, snomed, local, loinc];
    const { known, hidden } = partition(codings);
    expect(known).toEqual([snomed, loinc]);
    expect(hidden).toEqual([oid, local]);
  });

  it("returns empty buckets for an empty list", () => {
    expect(partition([])).toEqual({ known: [], hidden: [] });
  });
});

describe("pickPrimary", () => {
  it("returns undefined for an empty list", () => {
    expect(pickPrimary([])).toBeUndefined();
  });

  it("userSelected wins regardless of priority or order", () => {
    const codings: Coding[] = [
      { system: "http://snomed.info/sct", code: "73211009" },
      {
        system: "http://hl7.org/fhir/sid/icd-10-cm",
        code: "E11.9",
        userSelected: true,
      },
    ];
    const primary = pickPrimary(codings);
    expect(primary?.code).toBe("E11.9");
  });

  it("lower priority number wins (class 1 beats class 2)", () => {
    const codings: Coding[] = [
      { system: "http://hl7.org/fhir/sid/icd-10-cm", code: "E11.9" },
      { system: "http://snomed.info/sct", code: "73211009" },
    ];
    expect(pickPrimary(codings)?.system).toBe("http://snomed.info/sct");
  });

  it("known beats unknown even when the unknown is listed first", () => {
    const codings: Coding[] = [
      { system: "http://example.org/custom", code: "x" },
      { system: "http://loinc.org", code: "8480-6" },
    ];
    expect(pickPrimary(codings)?.system).toBe("http://loinc.org");
  });

  it("ties are broken by original array order", () => {
    const codings: Coding[] = [
      { system: "http://loinc.org", code: "first" },
      { system: "http://snomed.info/sct", code: "second" },
    ];
    expect(pickPrimary(codings)?.code).toBe("first");
  });

  it("returns the only coding when there is just one", () => {
    const codings: Coding[] = [
      { system: "http://snomed.info/sct", code: "73211009" },
    ];
    expect(pickPrimary(codings)?.code).toBe("73211009");
  });

  it("falls back to the first coding when every system is unknown", () => {
    const codings: Coding[] = [
      { system: "http://example.org/a", code: "a" },
      { system: "http://example.org/b", code: "b" },
    ];
    expect(pickPrimary(codings)?.code).toBe("a");
  });

  it("treats version-suffixed URIs as their bare canonical for ranking", () => {
    const codings: Coding[] = [
      { system: "http://hl7.org/fhir/sid/icd-10-cm", code: "E11.9" },
      { system: "http://snomed.info/sct|2024-09", code: "73211009" },
    ];
    expect(pickPrimary(codings)?.code).toBe("73211009");
  });
});

describe("FHIR_CODE_SYSTEMS registry", () => {
  it("includes the headline class-1 systems", () => {
    expect(FHIR_CODE_SYSTEMS["http://snomed.info/sct"]?.priority).toBe(1);
    expect(FHIR_CODE_SYSTEMS["http://loinc.org"]?.priority).toBe(1);
    expect(
      FHIR_CODE_SYSTEMS["http://www.nlm.nih.gov/research/umls/rxnorm"]?.priority,
    ).toBe(1);
  });

  it("includes the headline class-2 systems", () => {
    expect(FHIR_CODE_SYSTEMS["http://hl7.org/fhir/sid/icd-10-cm"]?.priority).toBe(
      2,
    );
    expect(FHIR_CODE_SYSTEMS["http://www.ama-assn.org/go/cpt"]?.priority).toBe(
      2,
    );
  });
});
