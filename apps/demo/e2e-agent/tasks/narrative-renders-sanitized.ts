import type { TaskDef } from "../agent/types.js";

export const narrativeRendersSanitized: TaskDef = {
  id: "narrative-renders-sanitized",
  goal: "Find a resource that has a Narrative (the FHIR `text.div` field, often present on Patient, Encounter, or DocumentReference) and verify the narrative renders as readable text — not as raw HTML markup, not as escaped tags, and with no script execution.",
  successHints: [
    "Many Patient detail pages render a Narrative section near the top of the resource view (data-testid='resource-view').",
    "If you don't find one on the first patient, try a different patient or try Encounter / DocumentReference list views.",
    "Acceptable output: prose-like rendered text. Unacceptable: literal '<div>' / '<p>' / '<table>' visible to the user, or HTML-escaped angle brackets like '&lt;div&gt;'.",
    "Report 'bug-suspected' only if you find a narrative field that visibly leaks raw markup. Report 'blocked' if no resource you can reach has a narrative.",
  ],
  postChecks: {
    noConsoleErrors: true,
  },
  mutatesData: false,
  maxSteps: 22,
};
