import { describe, it, expect } from "vitest";
import type { Patient } from "fhir/r4";
import {
  asUSCorePatientProfile,
  type USCorePatientProfile,
} from "./us-core-7.js";

/**
 * Type-level test for the profile-aware codegen spike (issue #123).
 *
 * The assertions are compile-time. Each `// @ts-expect-error` line FAILS the
 * build if the assignment it guards becomes valid, which is exactly the
 * "did the brand actually narrow?" signal the spike needs.
 */
describe("US Core 7 spike — type-level narrowing", () => {
  it("rejects an unprofiled Patient missing must-support fields", () => {
    const unprofiled: Patient = { resourceType: "Patient" };

    // @ts-expect-error - unprofiled Patient is missing must-support fields
    // (identifier, name, telecom, gender, birthDate, address, communication,
    // extension) and the USCorePatientProfileBrand symbol.
    const profiled: USCorePatientProfile = unprofiled;

    expect(profiled).toBe(unprofiled);
  });

  it("rejects a Patient missing only `name` (a must-support field)", () => {
    const almost = {
      resourceType: "Patient",
      identifier: [{ system: "urn:test", value: "abc" }],
      // name omitted on purpose — should still error
      telecom: [{ system: "phone", value: "555-0100" }],
      gender: "female",
      birthDate: "1990-01-01",
      address: [{ city: "Boston", state: "MA" }],
      communication: [{ language: { text: "en" } }],
      extension: [],
    } satisfies Patient;

    // @ts-expect-error - missing `name` (min=1 must-support per US Core)
    const profiled = asUSCorePatientProfile(almost);

    expect(profiled).toBeDefined();
  });

  it("accepts a fully-populated Patient via the as*() helper", () => {
    const profiled = asUSCorePatientProfile({
      resourceType: "Patient",
      identifier: [{ system: "urn:test", value: "abc" }],
      name: [{ family: "Smith", given: ["Jane"] }],
      telecom: [{ system: "phone", value: "555-0100" }],
      gender: "female",
      birthDate: "1990-01-01",
      address: [{ city: "Boston", state: "MA" }],
      communication: [{ language: { text: "en" } }],
      extension: [],
    });

    expect(profiled.resourceType).toBe("Patient");
    expect(profiled.name[0]?.family).toBe("Smith");
  });
});
