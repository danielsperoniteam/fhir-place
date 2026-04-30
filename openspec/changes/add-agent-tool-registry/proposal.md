# Proposal — `add-agent-tool-registry`

## Summary

PR 4 of Phase A. Adds the typed, patient-scoped, deny-by-default tool
layer the patient-summary agent (PR 6) will run against. Six tools land:
`getPatient` plus five `searchXForPatient` tools covering the Phase A
compartment. Sessions carry exactly one authorized patient id; every
tool call validates that scope before doing any FHIR work.

## Motivation

PR 3 gives us a chokepoint that enforces a FHIR resource and search-param
allow-list. That's necessary but not sufficient for the agent. The
registry adds:

- **Domain inputs** so the agent emits typed values (`clinicalStatus`,
  `category`, `dateRange`) instead of FHIR-syntax strings.
- **Patient-scope enforcement** the proxy can't do alone — the proxy has
  no notion of "the patient *this run* is allowed to touch."
- **Result limits and timeouts** at the tool boundary, on top of the
  proxy's `_count` clamp.
- **A normalized envelope** so success and every flavor of failure share
  one shape with a machine-readable `reason`.
- **A logging hook** PR 7 can subscribe to without changing any tool.

PR 6 will call **only** these tools — never the proxy directly, never
`fetch`, never the DB.

## Scope

In:

- New table `agent_session(id, connection_id, patient_id, created_at,
  updated_at)` and migration `0002_agent_session.sql`.
- `ToolEnvelope` + `ToolErrorReason` shared types.
- `ToolLogger` interface with in-memory and console implementations.
- `ToolDef` + `createRegistry()` runner: input validation, patient-scope
  check, timeout via `AbortSignal`, array truncation at `resultLimit`,
  internal-error catch, mandatory logging hook invocation.
- Six tool definitions:
  - `getPatient`
  - `searchConditionsForPatient` (`clinicalStatus?`, `limit?`)
  - `searchMedicationRequestsForPatient` (`status?`, `limit?`)
  - `searchAllergyIntolerancesForPatient` (`limit?`)
  - `searchEncountersForPatient` (`dateRange?`, `limit?`)
  - `searchObservationsForPatient` (`category?`, `dateRange?`, `limit?`)
- HTTP routes:
  - `POST/GET/DELETE /api/sessions` and `/api/sessions/:sid`
  - `GET /api/sessions/tools`
  - `POST /api/sessions/:sid/tools/:toolName`
- Frontend: a "Start agent session" button on the patient page and a
  humans-only debug `SessionPage` for running tools by hand.
- Docs at `docs/fhir-tools.md`.

Out:

- LLM, prompt, agent loop (PR 6).
- `tool_call` DB persistence (PR 7) — the logging hook is shaped for it
  but stays in-memory in PR 4.
- Tool composition / chaining inside the registry — the agent does that.
- Tools outside the Phase A compartment.

## Architecture decisions

- **Sessions are explicit and patient-scoped, not implicit.** A user
  starts a session with one click; the patient id is locked at session
  create. The alternative (deriving patient scope from request headers
  or cookies) hides the trust boundary; an explicit row makes audit
  obvious.
- **Patient id required in tool input *and* validated against the
  session.** Belt and braces: tool inputs declare what they need; the
  runner enforces scope. A mismatch returns
  `reason: "unauthorized_patient"`. PR 6's agent never has a way to
  forge or override this.
- **Tools call the proxy.** All FHIR I/O goes through the same chokepoint
  PR 3 introduced. Tools translate domain → URL params; the proxy
  enforces FHIR allow-lists; the runner enforces patient scope.
- **Normalized envelope, not exceptions.** Success and every failure
  reason are in the same shape so the agent / UI can branch on `reason`
  without try/catch.
- **HTTP status mirrors reason.** Tests assert both. The envelope's
  `reason` is the source of truth; HTTP status is for clients that don't
  parse the body.

## Safety

- Tools the agent can call are explicitly enumerated; there is no
  reflection, dynamic import, or registry mutation at runtime.
- Tool input must include `patientId`. The runner rejects mismatch with
  the session before any execution.
- Tools cannot fetch directly — they receive `ctx.fetch` which the
  shared helpers route through `proxySearch` / `proxyRead`.
- The connection's auth token is never exposed to tools or returned in
  any envelope. The tool's `ctx.connection` includes it, but the
  envelope is built without it.
- Logger throws never break tool execution.
- Timeouts use `AbortSignal`; tools cannot ignore the signal because the
  shared `runPatientSearch` / `runRead` thread it through to `fetch`.

## Non-goals

- An agent loop. PR 6.
- DB persistence of tool calls. PR 7.
- Free-form FHIR query tools.
- Tools that mutate the upstream FHIR server.
- Tool authentication (role-based, OAuth scopes, etc.). Phase A is
  single-user.
