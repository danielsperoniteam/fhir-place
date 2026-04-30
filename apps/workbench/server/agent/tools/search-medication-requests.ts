import { z } from "zod";
import type { MedicationRequest } from "fhir/r4";
import { PatientIdField, type ToolDef } from "../registry.js";
import { clampLimit, limitSchema, runPatientSearch } from "./_shared.js";

export const MedicationRequestStatus = z.enum([
  "active",
  "on-hold",
  "cancelled",
  "completed",
  "entered-in-error",
  "stopped",
  "draft",
  "unknown",
]);
export type MedicationRequestStatus = z.infer<typeof MedicationRequestStatus>;

export const SearchMedicationRequestsInput = z.object({
  patientId: PatientIdField,
  status: MedicationRequestStatus.optional(),
  limit: limitSchema,
});
export type SearchMedicationRequestsInput = z.infer<
  typeof SearchMedicationRequestsInput
>;

export const searchMedicationRequestsForPatient: ToolDef<
  SearchMedicationRequestsInput,
  MedicationRequest[]
> = {
  name: "searchMedicationRequestsForPatient",
  version: "1",
  description:
    "Search MedicationRequest resources for the session's authorized patient. " +
    "Optional `status` narrows by FHIR medication-request status.",
  input: SearchMedicationRequestsInput,
  resourceAllowlist: ["MedicationRequest"],
  resultLimit: 50,
  timeoutMs: 15_000,
  async execute(ctx, input) {
    const limit = clampLimit(input.limit);
    const params = new URLSearchParams();
    if (input.status) params.set("status", input.status);
    return runPatientSearch<MedicationRequest>(
      ctx,
      "MedicationRequest",
      input.patientId,
      params,
      limit,
    );
  },
};
