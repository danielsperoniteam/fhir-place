# 0010 Agent-Native Chat Architecture

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

- **Tools are read-only by default.** Every `AgentTool` must declare
  `access: "read" | "write"` (required, not optional — an unclassified tool
  would default to read and silently bypass the read-only default).
  `ToolRegistry` refuses to register a tool without it, and refuses to execute
  a `write` tool when `ctx.readOnly`.
- **Confirmation has two layers, chosen by tool capability, not by front
  door.** Every Layer-2 primitive and both Layer-3 raw tools implement a
  side-effect-free `AgentTool.plan(input, ctx)` that returns the
  `RequestPlan[]` they would fire. `ToolRegistry.execute` calls `plan()`
  before `execute()`, invokes `confirmRead`/`confirmWrite` on the built
  plan(s), and only proceeds on approval. If the hook returns an
  `editedInput`, the registry revalidates it against `inputSchema` and calls
  `plan()` again from scratch — the plan is regenerated, not mutated —
  bounded to 3 iterations. Layer-1 skills that omit `plan()` still fire
  authenticated requests inside `execute()`; those are guarded by an
  accept/reject-only backstop at the `FetchFhirClient` boundary — but that
  backstop must not re-prompt for requests Layer A already approved. The
  registry attaches a single-use approval token bound to
  `(method, url, body-hash)` to each approved plan; `execute()` threads it
  through to the client and the middleware treats it as consent-satisfied,
  skipping the prompt for exactly that request. This addresses the round-7
  confusion that put `confirmWrite` in the registry with no way to derive a
  plan from an opaque `execute()`.
- **`ToolRegistry.execute` emits audit events centrally with redacted
  payloads** — `{event, tool, inputKeys, resultShape, errorClass?, ts}`,
  never raw `input`/`outcome`/`error`. HIPAA §164.312(b) requires the
  access logged, not the payload; emitting raw values would make the audit
  log itself an egress path bypassing the envelope-level redaction seam.
- **`ToolRegistry.execute` validates every tool input against its
  `inputSchema` (JSONSchema7) before dispatch** and refuses on failure.
  Today's single-shot code only spot-checks that `resourceType` is a string and
  `params` is a non-null object — that is a shape sanity check, not schema
  validation, and it is not sufficient once the model drives multi-turn tool
  calls.
- **Base-path enforcement is agent-mode middleware over `FetchFhirClient`,
  not a change to the shared client's default contract.** `readReference` is
  today documented and tested to resolve absolute references outside the
  configured base, and existing non-agent UI navigation relies on that.
  Regressing that behavior in the shared client would break non-agent
  callers. Instead the strict check ships as an opt-in wrapper —
  `withStrictBase(client, baseUrl)` — that the browser chat and MCP server
  install; standard UI paths keep today's behavior (plus the render-time
  `sameOrigin` guard). For **agent-driven requests, the outside-base case
  is a hard refuse — credential-stripping is not sufficient**, because
  even an anonymous fetch is an SSRF / exfiltration primitive (the
  response lands in the next model turn as a `tool_result`, exposing the
  user's machine or hosted network). Credential-stripping is only
  acceptable for user-initiated navigation. `sameBase` requires **both
  normalized origin equality** — `(scheme, host, port)` exact match — **and**
  the segment-bounded path prefix (`targetPath === basePath` or
  `targetPath.startsWith(basePath + "/")` on normalized paths). A path-only
  check would let `https://attacker.example/fhir/Patient/1` pass under a
  `https://ehr.example/fhir` base; a naive `startsWith` would let
  `/fhir-evil/collect` pass under a `/fhir` base. Both conditions are
  required.
- **PHI-masking seam is envelope-level, not `Resource → Resource`.** Applied
  centrally by `ToolRegistry.execute` over every tool output — Bundles,
  compacted results, terminology payloads, skill summaries — so nothing that
  ships to the model bypasses the seam.
- **Synthetic-only enforcement is a hard gate, not a declared posture,
  with three classes.** Every FHIR server config carries a
  `dataClass: "synthetic-controlled" | "sandbox-shared" | "phi"` flag.
  `synthetic-controlled` is reserved for fixture-backed transports the app
  owns end-to-end (MSW handlers in-process) — nothing over a network. Any
  networked endpoint, including `localhost:8080/fhir` (we identify by URL,
  we cannot prove ownership) and public sandboxes (HAPI, SMART Health IT,
  Firely, test.fhir.org), lands in `sandbox-shared`: **every Anthropic path
  — both single-shot `/ask` and the multi-turn loop — requires a per-session
  acknowledgement**, because we cannot guarantee an uncontrolled corpus and
  the question itself (e.g. `give me John Doe's A1c`) egresses to Anthropic.
  Env-var overrides of the built-in list also land in `sandbox-shared` at
  minimum. **User-configured network endpoints cannot be flipped to
  `synthetic-controlled`** — that class is reserved for in-process
  transports the app owns; the strongest downgrade available for a custom
  server is `sandbox-shared`. `phi`: the entire Anthropic path — agent loop
  **and** single-shot `/ask` — is refused (the question carries PHI even
  when no resources are fetched). User-added servers default to `phi`. MCP
  requires `--sandbox-acknowledged` on `sandbox-shared` and a future
  `--phi-acknowledged` on `phi` (out of scope; will require BAA hosting).
  Without this gate, the multi-turn loop egresses compacted resources
  to the model on every iteration and "synthetic-only" is unenforceable.
- **MCP writes are gated by explicit flags, not by undefined hooks.**
  With no flags, the MCP server auto-approves `confirmRead` and refuses
  to register any `access: "write"` tool. `--allow-writes` installs an
  auto-approving `confirmWrite` policy of the same shape. An undefined
  hook cannot silently "become" an approval — an explicit policy object
  is the sole mechanism.
- **The browser front door preserves `/ask`'s plan → user-editable preview →
  run split.** `AgentContext` exposes an optional `confirmRead` hook that
  `FetchFhirClient` (or a thin middleware wrapping it) calls with the built
  request plan before **any** authenticated read leaves the browser — not only
  Layer-2 primitives but also Layer-1 skills (`$everything`) and the Layer-3
  `fhir_raw_request` escape hatch. Enforcing at the single client boundary,
  rather than per-tool, prevents the model from picking a skill or raw tool to
  bypass the preview. The MCP path leaves `confirmRead` undefined (auto-run).
- **`resolve_reference` dispatches version-specific references without
  rebasing, and refuses cross-base fetches in agent mode.** Today
  `FetchFhirClient.readReference` splits on `/`, calls `read()`, and silently
  returns the current version. The fix has three arms: relative
  (`Patient/123/_history/2`) routes to `client.vread(type, id, versionId)`;
  absolute same-base preserves the parsed URL via
  `client.request({path: absoluteURL})`; absolute cross-base
  (`https://other.example/fhir/…`) is **refused**, because it collides with
  `withStrictBase` (§ base-path enforcement) — an agent-driven cross-base
  fetch is the exact SSRF/exfiltration primitive that boundary blocks. The
  security rule wins over any historical-fidelity motivation; cross-base
  historical resolution, if ever needed, requires an explicit user allow or
  a future `--allow-cross-base` policy.
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
