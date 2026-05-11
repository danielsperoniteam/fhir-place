import type { TaskDef } from "../agent/types.js";

export const fieldPickerToggleColumns: TaskDef = {
  id: "field-picker-toggle-columns",
  goal: "On the Patient list, open the column picker, toggle one currently-visible column off and one currently-hidden column on, and verify the table headers update accordingly.",
  successHints: [
    "The column picker has data-testid='column-picker'. Open it; it lists the available fields with checkboxes.",
    "After toggling, the table at data-testid='resource-table' should show updated column headers.",
    "Read the table headers before and after the toggle and compare. Report exactly which columns changed.",
    "Report 'bug-suspected' if a toggle has no effect on the table headers, or if the picker fails to open.",
  ],
  postChecks: {
    noConsoleErrors: true,
    mustVisitRoute: "#/Patient",
  },
  mutatesData: false,
  maxSteps: 22,
};
