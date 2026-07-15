---
"@fhir-place/react-fhir": minor
---

Quantity rendering and editing (#368), plus reverse-references paging:

- New `ucumDisplay()` helper decodes common UCUM codes for display (`mm[Hg]` → mmHg, `10*9/L` → 10⁹/L, `ug/dL` → µg/dL, `Cel` → °C) while callers keep the canonical code.
- `formatQuantity` and the Quantity renderer fall back to the decoded UCUM code when no display `unit` is present, and the renderer badges the canonical code (`UCUM: mm[Hg]`) when `unit` and `code` differ.
- `QuantityInput` gains `comparator` (hidden for SimpleQuantity, which forbids it) and `system` fields; entering a UCUM code defaults `system` to `http://unitsofmeasure.org`.
- `ReverseReferences` "Show all" now follows `Bundle.link[next]` until every row is loaded instead of assuming one `_count=total` request returns everything — servers are allowed to cap page size.
- `useInfiniteSearch` accepts an `options.enabled` flag.
