import { describe, expect, it } from "vitest";
import {
  formatAddress,
  formatCodeableConcept,
  formatCoding,
  formatDateTime,
  formatDosage,
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
    // Code-only quantities decode the UCUM symbol for display (#368).
    expect(formatQuantity({ value: 130, code: "mm[Hg]" })).toBe("130 mmHg");
    expect(formatQuantity({ value: 4.5, code: "10*9/L" })).toBe("4.5 10⁹/L");
    expect(formatQuantity({ value: 12, code: "ug/dL" })).toBe("12 µg/dL");
  });

  it("only decodes the code as UCUM when the system is UCUM or absent", () => {
    expect(
      formatQuantity({
        value: 37,
        code: "Cel",
        system: "http://unitsofmeasure.org",
      }),
    ).toBe("37 °C");
    // A site-specific system scopes its own codes — leave them untouched.
    expect(
      formatQuantity({
        value: 37,
        code: "Cel",
        system: "http://example.org/units",
      }),
    ).toBe("37 Cel");
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

describe("formatDateTime", () => {
  it("renders date-only values without a fabricated time", () => {
    expect(formatDateTime("2018-08-30")).toBe("Aug 30, 2018");
  });

  it("renders full timestamps as wall-clock time in UTC", () => {
    // UTC pin keeps the rendering deterministic across dev / CI / clinician
    // browsers — 21:24 UTC is always "9:24 PM" in the output.
    expect(formatDateTime("2018-08-30T21:24:36+00:00")).toBe(
      "Aug 30, 2018, 9:24 PM",
    );
    expect(formatDateTime("2018-08-30T21:24:36Z")).toBe(
      "Aug 30, 2018, 9:24 PM",
    );
  });

  it("renders partial-precision year and year-month forms", () => {
    expect(formatDateTime("2018")).toBe("2018");
    expect(formatDateTime("2018-08")).toBe("Aug 2018");
  });

  it("formats midnight and noon at boundary hours", () => {
    expect(formatDateTime("2018-08-30T00:00:00Z")).toBe(
      "Aug 30, 2018, 12:00 AM",
    );
    expect(formatDateTime("2018-08-30T12:00:00Z")).toBe(
      "Aug 30, 2018, 12:00 PM",
    );
  });

  it("returns '' for empty input and falls back to the raw string for unparseable inputs", () => {
    expect(formatDateTime(undefined)).toBe("");
    expect(formatDateTime("")).toBe("");
    expect(formatDateTime("not a date")).toBe("not a date");
  });
});

describe("formatPeriod", () => {
  it("humanises start and end and joins them with an arrow", () => {
    expect(formatPeriod({ start: "2024-01-01", end: "2024-12-31" })).toBe(
      "Jan 1, 2024 → Dec 31, 2024",
    );
  });

  it("collapses to a single date when start and end share the same UTC day", () => {
    expect(
      formatPeriod({
        start: "2018-08-30T21:24:36+00:00",
        end: "2018-08-30T21:41:36+00:00",
      }),
    ).toBe("Aug 30, 2018, 9:24 PM → 9:41 PM");
  });

  it("does not collapse when only one end has time precision", () => {
    expect(
      formatPeriod({ start: "2018-08-30", end: "2018-08-30T21:41:36Z" }),
    ).toBe("Aug 30, 2018 → Aug 30, 2018, 9:41 PM");
  });

  it("falls back to ellipsis for missing bounds and returns '' for undefined", () => {
    expect(formatPeriod({ start: "2024-01-01" })).toBe("Jan 1, 2024 → …");
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
    expect(
      formatTiming({ repeat: { boundsPeriod: { start: "2024-01-01", end: "2024-03-01" } } }),
    ).toBe("Jan 1, 2024 → Mar 1, 2024");
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
