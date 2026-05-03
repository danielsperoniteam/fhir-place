import type { Patient } from "fhir/r4";
import { describe, expect, it } from "vitest";
import { PatientStructureDefinition } from "../../test/fixtures/StructureDefinition-Patient.js";
import {
  directChildren,
  findChoiceVariant,
  findElement,
  isPrimitive,
  walkObject,
  walkResource,
} from "./walker.js";
import { ObservationStructureDefinition } from "../../test/fixtures/StructureDefinition-Observation.js";

const patient: Patient = {
  resourceType: "Patient",
  id: "abc",
  active: true,
  name: [{ given: ["Ada"], family: "Lovelace" }],
  gender: "female",
  birthDate: "1815-12-10",
  deceasedDateTime: "1852-11-27",
  address: [{ line: ["1 Workhouse Lane"], city: "London" }],
};

describe("directChildren", () => {
  it("returns only direct children of a path, not grandchildren", () => {
    const children = directChildren(PatientStructureDefinition, "Patient");
    const paths = children.map((e) => e.path);
    expect(paths).toContain("Patient.name");
    expect(paths).toContain("Patient.contact");
    expect(paths).not.toContain("Patient.contact.name");
  });

  it("returns children of a nested path", () => {
    const children = directChildren(PatientStructureDefinition, "Patient.contact");
    const paths = children.map((e) => e.path);
    expect(paths).toContain("Patient.contact.relationship");
    expect(paths).toContain("Patient.contact.name");
    // Exact set varies with how rich the bundled SD is; the contract is
    // "direct children only", asserted via the negative below.
    expect(paths.every((p) => p.startsWith("Patient.contact."))).toBe(true);
    expect(paths).not.toContain("Patient.contact.name.family");
  });
});

describe("findElement", () => {
  it("locates an element by exact path", () => {
    const el = findElement(PatientStructureDefinition, "Patient.gender");
    expect(el?.type?.[0]?.code).toBe("code");
  });

  it("returns undefined for unknown paths", () => {
    expect(findElement(PatientStructureDefinition, "Patient.wat")).toBeUndefined();
  });
});

describe("findChoiceVariant", () => {
  it("resolves a materialised value[x] variant to its choice element + type", () => {
    const v = findChoiceVariant(
      ObservationStructureDefinition,
      "Observation.valueQuantity",
    );
    expect(v?.element.path).toBe("Observation.value[x]");
    expect(v?.typeCode).toBe("Quantity");
  });

  it("resolves a multi-word type code (CodeableConcept) on a choice element", () => {
    const v = findChoiceVariant(
      ObservationStructureDefinition,
      "Observation.valueCodeableConcept",
    );
    expect(v?.typeCode).toBe("CodeableConcept");
  });

  it("resolves a choice variant nested inside a backbone element", () => {
    const v = findChoiceVariant(
      ObservationStructureDefinition,
      "Observation.component.valueQuantity",
    );
    expect(v?.element.path).toBe("Observation.component.value[x]");
    expect(v?.typeCode).toBe("Quantity");
  });

  it("returns undefined when no sibling [x] element exists", () => {
    expect(
      findChoiceVariant(ObservationStructureDefinition, "Observation.valueWat"),
    ).toBeUndefined();
    expect(
      findChoiceVariant(PatientStructureDefinition, "Patient.gender"),
    ).toBeUndefined();
  });
});

describe("walkResource", () => {
  it("emits only elements present in the resource, in SD order", () => {
    const walked = walkResource(PatientStructureDefinition, patient);
    const keys = walked.map((w) => w.key);
    expect(keys).toEqual([
      "id",
      "active",
      "name",
      "gender",
      "birthDate",
      "deceasedDateTime",
      "address",
    ]);
  });

  it("marks array elements correctly", () => {
    const walked = walkResource(PatientStructureDefinition, patient);
    expect(walked.find((w) => w.key === "name")?.isArray).toBe(true);
    expect(walked.find((w) => w.key === "gender")?.isArray).toBe(false);
  });

  it("resolves choice elements to the concrete variant", () => {
    const walked = walkResource(PatientStructureDefinition, patient);
    const deceased = walked.find((w) => w.path === "Patient.deceased[x]");
    expect(deceased?.isChoice).toBe(true);
    expect(deceased?.key).toBe("deceasedDateTime");
    expect(deceased?.typeCode).toBe("dateTime");
    expect(deceased?.value).toBe("1852-11-27");
  });

  it("skips empty arrays", () => {
    const walked = walkResource(PatientStructureDefinition, {
      ...patient,
      identifier: [],
    } as Patient);
    expect(walked.find((w) => w.key === "identifier")).toBeUndefined();
  });

  it("skips null and undefined values", () => {
    const walked = walkResource(PatientStructureDefinition, {
      resourceType: "Patient",
      id: "x",
      active: undefined,
      name: null,
    } as unknown as Patient);
    const keys = walked.map((w) => w.key);
    expect(keys).toEqual(["id"]);
  });

  it("falls back to the path for enum-shaped short descriptions", () => {
    const walked = walkResource(PatientStructureDefinition, patient);
    const gender = walked.find((w) => w.key === "gender");
    expect(gender?.label).toBe("Gender");
  });

  it("uses a short description when it looks like a label", () => {
    const walked = walkResource(PatientStructureDefinition, patient);
    const birth = walked.find((w) => w.key === "birthDate");
    expect(birth?.label).toBe("The date of birth for the individual");
  });
});

describe("walkObject", () => {
  it("walks a backbone element at a nested path", () => {
    const contact = {
      name: { given: ["Jane"], family: "Doe" },
    };
    const walked = walkObject(PatientStructureDefinition, "Patient.contact", contact);
    expect(walked.map((w) => w.key)).toEqual(["name"]);
    expect(walked[0]?.typeCode).toBe("HumanName");
  });
});

describe("isPrimitive", () => {
  it("recognises FHIR primitives", () => {
    expect(isPrimitive("string")).toBe(true);
    expect(isPrimitive("boolean")).toBe(true);
    expect(isPrimitive("dateTime")).toBe(true);
  });

  it("rejects complex types and undefined", () => {
    expect(isPrimitive("HumanName")).toBe(false);
    expect(isPrimitive("BackboneElement")).toBe(false);
    expect(isPrimitive(undefined)).toBe(false);
  });
});
