---
"@fhir-place/react-fhir": minor
---

Humanise FHIR `date`, `dateTime`, and `Period` rendering across all consumers.
The Date / DateTime / Period type renderers now emit `Aug 30, 2018, 9:24 PM`
and `Aug 30, 2018, 9:24 PM → 9:41 PM` instead of raw ISO-8601 strings; the
`<time dateTime="…">` attribute still carries the unaltered FHIR value for
screen readers and scrapers. Adds a shared `formatDateTime` helper alongside
the existing `formatPeriod` (now humanised), both UTC-pinned for
test-determinism. Fixes #556 (Procedure list and detail rendered performed
dates as raw ISO-8601).
