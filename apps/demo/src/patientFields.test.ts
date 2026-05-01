import type { StructureDefinition } from "fhir/r4";
import { describe, expect, it } from "vitest";
import { patientFieldOptions } from "./patientFields.js";

const fakePatientSd: StructureDefinition = {
  resourceType: "StructureDefinition",
  id: "Patient",
  url: "http://hl7.org/fhir/StructureDefinition/Patient",
  name: "Patient",
  status: "active",
  kind: "resource",
  abstract: false,
  type: "Patient",
  baseDefinition: "http://hl7.org/fhir/StructureDefinition/DomainResource",
  derivation: "specialization",
  snapshot: {
    element: [
      { path: "Patient", min: 0, max: "*" },
      { path: "Patient.name", min: 0, max: "*", short: "A name associated with the patient", type: [{ code: "HumanName" }] },
      { path: "Patient.gender", min: 0, max: "1", short: "male | female | other | unknown", type: [{ code: "code" }] },
      { path: "Patient.deceased[x]", min: 0, max: "1", short: "Indicates if the individual is deceased or not", type: [{ code: "boolean" }, { code: "dateTime" }] },
      { path: "Patient.contact.name", min: 0, max: "1", short: "Nested - should be excluded", type: [{ code: "HumanName" }] },
    ],
  },
};

describe("patientFieldOptions", () => {
  it("returns one option per top-level Patient element", () => {
    const opts = patientFieldOptions(fakePatientSd);
    const paths = opts.map((o) => o.path);
    expect(paths).toContain("name");
    expect(paths).toContain("gender");
  });

  it("expands choice [x] elements into one option per type variant", () => {
    const opts = patientFieldOptions(fakePatientSd);
    const paths = opts.map((o) => o.path);
    expect(paths).toContain("deceasedBoolean");
    expect(paths).toContain("deceasedDateTime");
  });

  it("excludes nested grand-children", () => {
    const opts = patientFieldOptions(fakePatientSd);
    expect(opts.find((o) => o.path === "contact.name")).toBeUndefined();
  });

  it("falls back to the path segment when short is too long or value-listy", () => {
    const opts = patientFieldOptions(fakePatientSd);
    expect(opts.find((o) => o.path === "gender")?.label).toBe("Gender");
  });
});
