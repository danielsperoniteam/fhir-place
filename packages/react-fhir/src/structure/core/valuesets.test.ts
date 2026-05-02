import { describe, expect, it } from "vitest";
import { bindingFor, codesFromValueSet } from "../binding.js";
import { findElement } from "../walker.js";
import { AllergyIntoleranceStructureDefinition } from "./AllergyIntolerance.js";
import { EncounterStructureDefinition } from "./Encounter.js";
import { ImmunizationStructureDefinition } from "./Immunization.js";
import { MedicationRequestStructureDefinition } from "./MedicationRequest.js";
import { PatientStructureDefinition } from "./Patient.js";
import { ProcedureStructureDefinition } from "./Procedure.js";
import { bundledValueSetUrls, coreValueSet, coreValueSets } from "./valuesets.js";

describe("bundled core ValueSets", () => {
  it("returns undefined for an unknown canonical URL", () => {
    expect(coreValueSet("http://example.org/unknown")).toBeUndefined();
    expect(coreValueSet(undefined)).toBeUndefined();
  });

  it("bundles administrative-gender with the four spec values", () => {
    const vs = coreValueSet("http://hl7.org/fhir/ValueSet/administrative-gender");
    expect(vs).toBeDefined();
    const codes = codesFromValueSet(vs);
    expect(codes.map((c) => c.code)).toEqual(["male", "female", "other", "unknown"]);
    expect(codes.every((c) => c.system === "http://hl7.org/fhir/administrative-gender")).toBe(true);
  });

  it("bundles observation-status with the 8 spec values", () => {
    const vs = coreValueSet("http://hl7.org/fhir/ValueSet/observation-status");
    expect(vs).toBeDefined();
    const codes = codesFromValueSet(vs).map((c) => c.code);
    expect(codes).toContain("registered");
    expect(codes).toContain("final");
    expect(codes).toContain("entered-in-error");
    expect(codes.length).toBe(8);
  });

  it("bundles task-status with 'in-progress' included", () => {
    const codes = codesFromValueSet(
      coreValueSet("http://hl7.org/fhir/ValueSet/task-status"),
    );
    expect(codes.map((c) => c.code)).toContain("in-progress");
  });

  it("exposes every bundled URL via bundledValueSetUrls", () => {
    expect(bundledValueSetUrls.length).toBeGreaterThanOrEqual(13);
    for (const url of bundledValueSetUrls) {
      expect(coreValueSet(url)).toBeDefined();
    }
    // URL list always includes hand-curated entries.
    for (const url of coreValueSets.keys()) {
      expect(bundledValueSetUrls).toContain(url);
    }
  });

  it("every bundled ValueSet produces at least one code", () => {
    for (const url of bundledValueSetUrls) {
      const codes = codesFromValueSet(coreValueSet(url));
      expect(codes.length).toBeGreaterThan(0);
    }
  });

  // For HAPI-compatible offline coverage of `<TokenSearchField>` dropdowns:
  // every status/category/etc. param the bundled SDs bind to a ValueSet must
  // resolve through the bundle's fallback (no server hits required).
  describe("token search params resolve to bundled VS via bundled SDs", () => {
    interface Case {
      sd: typeof MedicationRequestStructureDefinition;
      cases: Array<{ path: string; expectedVs: string; expectedCode: string }>;
    }
    const cases: Case[] = [
      {
        sd: MedicationRequestStructureDefinition,
        cases: [
          { path: "MedicationRequest.status", expectedVs: "http://hl7.org/fhir/ValueSet/medicationrequest-status", expectedCode: "active" },
          { path: "MedicationRequest.intent", expectedVs: "http://hl7.org/fhir/ValueSet/medicationrequest-intent", expectedCode: "order" },
          { path: "MedicationRequest.priority", expectedVs: "http://hl7.org/fhir/ValueSet/request-priority", expectedCode: "routine" },
          { path: "MedicationRequest.category", expectedVs: "http://hl7.org/fhir/ValueSet/medicationrequest-category", expectedCode: "outpatient" },
        ],
      },
      {
        sd: ProcedureStructureDefinition,
        cases: [
          { path: "Procedure.status", expectedVs: "http://hl7.org/fhir/ValueSet/event-status", expectedCode: "completed" },
          { path: "Procedure.category", expectedVs: "http://hl7.org/fhir/ValueSet/procedure-category", expectedCode: "387713003" },
        ],
      },
      {
        sd: AllergyIntoleranceStructureDefinition,
        cases: [
          { path: "AllergyIntolerance.verificationStatus", expectedVs: "http://hl7.org/fhir/ValueSet/allergyintolerance-verification", expectedCode: "confirmed" },
          { path: "AllergyIntolerance.category", expectedVs: "http://hl7.org/fhir/ValueSet/allergy-intolerance-category", expectedCode: "medication" },
          { path: "AllergyIntolerance.criticality", expectedVs: "http://hl7.org/fhir/ValueSet/allergy-intolerance-criticality", expectedCode: "high" },
          { path: "AllergyIntolerance.type", expectedVs: "http://hl7.org/fhir/ValueSet/allergy-intolerance-type", expectedCode: "allergy" },
        ],
      },
      {
        sd: EncounterStructureDefinition,
        cases: [
          { path: "Encounter.status", expectedVs: "http://hl7.org/fhir/ValueSet/encounter-status", expectedCode: "in-progress" },
          { path: "Encounter.class", expectedVs: "http://terminology.hl7.org/ValueSet/v3-ActEncounterCode", expectedCode: "AMB" },
        ],
      },
      {
        sd: ImmunizationStructureDefinition,
        cases: [
          { path: "Immunization.status", expectedVs: "http://hl7.org/fhir/ValueSet/immunization-status", expectedCode: "completed" },
        ],
      },
      {
        sd: PatientStructureDefinition,
        cases: [
          { path: "Patient.gender", expectedVs: "http://hl7.org/fhir/ValueSet/administrative-gender", expectedCode: "female" },
          { path: "Patient.maritalStatus", expectedVs: "http://hl7.org/fhir/ValueSet/marital-status", expectedCode: "M" },
          { path: "Patient.contact.relationship", expectedVs: "http://hl7.org/fhir/ValueSet/patient-contactrelationship", expectedCode: "N" },
          { path: "Patient.contact.gender", expectedVs: "http://hl7.org/fhir/ValueSet/administrative-gender", expectedCode: "male" },
        ],
      },
    ];

    for (const { sd, cases: tcs } of cases) {
      for (const tc of tcs) {
        it(`${tc.path} → ${tc.expectedVs}`, () => {
          const el = findElement(sd, tc.path);
          expect(el).toBeDefined();
          const { valueSet } = bindingFor(el);
          expect(valueSet).toBe(tc.expectedVs);
          const vs = coreValueSet(valueSet);
          expect(vs).toBeDefined();
          const codes = codesFromValueSet(vs).map((c) => c.code);
          expect(codes).toContain(tc.expectedCode);
        });
      }
    }
  });
});
