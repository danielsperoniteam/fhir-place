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

  it("emits every date prefix operator in given order", () => {
    const url = searchBuilder("Patient")
      .where("birthdate", {
        eq: "1990-01-01",
        ne: "1991-01-01",
        gt: "1992-01-01",
        ge: "1993-01-01",
        lt: "1994-01-01",
        le: "1995-01-01",
        sa: "1996-01-01",
        eb: "1997-01-01",
        ap: "1998-01-01",
      })
      .build();
    expect(url).toBe(
      "Patient?birthdate=eq1990-01-01&birthdate=ne1991-01-01&birthdate=gt1992-01-01&birthdate=ge1993-01-01&birthdate=lt1994-01-01&birthdate=le1995-01-01&birthdate=sa1996-01-01&birthdate=eb1997-01-01&birthdate=ap1998-01-01",
    );
  });

  it("ISO-formats Date values for date params", () => {
    const url = searchBuilder("Observation")
      .where("date", new Date("2024-01-02T03:04:05.000Z"))
      .build();
    expect(url).toBe("Observation?date=2024-01-02T03%3A04%3A05.000Z");
  });

  it("emits every number prefix operator", () => {
    const url = searchBuilder("Observation")
      .where("value-quantity", {
        eq: 1,
        ne: 2,
        gt: 3,
        ge: 4,
        lt: 5,
        le: 6,
        ap: 7,
      })
      .build();
    expect(url).toBe(
      "Observation?value-quantity=eq1&value-quantity=ne2&value-quantity=gt3&value-quantity=ge4&value-quantity=lt5&value-quantity=le6&value-quantity=ap7",
    );
  });

  it("emits seeded _include specs", () => {
    expect(
      searchBuilder("Patient")
        .include("Patient:general-practitioner")
        .build(),
    ).toBe("Patient?_include=Patient%3Ageneral-practitioner");
    expect(
      searchBuilder("Observation").include("Observation:subject").build(),
    ).toBe("Observation?_include=Observation%3Asubject");
  });

  it("emits _revinclude", () => {
    const url = searchBuilder("Patient")
      .revInclude("Observation:subject")
      .build();
    expect(url).toBe("Patient?_revinclude=Observation%3Asubject");
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

  it("emits chained search with the :Type modifier", () => {
    const url = searchBuilder("Observation")
      .whereChained("subject", "Patient", "name", "Smith")
      .build();
    expect(url).toBe("Observation?subject%3APatient.name=Smith");
  });

  it("types chained values against the target param", () => {
    const url = searchBuilder("Observation")
      .whereChained("subject", "Patient", "birthdate", { ge: "1990-01-01" })
      .build();
    expect(url).toBe(
      "Observation?subject%3APatient.birthdate=ge1990-01-01",
    );
  });

  it("emits reverse chained _has", () => {
    const url = searchBuilder("Patient")
      .whereHas("Observation", "subject", "code", "85354-9")
      .build();
    expect(url).toBe(
      "Patient?_has%3AObservation%3Asubject%3Acode=85354-9",
    );
  });

  it("matches buildSearchParams byte-for-byte for chained and _has keys", () => {
    const chained = searchBuilder("Observation")
      .whereChained("subject", "Patient", "name", "Smith")
      .toQueryString();
    expect(chained).toBe(
      buildSearchParams({ "subject:Patient.name": "Smith" }).toString(),
    );

    const has = searchBuilder("Patient")
      .whereHas("Observation", "subject", "code", "85354-9")
      .toQueryString();
    expect(has).toBe(
      buildSearchParams({
        "_has:Observation:subject:code": "85354-9",
      }).toString(),
    );
  });

  it("composes chained + _has + plain wheres in declaration order", () => {
    const url = searchBuilder("Patient")
      .where("name", "Smith")
      .whereHas("Observation", "subject", "code", "85354-9")
      .build();
    expect(url).toBe(
      "Patient?name=Smith&_has%3AObservation%3Asubject%3Acode=85354-9",
    );
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

  it("rejects bogus chained / _has args at compile time", () => {
    const obs = searchBuilder("Observation");
    const pt = searchBuilder("Patient");

    // Well-typed calls compile cleanly.
    obs.whereChained("subject", "Patient", "name", "Smith");
    obs.whereChained("subject", "Patient", "birthdate", { ge: "1990-01-01" });
    pt.whereHas("Observation", "subject", "code", "85354-9");
    pt.whereHas("Observation", "patient", "status", "final");

    // @ts-expect-error 'Bogus' is not a SearchableResource.
    obs.whereChained("subject", "Bogus", "name", "x");
    // @ts-expect-error 'name' is not a reference param on Observation.
    obs.whereChained("name", "Patient", "name", "x");
    // @ts-expect-error target-param value type is enforced (birthdate is a date).
    obs.whereChained("subject", "Patient", "birthdate", 1);
    // @ts-expect-error 'bogus' is not a registered Patient search param.
    obs.whereChained("subject", "Patient", "bogus", "x");

    // @ts-expect-error 'Bogus' is not a SearchableResource.
    pt.whereHas("Bogus", "subject", "code", "x");
    // @ts-expect-error Observation.encounter does not target Patient.
    pt.whereHas("Observation", "encounter", "code", "x");
    // @ts-expect-error 'name' is not a reference param on Observation.
    pt.whereHas("Observation", "name", "code", "x");
    // @ts-expect-error 'value-quantity' on Observation is a number; string not assignable.
    pt.whereHas("Observation", "subject", "value-quantity", "x");

    expect(true).toBe(true);
  });
});
