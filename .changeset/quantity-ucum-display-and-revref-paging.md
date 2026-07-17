---
"@fhir-place/react-fhir": minor
---

Quantity rendering and editing (#368), plus reverse-references paging:

- New `ucumDisplay()` helper decodes common UCUM codes for display (`mm[Hg]` → mmHg, `10*9/L` → 10⁹/L, `ug/dL` → µg/dL, `Cel` → °C) while callers keep the canonical code.
- `formatQuantity` and the Quantity renderer fall back to the decoded UCUM code when no display `unit` is present, and the renderer badges the canonical code (`UCUM: mm[Hg]`) when `unit` and `code` differ.
- `QuantityInput` gains `comparator` (hidden for SimpleQuantity, which forbids it) and `system` fields; entering a UCUM code defaults `system` to `http://unitsofmeasure.org`.
- UCUM decoding and the canonical-code badge are gated on `Quantity.system` (UCUM or absent); site-specific systems keep their raw codes.
- `ReverseReferences` "Show all" now follows `Bundle.link[next]` until every row is loaded instead of assuming one `_count=total` request returns everything — servers are allowed to cap page size. A new `maxAutoPages` prop (default 100) caps each click; when the cap pauses a huge drain the control reappears to continue.
- `useInfiniteSearch` accepts an `options.enabled` flag.

- `ReverseReferences` also handles servers that report a `total` beyond the returned rows without emitting `link[rel=next]`: the Show-all control re-requests once with `_count=total`.

Multi-coding CodeableConcept rendering (#367):

- The `CodedValue` popover decodes `translation` extensions on a coding's display (both the spec-correct `_display` carrier and codings that attach them directly), rendering each language + content line.
- Registry adds ICD-10-PCS and HCPCS system labels.

Theme tokens (#245 shape):

- Every component now styles through `var(--token, lightFallback)` instead of hard-coded slate/white/blue utilities — `--text`, `--text-muted`, `--text-subtle`, `--surface`, `--sunken`, `--chip`, `--border`, `--border-strong`, `--accent`, `--accent-soft`, `--accent-text`, `--danger`, `--danger-soft`, `--warn`, `--warn-soft`. Apps that define these tokens (e.g. with a `.dark` scope) get dark mode across the editor, inputs, search, and renderers for free; apps that don't keep the previous light rendering via the fallbacks.
