---
"@fhir-place/react-fhir": minor
---

Add `<CodedValue />` — a chip + hover-popover primitive for `Coding` and `CodeableConcept` values, with a registry-driven priority/classification model. Replaces the old `title`-tooltip rendering inside `defaultTypeRenderers`.

What ships:

- `<CodedValue value={Coding | CodeableConcept} tone? telemetry? />` exported from `@fhir-place/react-fhir`. Resting state is a bordered chip showing `text` ?? primary `display` ?? primary `code` ?? `'—'`, with a sunken pill for the primary code and an optional `+N` indicator when more codings exist. Hovering (or focusing) opens a 360px popover with TEXT, CODINGS · N, and an expander for unknown / OID / local codings.
- Optional `tone="success" | "warn" | "danger"` opt-in (caller-supplied; never derived from the value) — adds a small dot before the label and tints the chip.
- Definition lookup runs only for the primary coding (via the existing `useCodeLookup`) so hover does not spam terminology servers.
- New `codedValue/registry` module exporting `FHIR_CODE_SYSTEMS`, `pickPrimary`, `partition`, `labelForSystem`, `normalizeSystem`, `isKnown`. URI normalisation strips the `|version` suffix.
- `RendererContext` gained an optional `tone` field, propagated to `Coding` / `CodeableConcept` renderers in `defaultTypeRenderers`.

Behaviour changes:

- `Coding` and `CodeableConcept` cells in `<ResourceView>` / `<ResourceTable>` now render through `<CodedValue />`. The chip no longer uses a `<code>` element with a `title` attribute and the old `+N more` toggle has been replaced by the popover's hidden-codings expander. Apps that scoped CSS or tests to those exact selectors will need to migrate to the new `data-testid` selectors (`coded-value`, `coded-value-chip`, `coded-value-code`, `coded-value-popover`, `coded-value-system-pill`, `coded-value-other-toggle`).

Closes #246.
