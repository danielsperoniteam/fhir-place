import { z } from "zod";
import type { Patient } from "fhir/r4";
import { PatientIdField, type ToolDef } from "../registry.js";
import { runRead } from "./_shared.js";

export const GetPatientInput = z.object({ patientId: PatientIdField });
export type GetPatientInput = z.infer<typeof GetPatientInput>;

export const getPatient: ToolDef<GetPatientInput, Patient | null> = {
  name: "getPatient",
  version: "1",
  description: "Read the Patient resource for the session's authorized patient.",
  input: GetPatientInput,
  resourceAllowlist: ["Patient"],
  resultLimit: 1,
  timeoutMs: 10_000,
  async execute(ctx, input) {
    return runRead<Patient>(ctx, "Patient", input.patientId);
  },
};
