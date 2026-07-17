---
"@fhir-place/react-fhir": minor
---

Adaptive pagination — new `usePagedSearch` hook and `bundlePageLinks`
helper that surface whichever `Bundle.link` rels the server actually
emitted (`first`, `previous`/`prev`, `next`, `last`) rather than assuming
forward-only. Cursor-paginated servers (Epic, parts of HealthLake) that
only emit `next` naturally degrade to a Next-only UI; offset-paginated
servers (HAPI, Smile CDR) get the full First/Prev/Next/Last set.

- `bundlePageLinks(bundle)` → `{ first?, previous?, next?, last? }`,
  normalising the two valid spellings of "previous" per RFC 5988.
- `usePagedSearch(type, params)` returns a single Bundle plus a `goTo`
  navigator. URLs are passed through unchanged so opaque continuation
  tokens survive round-trips.
- The demo's resource browser now uses `usePagedSearch` and the
  "jump-to-page-N" affordance is gone — only correct on offset servers,
  misleading on cursor servers.

Existing `useInfiniteSearch` / `nextPageUrl` are unchanged.

Closes #304.
