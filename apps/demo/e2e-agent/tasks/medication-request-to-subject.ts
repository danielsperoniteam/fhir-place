import type { TaskDef } from "../agent/types.js";

export const medicationRequestToSubject: TaskDef = {
  id: "medication-request-to-subject",
  goal: "Navigate to the MedicationRequest list, open one record's detail view, locate the patient subject reference, follow it, and confirm the destination is a Patient detail page that loads without errors.",
  successHints: [
    "MedicationRequest list URL: #/MedicationRequest. Rows are data-testid='medicationrequest-row' (list layout) or 'resource-row' (table layout); try both.",
    "On the detail page (data-testid='resource-view'), the subject reference appears as a clickable link rendered by the ReferencePicker.",
    "Following the reference should land on a Patient detail page with the same compartment-links nav as patient detail.",
    "Report 'bug-suspected' if the reference link is missing, doesn't navigate, or lands on an error wall (data-testid='resource-error' or 'resource-not-found').",
  ],
  postChecks: {
    noConsoleErrors: true,
    mustVisitRoute: "#/Patient/",
  },
  mutatesData: false,
  maxSteps: 22,
};
