import type { TaskDef } from "../agent/types.js";

export const urlSyncSurvivesReload: TaskDef = {
  id: "url-sync-survives-reload",
  goal: "On the Patient list, apply a search filter (any family name visible on the page is fine), confirm the filtered rows render, then navigate to the same URL again and confirm the same filter is still applied and the same rows render.",
  successHints: [
    "The search form is data-testid='resource-search'. After submitting, the URL hash should encode the search state.",
    "Use the navigate tool to revisit the current URL — that simulates a reload and is enough to verify URL-driven state.",
    "Compare the visible patient names before and after the second navigation. They should match.",
    "Report 'bug-suspected' if the second navigation drops the filter (full unfiltered list returns) or shows a different result set.",
  ],
  postChecks: {
    noConsoleErrors: true,
    mustVisitRoute: "#/Patient",
  },
  mutatesData: false,
  maxSteps: 22,
};
