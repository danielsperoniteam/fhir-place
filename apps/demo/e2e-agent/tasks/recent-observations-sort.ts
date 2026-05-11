import type { TaskDef } from "../agent/types.js";

export const recentObservationsSort: TaskDef = {
  id: "recent-observations-sort",
  goal: "Open the first patient, navigate into their Observations compartment, and verify the visible Observations are sorted by date (most recent first) by reading at least the top 3 dates.",
  successHints: [
    "Patient rows render as data-testid='patient-row' (list layout) or 'resource-row' (table layout); try both. Observation rows follow the same pattern ('observation-row'/'resource-row').",
    "The Observation compartment chip on the detail page (inside data-testid='compartment-links') opens a filtered list.",
    "If a sort control (data-testid='sort-picker') is visible, the default order is what users see; report whatever sort the app actually applies.",
    "Report 'bug-suspected' only if the dates visibly contradict the sort indicator the app shows. If no sort indicator is shown and order looks arbitrary, report 'blocked' with the dates as evidence.",
  ],
  postChecks: {
    noConsoleErrors: true,
    mustVisitRoute: "#/Observation",
  },
  mutatesData: false,
  maxSteps: 20,
};
