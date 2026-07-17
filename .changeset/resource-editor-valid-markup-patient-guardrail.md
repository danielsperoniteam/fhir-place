---
"@fhir-place/react-fhir": patch
---

`ResourceEditor` fixes:

- Editor field labels and value cells now render as `<div>`s inside the form grid instead of `<dt>`/`<dd>`, which was invalid HTML (the grid container is a `<div>` and fields nest inside other fields' value cells) and triggered React `validateDOMNesting` warnings on every create/edit form.
- New clinical-safety guardrail: creating a Patient (no `id` yet) with no real name component and no identifier value is blocked with a form-level error banner (`data-testid="resource-editor-form-error"`). Whitespace-only strings and identifiers with only a `system` don't count. Editing existing patients — including legitimately anonymized ones — is unaffected.
- Guardrails can now surface form-level errors (path `[]`), rendered in a banner above the footer and cleared on the next edit.
