import { describe, expect, it } from "vitest";
import { searchBuilder } from "./searchBuilder.js";
import { buildSearchParams } from "./searchParams.js";

describe("searchBuilder runtime", () => {
  it("builds a path with no params", () => {
    expect(searchBuilder("Patient").build()).toBe("Patient");
  });

  it("emits string operators", () => {
    const url = searchBuilder("Patient").where("name", "Smith").build();
    expect(url).toBe("Patient?name=Smith");
  });

  it("emits token operators", () => {
    const url = searchBuilder("Patient")
      .where("identifier", "http://hospital.example|abc")
      .build();
    expect(url).toBe(
      "Patient?identifier=http%3A%2F%2Fhospital.example%7Cabc",
    );
  });

  it("emits reference operators", () => {
    const url = searchBuilder("Observation")
      .where("subject", "Patient/123")
      .build();
    expect(url).toBe("Observation?subject=Patient%2F123");
  });

  it("emits date prefix operators in given order", () => {
    const url = searchBuilder("Patient")
      .where("birthdate", { ge: "1990-01-01", lt: "2000-01-01" })
      .build();
    expect(url).toBe(
      "Patient?birthdate=ge1990-01-01&birthdate=lt2000-01-01",
    );
  });

  it("ISO-formats Date values for date params", () => {
    const url = searchBuilder("Observation")
      .where("date", new Date("2024-01-02T03:04:05.000Z"))
      .build();
    expect(url).toBe("Observation?date=2024-01-02T03%3A04%3A05.000Z");
  });

  it("emits number operators", () => {
    const url = searchBuilder("Observation")
      .where("value-quantity", { gt: 5, le: 10 })
      .build();
    expect(url).toBe(
      "Observation?value-quantity=gt5&value-quantity=le10",
    );
  });

  it("emits _include", () => {
    const url = searchBuilder("Patient")
      .include("Patient:general-practitioner")
      .build();
    expect(url).toBe(
      "Patient?_include=Patient%3Ageneral-practitioner",
    );
  });

  it("emits _revinclude", () => {
    const url = searchBuilder("Patient")
      .revInclude("Observation:subject")
      .build();
    expect(url).toBe(
      "Patient?_revinclude=Observation%3Asubject",
    );
  });

  it("chains multiple wheres and include", () => {
    const url = searchBuilder("Patient")
      .where("name", "Smith")
      .where("birthdate", { ge: "1990-01-01" })
      .include("Patient:general-practitioner")
      .build();
    expect(url).toBe(
      "Patient?name=Smith&birthdate=ge1990-01-01&_include=Patient%3Ageneral-practitioner",
    );
  });

  it("matches the existing search serializer byte-for-byte for shared cases", () => {
    const built = searchBuilder("Patient")
      .where("name", "Smith")
      .where("birthdate", "ge1990-01-01")
      .include("Patient:general-practitioner")
      .toQueryString();
    const reference = buildSearchParams({
      name: "Smith",
      birthdate: "ge1990-01-01",
      _include: "Patient:general-practitioner",
    }).toString();
    expect(built).toBe(reference);
  });
});

describe("searchBuilder types", () => {
  it("rejects mistyped values and unknown include specs at compile time", () => {
    const b = searchBuilder("Patient");

    // Well-typed calls compile cleanly.
    b.where("name", "Smith");
    b.where("birthdate", { ge: "1990-01-01" });
    b.where("birthdate", new Date("1990-01-01"));
    b.include("Patient:general-practitioner");
    b.revInclude("Observation:subject");

    // @ts-expect-error name is a string param; number is not assignable.
    b.where("name", 1);
    // @ts-expect-error 'bogus' is not a registered Patient search param.
    b.where("bogus", "x");
    // @ts-expect-error 'value-quantity' is not on Patient.
    b.where("value-quantity", 5);
    // @ts-expect-error 'Observation:bogus' is not in the include allow-list.
    b.include("Observation:bogus");
    // @ts-expect-error wrong shape for date range.
    b.where("birthdate", { foo: "bar" });

    expect(true).toBe(true);
  });

  it("scopes include/revInclude allow-lists to the searched resource", () => {
    const obs = searchBuilder("Observation");

    // include must match the searched resource as the path SOURCE.
    obs.include("Observation:subject");
    // @ts-expect-error 'Patient:general-practitioner' source is Patient, not Observation.
    obs.include("Patient:general-practitioner");

    // revInclude must match the searched resource as the path TARGET.
    // Observation has no v0 revInclude entries, so any spec is rejected.
    // @ts-expect-error Observation has no revInclude allow-list entries.
    obs.revInclude("Observation:subject");
    // @ts-expect-error same: cross-resource revInclude is rejected.
    obs.revInclude("Patient:general-practitioner");

    const pat = searchBuilder("Patient");
    pat.revInclude("Observation:subject");
    // @ts-expect-error Patient.general-practitioner targets Practitioner, not Patient.
    pat.revInclude("Patient:general-practitioner");

    expect(true).toBe(true);
  });
});
