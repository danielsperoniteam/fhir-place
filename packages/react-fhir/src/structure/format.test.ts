import { describe, expect, it } from "vitest";
import {
  formatAddress,
  formatCodeableConcept,
  formatCoding,
  formatDosage,
  formatFhirDateTime,
  formatHumanName,
  formatPeriod,
  formatQuantity,
  formatReferenceLabel,
  formatTiming,
} from "./format.js";

describe("formatHumanName", () => {
  it("uses text when present", () => {
    expect(formatHumanName({ text: "Ada Lovelace" })).toBe("Ada Lovelace");
  });

  it("joins prefix + given + family + suffix when text is absent", () => {
    expect(
      formatHumanName({
        prefix: ["Dr."],
        given: ["Ada", "Augusta"],
        family: "Lovelace",
        suffix: ["PhD"],
      }),
    ).toBe("Dr. Ada Augusta Lovelace PhD");
  });

  it("handles empty / missing fields gracefully", () => {
    expect(formatHumanName({})).toBe("");
    expect(formatHumanName(undefined)).toBe("");
    expect(formatHumanName({ family: "Solo" })).toBe("Solo");
  });
});

describe("formatAddress", () => {
  it("uses text when present", () => {
    expect(formatAddress({ text: "1 Apple Park Way, Cupertino, CA" })).toBe(
      "1 Apple Park Way, Cupertino, CA",
    );
  });

  it("joins line + city + state + postal + country", () => {
    expect(
      formatAddress({
        line: ["1 Apple Park Way", "MS 169-CL"],
        city: "Cupertino",
        state: "CA",
        postalCode: "95014",
        country: "USA",
      }),
    ).toBe("1 Apple Park Way, MS 169-CL, Cupertino, CA, 95014, USA");
  });

  it("handles missing fields", () => {
    expect(formatAddress({})).toBe("");
    expect(formatAddress(undefined)).toBe("");
    expect(formatAddress({ city: "Reykjavik" })).toBe("Reykjavik");
  });
});

describe("formatCoding", () => {
  it("prefers display, falls back to code, then empty string", () => {
    expect(formatCoding({ display: "Heart rate", code: "8867-4" })).toBe(
      "Heart rate",
    );
    expect(formatCoding({ code: "8867-4" })).toBe("8867-4");
    expect(formatCoding({})).toBe("");
    expect(formatCoding(undefined)).toBe("");
  });
});

describe("formatCodeableConcept", () => {
  it("prefers .text, then coding[0].display, then coding[0].code", () => {
    expect(formatCodeableConcept({ text: "Hypertension" })).toBe(
      "Hypertension",
    );
    expect(
      formatCodeableConcept({
        coding: [{ display: "Hypertension", code: "I10" }],
      }),
    ).toBe("Hypertension");
    expect(
      formatCodeableConcept({ coding: [{ code: "I10" }] }),
    ).toBe("I10");
  });

  it("returns empty string when nothing meaningful is present", () => {
    expect(formatCodeableConcept({})).toBe("");
    expect(formatCodeableConcept(undefined)).toBe("");
    expect(formatCodeableConcept({ coding: [] })).toBe("");
  });
});

describe("formatQuantity", () => {
  it("renders value + unit, preferring `unit` over `code`", () => {
    expect(formatQuantity({ value: 130, unit: "mmHg" })).toBe("130 mmHg");
    expect(formatQuantity({ value: 130, code: "mm[Hg]" })).toBe("130 mm[Hg]");
  });

  it("includes comparator when present", () => {
    expect(formatQuantity({ comparator: "<", value: 6.5, unit: "%" })).toBe(
      "<6.5 %",
    );
  });

  it("handles missing fields", () => {
    expect(formatQuantity(undefined)).toBe("");
    expect(formatQuantity({})).toBe("");
    expect(formatQuantity({ value: 0 })).toBe("0");
  });
});

describe("formatFhirDateTime", () => {
  it("locale-formats a parseable dateTime", () => {
    const iso = "2026-03-09T06:20:00Z";
    expect(formatFhirDateTime(iso)).toBe(new Date(iso).toLocaleString());
  });

  it("returns the raw value for unparseable input", () => {
    expect(formatFhirDateTime("not-a-date")).toBe("not-a-date");
  });

  it("returns an empty string for undefined", () => {
    expect(formatFhirDateTime(undefined)).toBe("");
  });

  it("preserves date-only precision: YYYY-MM-DD does not shift timezone", () => {
    // new Date("2022-02-01") is UTC midnight; in ET that becomes Jan 31.
    // The formatter must keep Feb 1 by parsing the components as local time.
    const result = formatFhirDateTime("2022-02-01");
    const expected = new Date(2022, 1, 1).toLocaleDateString(); // local Feb 1
    expect(result).toBe(expected);
  });

  it("preserves date-only precision: YYYY-MM returns a local date string", () => {
    const result = formatFhirDateTime("2022-02");
    const expected = new Date(2022, 1, 1).toLocaleDateString();
    expect(result).toBe(expected);
  });

  it("returns the year string as-is for year-only FHIR dates", () => {
    expect(formatFhirDateTime("2022")).toBe("2022");
  });
});

describe("formatPeriod", () => {
  it("locale-formats each side of the range like a single dateTime", () => {
    const start = "2026-03-09T06:20:00Z";
    const end = "2026-03-09T06:35:00Z";
    // Regression for #564: the Period branch must use the same human-readable
    // locale format as the single performedDateTime branch, not raw ISO.
    expect(formatPeriod({ start, end })).toBe(
      `${new Date(start).toLocaleString()} → ${new Date(end).toLocaleString()}`,
    );
  });

  it("renders ellipsis fallbacks for a missing bound", () => {
    const start = "2024-01-01T00:00:00Z";
    expect(formatPeriod({ start })).toBe(
      `${new Date(start).toLocaleString()} → …`,
    );
    expect(formatPeriod({})).toBe("… → …");
    expect(formatPeriod(undefined)).toBe("");
  });
});

describe("formatReferenceLabel", () => {
  it("uses text on a HumanName-bearing resource", () => {
    expect(
      formatReferenceLabel({
        resourceType: "Patient",
        id: "1",
        name: [{ text: "Ada Lovelace" }],
      } as never),
    ).toBe("Ada Lovelace");
  });

  it("joins given + family when text is absent", () => {
    expect(
      formatReferenceLabel({
        resourceType: "Patient",
        id: "1",
        name: [{ given: ["Ada"], family: "Lovelace" }],
      } as never),
    ).toBe("Ada Lovelace");
  });

  it("uses string `name` for Organization-shaped resources", () => {
    expect(
      formatReferenceLabel({
        resourceType: "Organization",
        id: "o1",
        name: "Acme Health",
      } as never),
    ).toBe("Acme Health");
  });

  it("uses CodeableConcept text on observation-shaped resources", () => {
    expect(
      formatReferenceLabel({
        resourceType: "Observation",
        id: "obs1",
        code: { text: "Heart rate" },
      } as never),
    ).toBe("Heart rate");
  });

  it("falls back to coding[0].display when CodeableConcept has no text", () => {
    expect(
      formatReferenceLabel({
        resourceType: "Observation",
        id: "obs1",
        code: { coding: [{ display: "Heart rate", code: "8867-4" }] },
      } as never),
    ).toBe("Heart rate");
  });

  it("uses `title` as a last resort before Type/id", () => {
    expect(
      formatReferenceLabel({
        resourceType: "Composition",
        id: "c1",
        title: "Discharge summary",
      } as never),
    ).toBe("Discharge summary");
  });

  it("last-resort fallback: Type/id", () => {
    expect(
      formatReferenceLabel({ resourceType: "Device", id: "dev-1" } as never),
    ).toBe("Device/dev-1");
  });
});

describe("formatTiming", () => {
  it("uses a known abbreviation code", () => {
    expect(
      formatTiming({
        code: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation",
              code: "BID",
            },
          ],
        },
      }),
    ).toBe("twice daily");
  });

  it("builds a phrase from frequency + period", () => {
    expect(formatTiming({ repeat: { frequency: 2, period: 1, periodUnit: "d" } })).toBe(
      "2 times per day",
    );
    expect(formatTiming({ repeat: { frequency: 1, period: 8, periodUnit: "h" } })).toBe(
      "once every 8 hours",
    );
  });

  it("renders periodMax and countMax as ranges", () => {
    expect(
      formatTiming({ repeat: { frequency: 1, period: 4, periodMax: 6, periodUnit: "h" } }),
    ).toBe("once every 4–6 hours");
    expect(
      formatTiming({ repeat: { frequency: 1, period: 1, periodMax: 2, periodUnit: "d" } }),
    ).toBe("once every 1–2 days");
    expect(formatTiming({ repeat: { count: 3, countMax: 5 } })).toBe("for 3–5 occurrences");
  });

  it("includes Timing.event alongside a repeat phrase", () => {
    expect(
      formatTiming({
        event: ["2024-01-01T08:00:00Z"],
        repeat: { frequency: 1, period: 1, periodUnit: "d" },
      }),
    ).toBe("once per day (at 2024-01-01T08:00:00Z)");
    // event-only timing renders the timestamps directly
    expect(formatTiming({ event: ["2024-01-01T08:00:00Z", "2024-01-02T08:00:00Z"] })).toBe(
      "2024-01-01T08:00:00Z, 2024-01-02T08:00:00Z",
    );
  });

  it("includes repeat.offset with the when phrase", () => {
    expect(
      formatTiming({ repeat: { when: ["AC"], offset: 30 } }),
    ).toBe("30 minutes before meals");
    // neutral event codes get a "(+N minutes)" suffix (FHIR default = after)
    expect(
      formatTiming({ repeat: { when: ["WAKE"], offset: 30 } }),
    ).toBe("on waking (+30 minutes)");
  });

  it("appends when / count modifiers", () => {
    expect(
      formatTiming({
        repeat: { frequency: 1, period: 1, periodUnit: "d", when: ["HS"], count: 5 },
      }),
    ).toBe("once per day at bedtime for 5 occurrences");
  });

  it("prefers code.text over coding display", () => {
    expect(
      formatTiming({ code: { text: "every other Tuesday", coding: [{ display: "x" }] } }),
    ).toBe("every other Tuesday");
  });

  it("does not expand abbreviation codes that lack an explicit v3-GTS system", () => {
    expect(
      formatTiming({
        code: { coding: [{ code: "BID" }] },
        repeat: { frequency: 3, period: 1, periodUnit: "d" },
      }),
    ).toBe("3 times per day");
    // …but a coding whose system *is* v3-GTS still expands.
    expect(
      formatTiming({
        code: {
          coding: [
            { system: "http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation", code: "TID" },
          ],
        },
      }),
    ).toBe("three times daily");
  });

  it("renders bounds-only timings instead of an em-dash", () => {
    const boundsStart = "2024-01-01T00:00:00Z";
    const boundsEnd = "2024-03-01T00:00:00Z";
    expect(
      formatTiming({ repeat: { boundsPeriod: { start: boundsStart, end: boundsEnd } } }),
    ).toBe(
      `${new Date(boundsStart).toLocaleString()} → ${new Date(boundsEnd).toLocaleString()}`,
    );
    expect(
      formatTiming({ repeat: { boundsDuration: { value: 14, unit: "days" } } }),
    ).toBe("for 14 days");
    expect(
      formatTiming({
        repeat: { boundsRange: { low: { value: 7, unit: "d" }, high: { value: 10, unit: "d" } } },
      }),
    ).toBe("for 7 d–10 d");
  });

  it("appends bounds to a coded cadence", () => {
    expect(
      formatTiming({
        code: {
          coding: [
            { system: "http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation", code: "BID" },
          ],
        },
        repeat: { boundsDuration: { value: 10, unit: "days" } },
      }),
    ).toBe("twice daily for 10 days");
  });

  it("keeps per-occurrence duration alongside a frequency cadence", () => {
    expect(
      formatTiming({
        repeat: { frequency: 3, period: 1, periodUnit: "d", duration: 30, durationUnit: "min" },
      }),
    ).toBe("3 times per day over 30 minutes");
  });

  it("renders durationMax as a range", () => {
    expect(
      formatTiming({ repeat: { duration: 20, durationMax: 30, durationUnit: "min" } }),
    ).toBe("over 20–30 minutes");
  });

  it("treats a populated Timing.code as the complete schedule (ignoring repeat modifiers)", () => {
    expect(
      formatTiming({
        code: {
          coding: [
            { system: "http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation", code: "TID" },
          ],
        },
        repeat: { when: ["AC"], count: 9, frequency: 5, period: 1, periodUnit: "h" },
      }),
    ).toBe("three times daily");
    // …but bounds[x] is still layered on top.
    expect(
      formatTiming({
        code: { text: "with meals" },
        repeat: { when: ["PC"], boundsDuration: { value: 5, unit: "days" } },
      }),
    ).toBe("with meals for 5 days");
  });

  it("ignores abbreviation codes from non-v3-GTS systems", () => {
    // A code "BID" from some unrelated terminology must not become "twice daily".
    expect(
      formatTiming({
        code: {
          coding: [{ system: "http://example.org/other", code: "BID", display: "Bid label" }],
        },
        repeat: { frequency: 3, period: 1, periodUnit: "d" },
      }),
    ).toBe("Bid label");
    expect(
      formatTiming({
        code: { coding: [{ system: "http://example.org/other", code: "BID" }] },
        repeat: { frequency: 3, period: 1, periodUnit: "d" },
      }),
    ).toBe("3 times per day");
  });

  it("omits the period clause when periodUnit is missing", () => {
    expect(formatTiming({ repeat: { frequency: 2 } })).toBe("2 times");
    expect(formatTiming({ repeat: { frequency: 1, period: 3 } })).toBe("once");
  });

  it("falls back to the raw coding.code when there is no display or text", () => {
    expect(
      formatTiming({ code: { coding: [{ system: "http://snomed.info/sct", code: "307468000" }] } }),
    ).toBe("307468000");
  });

  it("returns '' for empty timing", () => {
    expect(formatTiming(undefined)).toBe("");
    expect(formatTiming({})).toBe("");
  });
});

describe("formatDosage", () => {
  it("returns the authored text verbatim", () => {
    expect(formatDosage({ text: "1 tab twice daily" })).toBe("1 tab twice daily");
  });

  it("assembles dose + schedule when text is absent", () => {
    expect(
      formatDosage({
        doseAndRate: [{ doseQuantity: { value: 1, unit: "tablet" } }],
        timing: { repeat: { frequency: 2, period: 1, periodUnit: "d" } },
      }),
    ).toBe("1 tablet 2 times per day");
  });

  it("summarises rate-only dosage instructions", () => {
    expect(
      formatDosage({
        doseAndRate: [
          { rateRatio: { numerator: { value: 100, unit: "mL" }, denominator: { value: 1, unit: "h" } } },
        ],
      }),
    ).toBe("100 mL / 1 h");
    expect(
      formatDosage({ doseAndRate: [{ rateQuantity: { value: 50, unit: "mL/h" } }] }),
    ).toBe("50 mL/h");
  });

  it("formats one-sided dose ranges without a dangling dash", () => {
    expect(
      formatDosage({ doseAndRate: [{ doseRange: { low: { value: 5, unit: "mg" } } }] }),
    ).toBe("≥ 5 mg");
    expect(
      formatDosage({ doseAndRate: [{ doseRange: { high: { value: 10, unit: "mg" } } }] }),
    ).toBe("≤ 10 mg");
    expect(
      formatDosage({
        doseAndRate: [{ doseRange: { low: { value: 5, unit: "mg" }, high: { value: 10, unit: "mg" } } }],
      }),
    ).toBe("5 mg–10 mg");
  });

  it("includes route and as-needed", () => {
    expect(
      formatDosage({
        doseAndRate: [{ doseQuantity: { value: 400, unit: "mg" } }],
        route: { text: "oral" },
        asNeededBoolean: true,
      }),
    ).toBe("400 mg oral, as needed");
  });

  it("returns '' for empty dosage", () => {
    expect(formatDosage(undefined)).toBe("");
    expect(formatDosage({})).toBe("");
  });
});
