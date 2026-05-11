import type { TaskDef } from "../agent/types.js";

export const codedValueHumanReadable: TaskDef = {
  id: "coded-value-human-readable",
  goal: "Find an Observation with a coded value (e.g. a vital sign or lab result) and verify the rendered detail shows a human-readable display string for the code, not just a bare numeric code.",
  successHints: [
    "Reach the Observation list either via #/Observation or by clicking the Observation compartment chip on a patient detail page.",
    "Open one Observation by clicking its row. The detail view is data-testid='resource-view'.",
    "A coded value is one where the source data is a Coding with a `code` and `display`. The UI should render the display ('Body Mass Index'), not just the code ('39156-5').",
    "Report 'bug-suspected' only if you find a coded field that renders as a bare code with no display text. If the Observations you sample don't have coded values, report 'blocked' — don't fabricate evidence.",
  ],
  postChecks: {
    noConsoleErrors: true,
    mustVisitRoute: "#/Observation/",
  },
  mutatesData: false,
  maxSteps: 22,
};
