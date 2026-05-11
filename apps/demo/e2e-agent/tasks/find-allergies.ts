import type { TaskDef } from "../agent/types.js";

export const findAllergies: TaskDef = {
  id: "find-allergies",
  goal: "Open the patient list, pick the third patient, and report whether they have any AllergyIntolerance records (including a count, even if zero).",
  successHints: [
    "The patient list is at #/Patient and renders rows with data-testid='patient-row'.",
    "Clicking a patient navigates to a detail page with a 'compartment-links' chip nav.",
    "The AllergyIntolerance compartment chip shows a count next to its label.",
  ],
  postChecks: {
    noConsoleErrors: true,
    mustVisitRoute: "#/Patient/",
  },
  mutatesData: false,
  maxSteps: 20,
};
