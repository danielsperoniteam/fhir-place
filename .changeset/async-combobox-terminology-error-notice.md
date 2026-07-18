---
"@fhir-place/react-fhir": patch
---

`AsyncCodeCombobox` now surfaces an inline "terminology server unreachable"
notice when a `ValueSet/$expand` lookup fails (CORS-blocked, network error,
or non-2xx). Previously a failed expansion left the coded-field dropdown
silently empty, so users could not tell the difference between "no matching
codes" and "terminology lookup is down".
