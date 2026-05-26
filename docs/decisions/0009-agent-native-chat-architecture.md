# 0009 Agent-Native Chat Architecture

## Status
Proposed

## Context
ADR 0004 set the wedge as a backend-agnostic, spec-driven, agent-native FHIR
access layer and reserved room for "LLM/MCP work as a first-class consumer …
an MCP package is permitted under `packages/`." Today the only agent-shaped
feature is a single-shot natural-language → FHIR-search translator
(`apps/demo/src/ask/anthropicQuery.ts`) that runs in the browser with a
user-supplied Anthropic key. It cannot reason across multiple steps, compact
Bundles, or ground terminology, and it invites code hallucination.

We want both (a) a multi-turn chat inside the demo GUI and (b) an MCP server so
customers can use their own agents — without maintaining two tool
implementations, and without committing to hosting or PHI handling yet. The
full design and rationale live in
`docs/proposals/agent-native-fhir-chat-and-mcp.md`.

## Decision
Adopt a **one core, two front doors** architecture:

- Introduce **`@fhir-place/agent-core`** (`packages/agent-core`): a
  framework-agnostic engine owning a transport-agnostic tool/skill registry, a
  Bundle compactor, terminology grounding, and CapabilityStatement-aware tool
  surfacing. It depends only on `@fhir-place/react-fhir`'s framework-free
  `./client` and `./structure` subpaths. It **must not** depend on any LLM SDK,
  React, or transport — that invariant is what lets both front doors share tool
  definitions.
- **Front door A — in-browser chat** in `apps/demo`: a bounded multi-turn
  tool-use loop that owns the Anthropic SDK and runs client-side (BYO key + BYO
  FHIR server), evolving the existing single-shot "Ask".
- **Front door B — `@fhir-place/mcp`** (`packages/mcp`): an MCP server that wraps
  the identical registry. **stdio (customer-run-local) is the default and ships
  first**; Streamable HTTP is built only if central hosting is required; HTTP+SSE
  is deprecated and will not be built.

Operating constraints:

- **Tools are read-only by default.** Writes require an explicit `--allow-writes`
  flag (MCP) or a human-confirmation callback (browser).
- **Synthetic/sandbox data only for now**, but bake in the seams that make real
  PHI a bounded delta. All of these are new code to add, except the `sameOrigin`
  guard which already exists and is extended: a PHI-masking hook at the
  tool-output boundary (no-op now), an audit-log interface on every tool call
  (console sink now), and error redaction in `FetchFhirClient` (TODO — today the
  client surfaces the request URL and `OperationOutcome.diagnostics` in thrown
  errors; that path must be redacted before PHI flows through it).
- **No rename.** Consistent with ADR 0004, the `FHIRplace`/`react-fhir` name
  collision is a README/SEO matter, not a package rename.

## Consequences
- Two new packages under `packages/`: `agent-core` and `mcp`. The published
  `@fhir-place/react-fhir` surface is unchanged.
- The browser chat and MCP server cannot drift apart, because both consume the
  same `ToolRegistry`.
- The model SDK lives only in the consumers, so the eventual move to a
  backend proxy for PHI does not touch `agent-core`.
- The synthetic → PHI transition is enumerable (see proposal §8.3): move the
  model call to a backend, switch on masking/audit/redaction, short-lived FHIR
  tokens, network policy, and (if hosted) per-tenant isolation + BAA.
- Phases land as GitHub issues with the roadmap in `README.md` per ADR 0001 /
  0004; each user-visible phase ships its e2e update + PR screenshots per
  CLAUDE.md.
- Hosting, multi-tenancy, and BAA-covered managed offerings are explicitly
  deferred and would need their own ADR.
