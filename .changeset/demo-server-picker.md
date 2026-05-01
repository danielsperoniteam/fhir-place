---
---

Demo: add a FHIR server picker and `/settings` page so visitors can point the
live demo at any FHIR R4 server. The picker lists built-in public servers
(HAPI Public Test Server, SMART Health IT R4) plus user-added entries; the
settings page lets users add/edit/delete servers, layer a static bearer token
or custom request headers (e.g. `Epic-Client-ID`), and run a "Test connection"
that hits `/metadata` and surfaces software name + `fhirVersion`. Configuration
is stored in `localStorage`; selecting a server triggers a page reload so the
singleton `FetchFhirClient` rebuilds with the new base URL and headers. HAPI
remains the default; the picker/settings are hidden in mock mode and when
`VITE_FHIR_BASE_URL` overrides the base URL. Demonstrates that
`@fhir-place/react-fhir` is server-agnostic — it works against any FHIR R4
REST API.
