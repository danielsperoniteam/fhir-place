---
"@fhir-place/react-fhir": patch
---

Add `validate` prop to `ResourceEditor` for client-side save gating

`ResourceEditorProps` now accepts an optional `validate(draft: Resource) => boolean`. When it returns `false`, the Save button is disabled. The implementation runs inside the editor so callers do not need to track draft state in the parent component. `saveDisabled` is still supported for static gates.
