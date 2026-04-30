import { z } from "zod";
import type { Condition } from "fhir/r4";
import { PatientIdField, type ToolDef } from "../registry.js";
import { clampLimit, limitSchema, runPatientSearch } from "./_shared.js";

export const ClinicalStatus = z.enum([
  "active",
  "recurrence",
  "relapse",
  "inactive",
  "remission",
  "resolved",
]);
export type ClinicalStatus = z.infer<typeof ClinicalStatus>;

export const SearchConditionsInput = z.object({
  patientId: PatientIdField,
  clinicalStatus: ClinicalStatus.optional(),
  limit: limitSchema,
});
export type SearchConditionsInput = z.infer<typeof SearchConditionsInput>;

export const searchConditionsForPatient: ToolDef<
  SearchConditionsInput,
  Condition[]
> = {
  name: "searchConditionsForPatient",
  version: "1",
  description:
    "Search Condition resources for the session's authorized patient. " +
    "Optional `clinicalStatus` narrows by FHIR clinical-status code.",
  input: SearchConditionsInput,
  resourceAllowlist: ["Condition"],
  resultLimit: 50,
  timeoutMs: 15_000,
  async execute(ctx, input) {
    const limit = clampLimit(input.limit);
    const params = new URLSearchParams();
    if (input.clinicalStatus) params.set("clinical-status", input.clinicalStatus);
    return runPatientSearch<Condition>(
      ctx,
      "Condition",
      input.patientId,
      params,
      limit,
    );
  },
};
