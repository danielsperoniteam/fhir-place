import { createRegistry, type ToolDef } from "../registry.js";
import { getPatient } from "./get-patient.js";
import { searchConditionsForPatient } from "./search-conditions.js";
import { searchMedicationRequestsForPatient } from "./search-medication-requests.js";
import { searchAllergyIntolerancesForPatient } from "./search-allergy-intolerances.js";
import { searchEncountersForPatient } from "./search-encounters.js";
import { searchObservationsForPatient } from "./search-observations.js";

export const PHASE_A_TOOLS: ReadonlyArray<
  ToolDef<{ patientId: string }, unknown>
> = [
  getPatient as ToolDef<{ patientId: string }, unknown>,
  searchConditionsForPatient as ToolDef<{ patientId: string }, unknown>,
  searchMedicationRequestsForPatient as ToolDef<{ patientId: string }, unknown>,
  searchAllergyIntolerancesForPatient as ToolDef<{ patientId: string }, unknown>,
  searchEncountersForPatient as ToolDef<{ patientId: string }, unknown>,
  searchObservationsForPatient as ToolDef<{ patientId: string }, unknown>,
];

export function createPhaseATools() {
  return createRegistry(PHASE_A_TOOLS);
}

export {
  getPatient,
  searchConditionsForPatient,
  searchMedicationRequestsForPatient,
  searchAllergyIntolerancesForPatient,
  searchEncountersForPatient,
  searchObservationsForPatient,
};
