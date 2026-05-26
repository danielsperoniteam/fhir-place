import type { StructureDefinition } from "fhir/r4";
import { describe, expect, it } from "vitest";
import {
  labelFromFhirPath,
  mergeFhirPathColumns,
  summaryColumnsFromStructureDefinition,
  topLevelColumnsFromStructureDefinition,
} from "./columns.js";

const patientSd: StructureDefinition = {
  resourceType: "StructureDefinition",
  id: "Patient",
  url: "http://hl7.org/fhir/StructureDefinition/Patient",
  name: "Patient",
  status: "active",
  kind: "resource",
  abstract: false,
  type: "Patient",
  snapshot: {
    element: [
      { id: "Patient", path: "Patient", min: 0, max: "*" },
      { id: "Patient.id", path: "Patient.id", min: 0, max: "1", isSummary: true },
      { id: "Patient.meta", path: "Patient.meta", min: 0, max: "1" },
      { id: "Patient.name", path: "Patient.name", min: 0, max: "*", isSummary: true },
      { id: "Patient.photo", path: "Patient.photo", min: 0, max: "*" },
      { id: "Patient.link", path: "Patient.link", min: 0, max: "*" },
      {
        id: "Patient.contact",
        path: "Patient.contact",
        min: 0,
        max: "*",
        isSummary: true,
      },
      {
        id: "Patient.contact.name",
        path: "Patient.contact.name",
        min: 0,
        max: "1",
        isSummary: true,
      },
    ],
  },
};

describe("FHIR StructureDefinition column helpers", () => {
  it("derives every direct top-level field from a StructureDefinition", () => {
    expect(topLevelColumnsFromStructureDefinition("Patient", patientSd)).toEqual([
      { path: "id", label: "Id" },
      { path: "meta", label: "Meta" },
      { path: "name", label: "Name" },
      { path: "photo", label: "Photo" },
      { path: "link", label: "Link" },
      { path: "contact", label: "Contact" },
    ]);
  });

  it("derives default candidates from direct isSummary elements only", () => {
    expect(summaryColumnsFromStructureDefinition("Patient", patientSd)).toEqual([
      "id",
      "name",
      "contact",
    ]);
  });

  it("keeps preferred columns first and generates labels for derived or unlabeled paths", () => {
    expect(
      mergeFhirPathColumns(
        [
          { path: "name", label: "Patient name" },
          { path: "birthDate" },
        ],
        topLevelColumnsFromStructureDefinition("Patient", patientSd),
      ),
    ).toEqual([
      { path: "name", label: "Patient name" },
      { path: "birthDate", label: "Birth Date" },
      { path: "id", label: "Id" },
      { path: "meta", label: "Meta" },
      { path: "photo", label: "Photo" },
      { path: "link", label: "Link" },
      { path: "contact", label: "Contact" },
    ]);
  });

  it("turns FHIR paths into readable labels", () => {
    expect(labelFromFhirPath("statusReason")).toBe("Status Reason");
    expect(labelFromFhirPath("effective[x]")).toBe("Effective");
    expect(labelFromFhirPath("address.postalCode")).toBe("Postal Code");
  });
});
