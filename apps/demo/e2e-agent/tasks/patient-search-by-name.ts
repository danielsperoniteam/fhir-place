import type { TaskDef } from "../agent/types.js";

export const patientSearchByName: TaskDef = {
  id: "patient-search-by-name",
  goal: "On the Patient list, pick a family name visible in the unfiltered list (e.g. read one off the first row), search for it via the search form, and verify the resulting rows all contain that name. Report whether the row-count badge agrees with the visible row count.",
  successHints: [
    "The search form is data-testid='resource-search'. The Patient list URL is #/Patient.",
    "Patient rows render as data-testid='patient-row' (list layout) or 'resource-row' (table layout); try both. The row-count badge is data-testid='patient-row-counts'.",
    "Pick a family name observable on the page — don't invent names. The goal is to verify search filters correctly, not to find a specific patient.",
    "Report 'bug-suspected' only if the row-count badge and visible row count clearly disagree, or if filtered rows include patients whose names don't match.",
  ],
  postChecks: {
    noConsoleErrors: true,
    mustVisitRoute: "#/Patient",
  },
  mutatesData: false,
  maxSteps: 20,
};
