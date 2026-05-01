# 0004 Library Positioning and Wedge

## Status
Accepted

## Context
A May 2026 strategy memo recommended renaming `react-fhir`, picking a wedge, and
earning credibility through HL7 community work. The memo was written without
access to the published package and assumed a pre-alpha sketch.

In reality `@fhir-place/react-fhir` is published on npm at 0.1.0, has 94 unit
tests, Playwright e2e, a nightly live-HAPI integration suite, a GitHub Pages
demo, and changesets going back to `initial-release.md`. The npm name is
scoped, so the bare-name `react-fhir` collision in the ecosystem is a marketing
concern, not a registry one.

## Decision
The library wedge is **backend-agnostic, spec-driven, headless React primitives
for any FHIR REST API**, with deliberate room for LLM/agent-native ergonomics.

Operationally:

- Stay backend-agnostic. No vendor SDK in the critical path. Public HAPI, MSW,
  Medplum, Aidbox, and HealthLake stay first-class targets.
- Stay spec-driven. UI derives from `StructureDefinition`, `SearchParameter`,
  and `CapabilityStatement`. New components must follow this pattern.
- Stay headless. No Mantine / Bootstrap / Material lock-in. Tailwind + unstyled
  primitives + escape hatches via `renderers` / `inputs`.
- Reserve room for LLM/MCP work as a first-class consumer of the same
  spec-driven type system (Zod-from-`StructureDefinition`, optional MCP
  package, typed tool surfaces).
- Do not rename. The npm name is scoped and already published; renaming
  destroys distribution. Address the bare-name SEO collision in `README.md`
  copy, not via a package rename.
- Library positioning is independent of `apps/workbench` Phase A constraints.
  Workbench docs and tasks live under `apps/workbench/` per `AGENTS.md`;
  library strategy lives in `docs/` and `README.md` per ADR 0001.

## Consequences
- Net new tracks (typed search builder, profile-aware codegen,
  Zod-from-`StructureDefinition`, Inferno (g)(10) CI badge, SMART App Launch
  adapter, optional `@fhir-place/mcp` package, interop demo matrix) are filed
  as GitHub Issues and surface in the `README.md` "Roadmap" table, not as a
  parallel doc tree.
- Workbench-only constraints (no MCP server, no SMART, no write-back during
  Phase A) do not apply to the library. An MCP package is permitted under
  `packages/`.
- The `README.md` "Comparison" table is the authoritative competitive matrix.
  No separate `market-gap-comparison.md` is maintained.
