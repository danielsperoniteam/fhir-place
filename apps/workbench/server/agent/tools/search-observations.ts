import { z } from "zod";
import type { Observation } from "fhir/r4";
import { PatientIdField, type ToolDef } from "../registry.js";
import {
  appendDateRange,
  clampLimit,
  dateRangeSchema,
  limitSchema,
  runPatientSearch,
} from "./_shared.js";

/**
 * USCDI / common Observation categories. The allow-list is conservative on
 * purpose — anything outside it (e.g. `survey`, `imaging`, `procedure`) is
 * rejected at the input boundary.
 */
export const ObservationCategory = z.enum([
  "vital-signs",
  "laboratory",
  "social-history",
  "exam",
  "therapy",
  "activity",
]);
export type ObservationCategory = z.infer<typeof ObservationCategory>;

export const SearchObservationsInput = z.object({
  patientId: PatientIdField,
  category: ObservationCategory.optional(),
  dateRange: dateRangeSchema.optional(),
  limit: limitSchema,
});
export type SearchObservationsInput = z.infer<typeof SearchObservationsInput>;

export const searchObservationsForPatient: ToolDef<
  SearchObservationsInput,
  Observation[]
> = {
  name: "searchObservationsForPatient",
  version: "1",
  description:
    "Search Observation resources for the session's authorized patient. " +
    "Optional `category` narrows by observation category code; optional " +
    "`dateRange` { from, to } narrows by effective date.",
  input: SearchObservationsInput,
  resourceAllowlist: ["Observation"],
  resultLimit: 50,
  timeoutMs: 15_000,
  async execute(ctx, input) {
    const limit = clampLimit(input.limit);
    const params = new URLSearchParams();
    if (input.category) params.set("category", input.category);
    appendDateRange(params, input.dateRange, "date");
    return runPatientSearch<Observation>(
      ctx,
      "Observation",
      input.patientId,
      params,
      limit,
    );
  },
};
