# Proposal: Agent-Native FHIR Chat + MCP

- **Status:** Draft for review
- **Date:** 2026-05-26
- **Decision record:** `docs/decisions/0009-agent-native-chat-architecture.md`
- **Builds on:** ADR 0003 (Agent Safety Rules), ADR 0004 (Positioning & Wedge)
- **Scope chosen by sponsor:** full agent-native pivot · in-app chat **and** MCP
  server in the same effort · synthetic/sandbox data only for now (PHI-ready by
  design) · deliverables land in-repo as this proposal + ADR 0009.

## 1. TL;DR

We are turning the single-shot "Ask" box into a real agent-native FHIR access
layer. The strategic direction is already set by ADR 0004 ("reserve room for
LLM/MCP work as a first-class consumer … an MCP package is permitted under
`packages/`"). This proposal settles **how the chat is architected**.

The core idea is **one engine, two front doors**:

- **`@fhir-place/agent-core`** — a framework-agnostic package that owns the hard
  FHIR-specific work (the tool/skill registry, a Bundle compactor, terminology
  grounding, and CapabilityStatement-aware tool surfacing). It depends on the
  existing `@fhir-place/react-fhir` client and **does not** depend on any LLM
  SDK, React, or transport.
- **Front door A — in-browser chat** in `apps/demo`: a multi-turn tool-use loop
  that owns the Anthropic SDK and runs entirely client-side, BYO-key + BYO-FHIR
  server, exactly like today's "Ask". No backend, no new infra.
- **Front door B — `@fhir-place/mcp`**: an MCP server (stdio first) that wraps
  the *same* registry so a customer's own agent (Claude Desktop, Cursor) can use
  the identical tools.

Because both front doors consume the same registry, the tool definitions are
authored once. We build for **synthetic/sandbox data now** but bake in the
read-only-by-default posture, a PHI-masking seam, an audit seam, and error
redaction so the eventual jump to real PHI is a **bounded, enumerable delta**
rather than a rewrite.

## 2. The problem, and who it is for

The job-to-be-done: *"I'm connected to a FHIR server. Let me get answers to
clinical questions without hand-writing search parameters or reading raw
Bundles."* Two distinct users have that job:

| Persona | Where they work | What they need |
|---|---|---|
| **In-product evaluator** (clinician, analyst, integration dev kicking the tires) | Our demo GUI | Type a question, get a grounded answer with the resources it came from. Never leave the page. |
| **Agent-native developer** | Their own agent (Claude Desktop, Cursor, an internal agent) | Point their existing agent at a FHIR server and have good FHIR tools show up. Never adopt our UI. |

Today's "Ask" (`apps/demo/src/ask/anthropicQuery.ts`) serves neither well: it is
**single-shot** — one question → one `GET /[Type]?params`. It cannot do the
multi-step reasoning real questions require ("most recent A1c for Jane Doe" =
resolve patient → ground the LOINC code → search sorted/limited → summarize), it
dumps raw Bundles that blow the context window, and it is told to emit codes
"when you confidently know them," which invites LOINC/SNOMED hallucination.

The research landscape (May 2026) confirms this is exactly where the field is
weak: every "generic" FHIR MCP server wraps `GET` and dumps JSON; **none** ships
a Bundle compactor, terminology grounding, or CapabilityStatement-aware tool
surfacing; **none** publishes a FHIR-AgentBench / MedAgentBench score. That is
our wedge.

## 3. The five questions, answered directly

These are the questions that motivated the proposal.

1. **Do we need an MCP server?**
   Not for the in-app chat. MCP is a protocol for letting an *external* agent
   reach our tools. The browser chat needs no MCP at all. We are building MCP
   anyway, in parallel, because it is the only way to serve the "bring your own
   agent" persona — and because the same registry powers both, the marginal cost
   is the transport shell, not a second tool implementation.

2. **How is it architected?**
   Separate the FHIR-specific engine (`agent-core`) from the transport. Build the
   engine once; expose it through the browser chat and the MCP server. See §4–§7.

3. **Is this possible via the GUI?**
   Yes, and it is the lowest-friction path. The app already calls Anthropic from
   the browser with a user-supplied key (`dangerouslyAllowBrowser: true`) and
   already manages multiple FHIR servers, per-server auth, and a terminology base
   URL in `config.ts`. We extend the existing single-shot call into a multi-turn
   loop. Zero new infrastructure.

4. **Can the customer bring their own agent or tokens via the UI?**
   - **Tokens: yes, already.** BYO Anthropic key + BYO FHIR server is the current
     model and stays the model.
   - **Their own agent: not through the UI** — that is the MCP path. A customer
     who wants to use *their* agent runs `@fhir-place/mcp` locally and points
     their agent at it.

5. **Does it need to be a hosted MCP server?**
   No. The default is **customer-run-local** (`npx @fhir-place/mcp` over stdio):
   secrets stay on the customer's machine, we are never in the data path, and
   there is no BAA or hosting burden. A **hosted** MCP server is only needed for a
   future managed, multi-tenant, BAA-covered commercial offering — it is an
   upsell, not a requirement, and is explicitly out of scope for this phase.

## 4. Architecture: one core, two front doors

```
                 @fhir-place/react-fhir
            (FetchFhirClient, StructureDefinition
             machinery, SearchBuilder)  ── unchanged
                          ▲
                          │ workspace:*  (client + structure subpaths only)
                          │
                 @fhir-place/agent-core
        ToolRegistry · 3-layer tools · BundleCompactor ·
        terminology binding · CapabilitySnapshot gating
        NO LLM SDK · NO React · NO transport
                  ▲                        ▲
                  │                        │
        apps/demo (browser)        @fhir-place/mcp (Node)
        owns Anthropic SDK,        stdio server (HTTP later),
        dangerouslyAllowBrowser,   read-only default,
        multi-turn chat loop       customer-run-local
        Front door A               Front door B
```

**Why a new `packages/agent-core` rather than folding into `react-fhir`:**
`react-fhir`'s public entry re-exports React hooks/components and carries
`react` + `@tanstack/react-query` peer deps; the MCP server runs in Node with no
React. A clean sibling package keeps the published `@fhir-place/react-fhir`
surface stable, keeps React out of the MCP server, and matches ADR 0004's intent
("first-class consumer of the same spec-driven type system"). `agent-core`
imports only `react-fhir`'s framework-free `./client` and `./structure`
subpaths. **`agent-core` must never depend on `@anthropic-ai/sdk`** — that is the
invariant that lets both front doors share tool definitions while letting each
choose its own model binding.

## 5. The agent core (`@fhir-place/agent-core`)

### 5.1 Transport-agnostic tool registry

A tool receives an `AgentContext`, not a transport. Sketch:

```ts
interface AgentContext {
  client: FhirClient;          // react-fhir/src/client/types.ts
  tx?: FhirClient;             // terminology server (TERMINOLOGY_BASE_URL)
  capabilities?: CapabilitySnapshot;
  compactor: BundleCompactor;
  readOnly: boolean;           // default true
  audit: (e: AuditEvent) => void;   // seam; console sink for now
  redact: (r: Resource) => Resource; // seam; no-op on synthetic data
  signal?: AbortSignal;
}

interface AgentTool<I = unknown, O = unknown> {
  name: string;
  layer: "skill" | "primitive" | "raw";
  description: string;
  inputSchema: JSONSchema7;    // same shape already used by anthropicQuery.ts
  mutating?: boolean;          // refused when ctx.readOnly
  execute(input: I, ctx: AgentContext): Promise<O>;
}

class ToolRegistry {
  register(t: AgentTool): void;
  list(filter?: { layers?: string[]; capability?: CapabilitySnapshot }): AgentTool[];
  toAnthropicTools(): Anthropic.Messages.Tool[];   // adapter for front door A
  execute(name: string, input: unknown, ctx: AgentContext): Promise<unknown>;
}
```

### 5.2 Three-layer tool model, mapped to existing client methods

| Layer | Purpose | Example tools | Backed by |
|---|---|---|---|
| **1 — skills** | One-shot answers to natural questions | `find_patient`, `latest_observation_by_code`, `lab_trend`, `summarize_chart` | compose primitives + `client.request('/Patient/{id}/$everything')` |
| **2 — primitives** | Typed per-resource search/read | `search_resource`, `read_resource`, `resolve_reference` | `client.search` / `client.read` / `client.readReference` (already handles absolute/relative refs) |
| **3 — raw** | Escape hatch | `fhir_raw_request` | `client.request(init)` — GET-only unless `readOnly` is false |

**Minimal v1 tool set** (do not generate all 148 SDs up front): `find_patient`,
`search_resource` (reuses today's `{resourceType, params}` plan shape from
`ask/url.ts`), `latest_observation_by_code`, `lab_trend`, `summarize_chart`,
`get_resource_detail` / `resolve_reference`, the three `tx_*` tools, and
`fhir_raw_request`. Every one of these maps onto a method that already exists on
`FetchFhirClient`.

The existing typed `SearchBuilder` (`react-fhir/src/client/searchBuilder.ts`)
already supports chained search (`whereChained` → `subject:Patient.name=…`),
reverse-chained `_has` (`whereHas` → `_has:Observation:subject:code=…`),
`_include`/`_revinclude`, and date/number prefix operators. It is seeded for
Patient + Observation and extends via declaration merging, so the Layer-2
primitives can lean on it rather than reinventing search-param serialization.

### 5.3 Bundle compactor — the highest-leverage piece

Sits **between the tool executor and the model**. It never changes what the
client fetches, only what the model sees (replacing today's blunt
`.slice(0, 4_000)` truncation in the e2e driver with structured compaction).

```ts
interface CompactBundleResult {
  resourceType: "CompactBundle";
  total?: number;
  entries: { ref: string; type: string; label: string }[]; // 1-line each
  observationSeries?: ObsSeries[];   // grouped by code+unit: n/last/min/max/dates
  truncated: boolean;
  drillRefs: string[];               // "Observation/123" handles
}
interface BundleCompactor { compact(b: Bundle, opts?: CompactOptions): CompactBundleResult; }
```

It (a) drops `text`/narrative, `meta`, redundant `contained`; (b) dedups
`_include`/`_revinclude` resources by `Type/id` (using `entry.search.mode`);
(c) aggregates Observation series by `code.coding.system|code` + unit into
`n/last/min/max/firstDate/lastDate`; (d) always emits stable `drillRefs` so the
model can fetch full detail via `get_resource_detail`. Default `maxEntries: 20`
matches today's `_count=20` default. This is a pure function — trivially
unit-testable and the first thing to build after the registry.

### 5.4 Terminology binding (kills code hallucination)

`config.ts` already persists a terminology base URL (default `tx.fhir.org/r4`).
`agent-core` builds a second `FhirClient` against it (`ctx.tx`) and exposes
`tx_expand`, `tx_validate_code`, `tx_lookup` via `$expand` / `$validate-code` /
`$lookup`. Layer-1 skills resolve free text to a validated `system|code` token
**before** issuing any `code=` search — replacing the current "use codes when
you confidently know them" instruction. Offline fallback: the bundled core
valuesets in `react-fhir/src/structure/core` before degrading to text search.
When ADR 0009 moves from Proposed to Accepted, settle two details: whether
grounding hits a local expansion service or remote `$expand` by default (the
config already allows either), and which binding strengths trigger grounding —
at minimum `required` and `extensible` bindings should, `preferred`/`example`
need not.

### 5.5 CapabilityStatement-aware surfacing

At session init, call `client.capabilities()` (already hits `/metadata`) once,
build a `CapabilitySnapshot` (`{ per-resource interactions, searchParams,
operations }`), cache it keyed by `baseUrl` (servers are switchable), and:
register Layer-2 primitives only for advertised resource types; filter each
primitive's schema to the search params the server actually supports (Epic ≠
HAPI ≠ HealthLake); surface `$everything`-based skills only when the operation
exists. On `/metadata` failure, fall back to a static US-Core-ish default set and
flag `degraded: true` rather than exposing nothing.

## 6. Front door A — in-browser chat

`apps/demo/src/ask/chatLoop.ts` (new) generalizes
`naturalLanguageToFhirQuery` from single-shot into a multi-turn `tool_use` →
`tool_result` loop, using the same bounded-loop shape already proven in
`apps/demo/e2e-agent/agent/driver.ts` (step / wall-clock / cost caps). It:

- owns the `Anthropic({ dangerouslyAllowBrowser: true })` client (the SDK stays
  in the app, never in `agent-core`);
- builds tools via `registry.toAnthropicTools()` and dispatches each call through
  `registry.execute(name, input, ctx)` with `ctx.client` = the active
  `FetchFhirClient` and `ctx.readOnly = true`;
- keeps today's `FhirQueryPlan` / `buildSearchUrl` / request-preview /
  `sameOrigin` guard as the rendering layer for the `search_resource` primitive,
  so the existing `/ask` UX (and its token-leak protection) keeps working — the
  loop just calls it iteratively.

The chat surfaces the resources behind each answer (via `drillRefs`) so the user
can verify, which is both a trust feature and the honest answer to "where did
this come from."

## 7. Front door B — `@fhir-place/mcp`

A Node MCP server that imports the **identical `ToolRegistry`** and exposes it
over a transport. It supplies its own `AgentContext` (a `FetchFhirClient` built
from env/config) and provides the LLM-free half of the system.

**Transports:**

| Transport | When | Secrets posture | Verdict |
|---|---|---|---|
| **stdio** (`npx @fhir-place/mcp`) | Customer runs their own agent locally | Stay in customer env/keychain; no inbound surface | **Default, ship first** |
| **Streamable HTTP** (MCP spec 2025-03-26) | We must host centrally for remote agents | We hold secrets, need endpoint authn + per-tenant isolation + BAA | Build only when a customer can't run local |
| **HTTP+SSE** | — | — | **Deprecated; do not build** |

**Auth modes** (map to both front doors):

| SMART mode | Browser chat | MCP server | Order |
|---|---|---|---|
| Bearer / anonymous (public sandboxes) | current state; token in `localStorage`, sent same-origin only | token in customer env | **first** (HAPI, SMART Health IT) |
| SMART Backend Services (client_credentials + JWT) | poor fit (no safe key custody in browser) | right fit for stdio/hosted | second |
| SMART App Launch (auth code + PKCE) | right fit; short-lived tokens replace pasted bearer — the upgrade path off `localStorage` | awkward (no interactive browser) | third |

Read-only by default in both front doors; writes go behind an explicit
`--allow-writes` flag (MCP) / a `confirmWrite` human-confirmation callback
(browser), mirroring AWS HealthLake's `--readonly` primitive.

**Token scope in the stdio path.** A customer-run-local MCP server inherits
whatever SMART token the user supplies. Document explicitly that this path
should **not** request `offline_access` (no long-lived refresh token should sit
in a local agent's environment) and that token expiry is the caller's
responsibility — the server does not silently refresh. This keeps the
local-MCP credential blast radius small and is one less thing to unwind when the
hosted/PHI path arrives.

## 8. Security & PHI posture

Decision: **build for synthetic/sandbox data now; design so real PHI is a
bounded delta.** The principle is to build the *seams* now where retrofitting
them later would mean touching every call site.

### 8.1 What is actually at risk during the synthetic phase

The asset is **not** PHI — it is (a) the user's **Anthropic API key** (a live
billing credential in `localStorage` — the #1 real risk today), (b) any **FHIR
bearer token** pasted for a non-public server, and (c) demo/brand integrity.
Genuinely fine to defer because data is synthetic: at-rest encryption of FHIR
responses, KMS/CMK, 6-year audit retention, BAA execution, PHI scanning. **Not
deferrable:** anything touching the API key.

### 8.2 Guardrails to bake in now

| Guardrail | Now | Why now |
|---|---|---|
| Read-only-by-default + write-gating | **implement** | one-line posture today; retrofitting after agents write is high-blast-radius |
| PHI-masking hook at the tool-output boundary | **interface only (no-op)** | the cost later is *finding every egress point*; define the boundary now |
| Audit-logging interface on every tool call | **interface + console sink** | HIPAA §164.312(b) needs every access logged; can't add to N handlers after the fact |
| Error redaction (`FetchFhirClient` leaks URL + `OperationOutcome.diagnostics` into thrown text) | **implement (cheap)** | same path PHI would leak through later; make redaction habitual |
| `sameOrigin` token-leak guard | **keep + extend** | already correct; extend to MCP outbound calls and to *all* custom headers, not just bearer |

**Already correct in the codebase, worth preserving:** the `sameOrigin` guard
(`ask/url.ts`), `mergeWithBuiltins` pinning built-in `label`/`baseUrl` against
`localStorage` tampering (anti-retargeting), and strict `input_schema` +
output validation on the model call (first line against prompt injection from
FHIR free-text fields).

### 8.3 The synthetic → PHI delta (enumerable)

When we choose to support real PHI, exactly these flip on — nothing else:

1. Decide BAA posture: customer-brings-own-key/server (local MCP — we may avoid
   being a Business Associate at all) vs we-host.
2. **Move the model call out of the browser** → backend proxy on HIPAA-eligible
   compute; key moves `localStorage` → Secrets Manager. (Largest single change;
   the §8.2 seams are what keep it bounded.)
3. Short-lived FHIR tokens (App Launch / Backend Services) replace pasted bearers.
4. PHI-masking hook gets a real implementation (mask-by-default + explicit
   `unmask`).
5. Audit seam repoints to an immutable sink with 6-year retention.
6. Error redaction enforced in prod.
7. Network policy: VPC, restricted egress (FHIR endpoint + model only), TLS + KMS.
8. If hosted MCP: per-tenant isolation, endpoint authn, Streamable HTTP only.

## 9. Differentiation and go-to-market (the pivot bet)

Per the chosen "full pivot" scope, the engineering above is paired with a
credibility play drawn from the research:

- **Benchmarks as marketing.** Publish FHIR-AgentBench and MedAgentBench scores;
  the Bundle compactor + terminology grounding + capability surfacing are
  precisely the levers those benchmarks reward, and **no competing server has
  published a score.** First credible number on the board owns the narrative.
- **Backend-agnostic + profile-aware + benchmark-leading** is defensible because
  each vendor server (Aidbox, Medplum, AWS HealthLake) only owns its own corner.
- **HL7 community capital.** Propose an "Agent-Native FHIR Access via MCP"
  Connectathon track at the Sept 2026 Bethesda WGM (submission window ~mid-June);
  pursue Inferno (g)(10) / SMART App Launch test-kit conformance for free
  credibility.

**Naming:** the research recommends a rebrand, but **ADR 0004 explicitly decided
"do not rename"** (the npm name is scoped and published; renaming destroys
distribution). This proposal honors that: the `FHIRplace`/`react-fhir` name
collision is handled as a `README` / SEO matter, **not** a package rename. If
the sponsor wants to revisit the rename, that requires superseding ADR 0004 and
is out of scope here.

## 10. Phased plan

Dependency-ordered; each phase is independently shippable.

| Phase | Deliverable | Notes |
|---|---|---|
| 0 | `packages/agent-core` skeleton: `AgentContext`, `AgentTool`, `ToolRegistry`, Anthropic adapter | unit-tested with a fake `FhirClient` (existing test pattern) |
| 1 | `BundleCompactor` (pure fn) + tests | highest leverage; unblocks token budget for every tool |
| 2 | Layer-2 `search_resource` + wire **browser chat loop** (`chatLoop.ts`) | first visible win: multi-turn `/ask`. Ship with an e2e spec per CLAUDE.md |
| 3 | Terminology tools + grounding | reuses existing `TERMINOLOGY_BASE_URL` |
| 4 | `CapabilitySnapshot` gating | dynamic tool surface per server |
| 5 | Layer-1 skills (`find_patient`, `latest_observation_by_code`, `lab_trend`, `summarize_chart`) | built on phases 1–4 |
| 6 | `packages/mcp` stdio server (read-only default) consuming the stable registry | second front door |
| 7 | Publish first FHIR-AgentBench / MedAgentBench score; Connectathon track proposal | the credibility play |

Each phase that changes user-visible behavior ships its Playwright/e2e update
and PR screenshots in the same PR (CLAUDE.md). Each becomes a GitHub issue, with
the roadmap reflected in `README.md` per ADR 0001 / 0004.

## 11. Risks and open questions

- **Browser key custody.** `dangerouslyAllowBrowser` + key-in-`localStorage` is
  acceptable for synthetic BYO-key, and is the explicit trigger for the backend
  proxy when we go to PHI. Make the boundary loud in the UI.
- **Search-param coverage.** `SearchBuilder` is seeded for Patient/Observation;
  Layer-2 primitives for other resources need declaration-merge extensions or a
  generated path from the bundled SDs. Confirm coverage per resource as skills
  are added.
- **MCP spec churn on OAuth 2.1.** SMART App Launch + MCP is not a settled
  pattern; build auth flexibly and don't bet on a stable answer before Q4 2026.
- **Scope realism.** "Full pivot" is a multi-month program. The minimum credible
  slice is phases 0–2 (multi-turn browser chat) + one differentiator (compactor)
  + the MCP stdio server — enough to demo and to submit a Connectathon track.
- **FHIR version.** `@types/fhir` is R4-only; declare R4 scope for compaction and
  skills in v1 even though `FhirVersion` allows 4.3/5.0.

## 12. Relationship to existing decisions

- **ADR 0003 (Agent Safety Rules):** read-only-by-default, write-gating, and
  PR-based review extend the existing agent-safety posture to runtime FHIR tools.
- **ADR 0004 (Positioning):** this is the concrete realization of "reserve room
  for LLM/MCP work" and "an MCP package is permitted under `packages/`." It does
  **not** rename anything, consistent with 0004's decision.
- **ADR 0009 (this proposal's decision record):** records the "one core, two
  front doors," synthetic-now / PHI-ready, read-only-by-default choices.
