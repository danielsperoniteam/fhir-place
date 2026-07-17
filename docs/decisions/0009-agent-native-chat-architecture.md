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
- **`ToolRegistry.execute` validates every tool input against its
  `inputSchema` (JSONSchema7) before dispatch** and refuses on failure.
  Today's single-shot code only spot-checks that `resourceType` is a string and
  `params` is a non-null object — that is a shape sanity check, not schema
  validation, and it is not sufficient once the model drives multi-turn tool
  calls.
- **Base-path credential enforcement moves inside the FHIR client.** The
  existing `sameOrigin` guard runs only at UI-render time and — more
  importantly — is not strong enough as a credential guard: for a base such as
  `https://host.example/fhir`, a model-supplied
  `https://host.example/other-service` is same-origin but a different
  application, and the FHIR bearer must not flow to it. The primitive becomes
  `sameBase(target, baseUrl)` (same origin **and** target path prefixed by the
  base path), enforced at the request boundary in `FetchFhirClient` — hard
  refuse or credential strip — and applied by both front doors to reference
  resolution and the raw escape hatch alike.
- **PHI-masking seam is envelope-level, not `Resource → Resource`.** Applied
  centrally by `ToolRegistry.execute` over every tool output — Bundles,
  compacted results, terminology payloads, skill summaries — so nothing that
  ships to the model bypasses the seam.
- **The browser front door preserves `/ask`'s plan → user-editable preview →
  run split.** `AgentContext` exposes an optional `confirmRead` hook that Layer-2
  read primitives call with their built request plan before executing; the
  browser wires it to the existing request-preview UI, and the MCP path leaves
  it undefined (auto-run). Without this, a multi-turn loop would fetch before
  the user could review or edit.
- **`resolve_reference` routes version-specific references through `vread`.**
  Today `FetchFhirClient.readReference` silently drops the `/_history/<v>`
  suffix and returns the current version. Detecting the suffix and calling
  `client.vread` is a small, required fix so agent answers do not ground in
  the wrong historical resource.
- **`@fhir-place/react-fhir` marks its React / React-DOM / TanStack Query
  peers as optional** (`peerDependenciesMeta.*.optional`) before the MCP package
  ships. Subpath imports alone do not exempt Node-only consumers from
  package-wide peers; escalation path if optional peers prove insufficient is
  to split the framework-free `client` + `structure` code into a lower-level
  package — which would be its own ADR.
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
