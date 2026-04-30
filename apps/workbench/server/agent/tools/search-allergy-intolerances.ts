import { z } from "zod";
import type { AllergyIntolerance } from "fhir/r4";
import { PatientIdField, type ToolDef } from "../registry.js";
import { clampLimit, limitSchema, runPatientSearch } from "./_shared.js";

export const SearchAllergyIntolerancesInput = z.object({
  patientId: PatientIdField,
  limit: limitSchema,
});
export type SearchAllergyIntolerancesInput = z.infer<
  typeof SearchAllergyIntolerancesInput
>;

export const searchAllergyIntolerancesForPatient: ToolDef<
  SearchAllergyIntolerancesInput,
  AllergyIntolerance[]
> = {
  name: "searchAllergyIntolerancesForPatient",
  version: "1",
  description:
    "Search AllergyIntolerance resources for the session's authorized patient. " +
    "Returns the raw resources; an empty array means 'no allergy data found' " +
    "and must NOT be summarised as 'no known allergies'.",
  input: SearchAllergyIntolerancesInput,
  resourceAllowlist: ["AllergyIntolerance"],
  resultLimit: 50,
  timeoutMs: 15_000,
  async execute(ctx, input) {
    const limit = clampLimit(input.limit);
    return runPatientSearch<AllergyIntolerance>(
      ctx,
      "AllergyIntolerance",
      input.patientId,
      new URLSearchParams(),
      limit,
    );
  },
};
