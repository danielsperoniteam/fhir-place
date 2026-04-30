import { z } from "zod";
import type { Encounter } from "fhir/r4";
import { PatientIdField, type ToolDef } from "../registry.js";
import {
  appendDateRange,
  clampLimit,
  dateRangeSchema,
  limitSchema,
  runPatientSearch,
} from "./_shared.js";

export const SearchEncountersInput = z.object({
  patientId: PatientIdField,
  dateRange: dateRangeSchema.optional(),
  limit: limitSchema,
});
export type SearchEncountersInput = z.infer<typeof SearchEncountersInput>;

export const searchEncountersForPatient: ToolDef<
  SearchEncountersInput,
  Encounter[]
> = {
  name: "searchEncountersForPatient",
  version: "1",
  description:
    "Search Encounter resources for the session's authorized patient. " +
    "Optional `dateRange` { from, to } narrows by encounter date.",
  input: SearchEncountersInput,
  resourceAllowlist: ["Encounter"],
  resultLimit: 50,
  timeoutMs: 15_000,
  async execute(ctx, input) {
    const limit = clampLimit(input.limit);
    const params = new URLSearchParams();
    appendDateRange(params, input.dateRange, "date");
    return runPatientSearch<Encounter>(
      ctx,
      "Encounter",
      input.patientId,
      params,
      limit,
    );
  },
};
