---
"@fhir-place/react-fhir": minor
---

New `parseSearchRequest(input)` in `client/` — the inverse of `formatSearchRequest`. Parses a FHIR search URL (absolute, relative path, or bare `Type?query`) into `{ resourceType, params, baseUrl? }`. Repeated keys collapse to `string[]` (AND semantics) so the output round-trips through `buildSearchParams`; comma-joined OR values, modifiers (`name:contains`), and chained params (`subject:Patient.name`) pass through unchanged. Throws on input without a recognisable resource type segment.
