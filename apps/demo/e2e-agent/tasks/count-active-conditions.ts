import type { TaskDef } from "../agent/types.js";

export const countActiveConditions: TaskDef = {
  id: "count-active-conditions",
  goal: "Open the patient list, pick the first patient who has any conditions, and report the count of *active* (not resolved/inactive) Condition records on their detail page.",
  successHints: [
    "Patient list rows are data-testid='patient-row' in list layout, 'resource-row' in table layout — try both. Condition list rows follow the same pattern as 'condition-row'/'resource-row'.",
    "Detail pages render compartment chips with data-testid='compartment-links'; the Condition chip shows a count.",
    "Clicking the Condition chip navigates to a filtered list — clinical-status is one of the visible columns there.",
    "If the first patient has zero conditions, walk forward to the next one until you find one with at least one Condition. Don't assert across patients — pick one and answer for that one.",
  ],
  postChecks: {
    noConsoleErrors: true,
    mustVisitRoute: "#/Condition",
  },
  mutatesData: false,
  maxSteps: 22,
};
