---
"@fhir-place/react-fhir": minor
---

New `<ReverseReferences>` component and `defaultRevIncludes(resourceType)` registry. Shows incoming references ("Referenced by") for a resource, grouped by `[resourceType, searchParam]` pairs: count badges load upfront via `_summary=count`, section contents lazy-fetch on expand (TanStack Query, deduped), each section shows its inline query, a "Show all N" overflow, a log-scaled fan-out bar, and clickable result chips via the `hrefFor` prop. Unlisted resource types render an empty state. Patient defaults follow the Direction A ten-plus (#253).
