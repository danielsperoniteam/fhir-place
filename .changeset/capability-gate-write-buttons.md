---
"@fhir-place/react-fhir": minor
---

Add `useResourceCapabilities(resourceType)` hook returning
`{ canCreate, canUpdate, canDelete, canSearch, isLoading, isError }` derived
from `CapabilityStatement.rest.resource[].interaction[]`. Defaults to deny
(every flag `false`) while metadata is loading or when the requested type
isn't advertised, so UIs that gate write actions on these flags
default-hide rather than render a button that would 405. Accepts a
`capabilityStatement` override for tests / offline mode.

Closes #159.
