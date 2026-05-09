# 0005 Response to May 2026 Competitive Analysis

## Status
Accepted

## Context
A May 2026 user-supplied competitive analysis surveyed the FHIR-browser/editor
space (Zus FHIRplace, Drummond + AEGIS "FHIRplace Pilot," Medplum App, Aidbox
UI + WebMCP, Beda EMR, Vanya, bonFHIR, FRED, Jason Fang's
medxaidev/fhir-runtime-tools, Kodjin, the chat.fhir.org #implementers > FHIR
Browser thread started by "Matt") and produced a list of recommendations
covering naming, outreach, unmet needs, and UX patterns to borrow.

The analysis was reviewed by the PM, principal platform engineer, senior FHIR
engineer, TPM, and clinical informaticist. This ADR records the convergent
decisions; non-convergent items are listed as open questions.

ADR 0004 already established the wedge (backend-agnostic, spec-driven, headless
React primitives + room for LLM/MCP) and the "do not rename" decision. This
ADR does not relitigate that; it scopes the response to the new evidence.

## Decision

### 1. Naming — ADR 0004 holds
The new evidence (Drummond + AEGIS "FHIRplace Pilot" certification platform,
Zus FHIRplace, Hibbert blog) does not change the rename calculus. Drummond is
in a different category (testing/certification labs, not developer libraries);
Zus is a backend-locked admin UI inside a vendor product. None hold a
trademark we found.

Mitigation:
- Add a one-line disambiguation to `README.md` ("Not affiliated with Zus
  FHIRplace or Drummond's FHIRplace Pilot.").
- Re-evaluate only if (a) a trademark is filed, (b) we receive a C&D, (c)
  Google search for `fhir-place npm` surfaces a competitor above us, or (d) a
  customer reports confusion on a sales call.

### 2. MCP — split into two packages, sequence server-first
Server-side `@fhir-place/mcp` (#128) ships first — it composes cleanly with
existing FHIR AuthZ (SMART scopes, bearer tokens, server-as-PDP).

WebMCP (in-page agent driving the SPA) is a **separate package**
(`@fhir-place/agent-tools`) with its own threat model, not part of the demo
shell. The asymmetry the analysis glosses over is real:
- Token exfiltration via prompt injection in rendered FHIR narrative.
- Confused-deputy writes at machine speed under the user's RBAC.
- PHI to model providers — BAA is per-provider, per-customer, NOT a property
  of the library.
- AuditEvent must distinguish user-initiated from agent-initiated writes
  (`AuditEvent.agent` with on-behalf-of attribution).

WebMCP ships read-only behind an explicit `enableAgentTools` prop, default
off. Write mode requires a published threat model and a customer with a signed
BAA chain.

The demo (which hits public HAPI) MUST NOT be the place we ship a writable
agent loop, even with no PHI present, because the muscle memory we build there
is what customers will copy.

### 3. Validation — offline is the inner loop, online is additive
Layer offline Zod-from-StructureDefinition (#124) as the always-on inner loop:
keystroke-level cardinality, datatype, regex, bound code presence. Online
`$validate` is opt-in, debounced ≥750ms, bound to blur/explicit-action — never
keystroke. Reasons:
- Server variance (HAPI strict, Medplum pared-down, Aidbox profile-aware,
  HealthLake limited) breaks the spec-driven UX promise if we depend on it.
- Every keystroke `$validate` ships partial PHI through every intermediate
  proxy and access log.
- Unsupported / 401 / 5xx must degrade silently to offline, not loop.

Validation UI is identical across servers; online produces an additive
`OperationOutcome` panel attributed to the server.

### 4. Provenance, AuditEvent, and version history are three different things
The analysis conflates them. We separate:
- **Provenance tab** — `_revinclude=Provenance:target` + `Provenance.entity`
  with `role=source` for "trace back to CCDA." Clinically valuable beyond
  Carequality (med rec, allergy reconciliation, problem-list grooming).
- **Version history tab** — `_history` + `meta.versionId`, with
  element-aware diff (FHIRPath-keyed, ignoring `meta.lastUpdated`/`versionId`
  noise). Per-resource-type semantic summary for MedicationRequest,
  AllergyIntolerance, Condition, Observation in v1; generic JSON diff is a
  developer convenience that produces clinically misleading output.
- **Access log tab (optional)** — `AuditEvent`, gated on server support and
  user role. Compliance/security, NOT clinical lineage. Do not co-locate with
  Provenance.

Server feasibility is gated on `CapabilityStatement.rest.resource[].versioning`
and `searchRevInclude` containing `Provenance:target`; degrade gracefully.

### 5. Profile-aware editing — US Core 7.0.0 snapshot-only for v1
Grow `useStructureDefinition` (#28) with explicit v1 scope:
- Snapshot only; document the requirement.
- Slicing on discriminator `value` for `code.coding.system`/`code` and on
  `url` for extensions (covers ~90% of US Core).
- Extensions: read `type.profile`, render with min/max from the slice.
- mustSupport renders as a UI affordance (badge/asterisk), NOT validated as
  required.
- Binding tightening: resolve from profile differential first, fall back to
  base.

IPS, AU Base, and pattern[x] slicing on complex types are v2.

### 6. Editor safety guardrails — profile-independent
These fire regardless of whether a profile is loaded, and are labeled
"developer tool warnings, not clinical decision support":
- Block save if AllergyIntolerance / Condition / MedicationRequest /
  Observation lacks `patient`/`subject`.
- Block save on unresolvable `Coding` (system+code that doesn't validate
  against the declared system).
- Warn before deleting a resource that has active references pointing at it.
- Force UCUM in `Observation.valueQuantity.code`; free-text `unit` only
  displays.
- Never abbreviate "U" / "IU" / "units" in any rendered text.
- Allergy display always shows reaction + criticality + verification together.
- Status transitions that go backwards (e.g. `clinicalStatus: resolved →
  active`) require a reason.

### 7. Bundle composer — separate package
New package `@fhir-place/bundle` depending on `@fhir-place/react-fhir`. Reuses
ResourceEditor + ReferencePicker; adds urn:uuid resolver, cross-entry
reference picker, Bundle-level validation aggregator. Dry-run via
`Bundle.type=batch` (with a documented caveat that batch forbids
interdependent references; true referential dry-run is client-side graph
check + offline `$validate`).

Bundle composer is developer/QA territory, not a clinician workflow. Bulk
import refuses to run against a server whose
`CapabilityStatement.implementation.description` looks production-ish, or
requires typed confirmation.

### 8. Cross-server compare/sync — defer write, ship export-to-Bundle first
The analysis claims this is "almost free" off the tab bar. It isn't:
- Reference rewriting is a graph problem (cycles, urn:uuid id map,
  deterministic walk order).
- Transaction vs. batch are different products with different failure modes.
- Terminology drift between source and target makes "successful clone"
  meaningless without a post-clone validation pass.
- PHI crosses trust boundaries inside our app — the user is the covered
  entity, but we are a conduit and conduits must behave (no localStorage, no
  console.log of bodies, AuditEvent on both ends if supported).

V1 ships "export this compartment to a Bundle file" — read-only, doesn't
cross trust boundaries inside the app, user can `POST` it themselves with
eyes open. One-click cross-server clone is v2 with its own ADR.

### 9. Outreach
Owned by PM. Tracked in a single GitHub issue (not in this ADR):
- Reply to Matt in #implementers > FHIR Browser with a demo link + ask for a
  20-minute walkthrough.
- DM Jason Fang (medxaidev/fhir-runtime-tools) — collaborate-or-compete
  conversation before either side reinvents the other's wheel.
- Read Aidbox WebMCP tool surface; copy the shape into #128.
- Lower priority: Beda EMR team (different JTBD).

### 10. Deferred / out of scope
- **Generic resource Compare/diff button.** Per informaticist review: produces
  clinically misleading output. Ship per-resource-type semantic diffs in the
  version history tab instead.
- **Cross-server clone (write).** See §8.
- **Bulk `$import`/`$export`.** Wrong layer — backend job, streaming-PHI
  pipeline in browser is a separate ADR if we ever do it.
- **Library rename.** See §1 and ADR 0004.
- **Localized formatters, example library, shareable read-only view,
  multi-server query workspace, network panel.** Revisit after 1.0.

## Consequences
- Net-new issues filed (linked from this ADR's PR description):
  Provenance + version history tabs, online `$validate` layering, FHIRPath
  playground, WebMCP read-only prototype + threat model, editor clinical
  safety guardrails, Bundle composer package, export-compartment-to-Bundle,
  outreach tracker, README disambiguation.
- `@fhir-place/bundle` and `@fhir-place/agent-tools` are permitted under
  `packages/` per ADR 0004's MCP-package allowance, extended.
- `@fhir-place/mcp` (#128) acceptance criteria expand to cover the full
  read/search/edit/validate/runCql tool surface, not just NL→search.
- ADR 0004 §Consequences should be read alongside this ADR; the README
  "Comparison" table remains the authoritative competitive matrix.

## Open questions
- Is Jason Fang a hobby project or a funded startup? One DM answers it and
  reshapes the priority of #128 and the Bundle composer issue.
- Does Matt represent one person or fifty? Skim the last 90 days of
  #implementers for similar asks.
- Does the MCP-on-FHIR audience represent real buyers or demo traffic? Need
  telemetry on #141 / "Ask AI" usage, or instrument it.
