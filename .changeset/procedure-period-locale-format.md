---
"@fhir-place/react-fhir": patch
---

Fix the `Period` renderer and `formatPeriod` so each side of a date range
uses the same human-readable locale format as a single `dateTime`. The
Procedure list "Performed" column previously mixed locale-formatted
`performedDateTime` values with raw ISO-8601 `performedPeriod` strings on
the same paint.

A new `formatFhirDateTime` helper centralises the locale-formatting (with a
raw-string fallback for partial-precision and unparseable values) and is
shared by the `dateTime`/`instant` renderer, the `Period` renderer, and
`formatPeriod`. The raw ISO value is still carried on each `<time>`
element's `datetime` attribute.
