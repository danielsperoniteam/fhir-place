import { describe, expect, it } from "vitest";
import {
  formatAddress,
  formatCodeableConcept,
  formatCoding,
  formatDateTime,
  formatHumanName,
  formatPeriod,
  formatQuantity,
  formatReferenceLabel,
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

describe("formatDateTime", () => {
  it("returns year and year-month partial dates verbatim", () => {
    expect(formatDateTime("2019")).toBe("2019");
    expect(formatDateTime("2019-09")).toBe("2019-09");
  });

  it("spells out a full calendar date without inventing a time", () => {
    expect(formatDateTime("2019-09-07")).toBe("Sep 7, 2019");
  });

  it("renders a date-time with a time component", () => {
    const out = formatDateTime("2019-09-07T17:39:34+00:00");
    expect(out).not.toBe("2019-09-07T17:39:34+00:00");
    expect(out).toContain("2019");
    expect(out).toMatch(/\d:\d{2}/);
  });

  it("falls back to the raw string when unparseable", () => {
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
    expect(formatDateTime(undefined)).toBe("");
    expect(formatDateTime("")).toBe("");
  });

  it("does not normalise an out-of-range full date", () => {
    expect(formatDateTime("2021-02-31")).toBe("2021-02-31");
    expect(formatDateTime("2021-13-01")).toBe("2021-13-01");
  });

  it("does not normalise an out-of-range date-time", () => {
    expect(formatDateTime("2021-02-31T00:00:00Z")).toBe("2021-02-31T00:00:00Z");
    expect(formatDateTime("2021-04-06T25:01:00Z")).toBe("2021-04-06T25:01:00Z");
  });

  it("rejects out-of-range timezone offsets", () => {
    // Hour 14 only valid with :00 minutes; +14:30 is not a real FHIR offset.
    expect(formatDateTime("2021-01-01T00:00:00+14:30")).toBe(
      "2021-01-01T00:00:00+14:30",
    );
    expect(formatDateTime("2021-01-01T00:00:00+15:00")).toBe(
      "2021-01-01T00:00:00+15:00",
    );
    expect(formatDateTime("2021-01-01T00:00:00+05:75")).toBe(
      "2021-01-01T00:00:00+05:75",
    );
  });

  it("rejects year 0000 and other out-of-range years", () => {
    // FHIR date/dateTime years are 0001..9999.
    expect(formatDateTime("0000-01-01")).toBe("0000-01-01");
    expect(formatDateTime("0000-01-01T00:00:00Z")).toBe("0000-01-01T00:00:00Z");
  });

  it("does not remap low years (0001-0099) onto the 20th century", () => {
    // `new Date(yy, …)` would map year 99 → 1999; the helper must not.
    const low = formatDateTime("0099-12-31");
    expect(low).not.toBe("0099-12-31");
    expect(low).not.toMatch(/199\d/);
    expect(low).toMatch(/\b99\b/);
    expect(formatDateTime("0001-01-01")).not.toBe("0001-01-01");
  });

  it("accepts real-world half- and quarter-hour offsets", () => {
    // India (+05:30), Nepal (+05:45), Chatham Islands (+12:45), and the
    // boundary +14:00 are all valid FHIR offsets.
    for (const tz of ["+05:30", "+05:45", "+12:45", "+14:00", "-09:30"]) {
      const out = formatDateTime(`2021-01-01T00:00:00${tz}`);
      expect(out).not.toBe(`2021-01-01T00:00:00${tz}`);
    }
  });
});

describe("formatPeriod", () => {
  it("renders start → end with ellipsis fallbacks", () => {
    expect(formatPeriod({ start: "2024-01-01", end: "2024-12-31" })).toBe(
      "Jan 1, 2024 → Dec 31, 2024",
    );
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
