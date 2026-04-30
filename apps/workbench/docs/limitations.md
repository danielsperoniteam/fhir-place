# Limitations

Three categories: what is *intentionally* out of scope, what is *not
yet shipped*, and what is shipped but *known to be incomplete*. Each
distinction matters — "we won't" and "we haven't yet" mean different
things to a reviewer.

## Phase A icebox — intentionally out of scope

These are not Phase A goals and will not be added during Phase A. If a
future requirement seems to require any of them, stop and confirm
before shipping (`AGENTS.md`).

- SMART on FHIR auth
- Real PHI handling
- HIPAA compliance claims
- Write-back / mutation against the FHIR server
- Draft / queue / approval workflows
- Prior authorization
- Care-gap detection
- Quality-measure explanation
- CQL execution, `$evaluate-measure`
- DocumentReference text extraction
- MCP server
- BigQuery / OMOP / claims / wearable connection types
- Memory across sessions, multi-agent planning
- Clinician preview mode
- Arbitrary FHIR query generation by the agent
- Arbitrary code execution by the agent

## Not yet shipped — tracked, in flight

These are Phase A goals that haven't landed yet. Each has a tracking
issue under the `fhir-workbench-phase-a` label.

| Slice | Tracking issue | OpenSpec change |
| --- | --- | --- |
| PR 8 — Basic eval harness (runner, golden fixtures, schema-validity / unsupported-claim metrics) | [#77](https://github.com/samsuffolksperoni/fhir-place/issues/77) | `add-basic-evals` (not yet authored) |
| PR 9 — Failure gallery (no-allergy, missing-lab, prompt-injection, unauthorized-patient cases surfaced as a page) | [#78](https://github.com/samsuffolksperoni/fhir-place/issues/78) | `add-failure-gallery` (not yet authored) |
| PR 10 — Demo write-up follow-up: `docs/evals.md`, failure-gallery walkthrough, agent-run screenshots with captured tool timeline | [#79](https://github.com/samsuffolksperoni/fhir-place/issues/79) | `add-demo-writeup` (partial slice merged; remaining items deferred until PR 8 / 9 land) |

The audit log (PR 7) is the substrate PR 8 will read against. The
`AgentAnswer` schema, the registry envelope, and the `agent_answer`
/ `tool_call` / `evidence_claim` rows already have the shapes
PR 8 / 9 will use.

## Known incompletenesses of what *is* shipped (PRs 1–7)

- **The agent runs against one provider.** Anthropic only
  (`server/agent/model-config.ts`). No automatic provider failover.
  Switching providers is intentionally a code change, not a runtime
  knob, so the safety properties stay with one well-understood
  surface.
- **No multi-user authentication.** The workbench is a local-first
  single-user research tool. There is no login screen, no
  authorization beyond the agent's patient-scope check, and no
  audience separation between two browsers pointed at the same
  `:5174`.
- **Bearer tokens stored unencrypted in SQLite.** Documented in
  `docs/data-connections.md` as an explicit non-claim. Phase A is
  synthetic-only single-user local; we do not pretend to solve
  encryption-at-rest.
- **The agent loop is single-shot, not streaming.** The browser waits
  for the whole answer; partial-token streaming would change the
  validation contract and is out of scope.
- **The `summary` field on `AgentAnswer` is allowed but never load-
  bearing.** The renderer shows it; no eval will read it; no claim
  derives from it. It is there so a quick scroll yields a readable
  paragraph.
- **Search-tool result limits cap at 50.** `Observation` searches in
  particular can return more than 50 entries on a busy patient on the
  HAPI sandbox. The agent sees `truncated: true` and can choose to
  cite what it has or note the gap, but it cannot ask for more pages.
  Phase A does not add pagination at the tool layer.
- **Resource viewer renders raw FHIR JSON only.** PR 3 deliberately
  did not add a structured renderer per resource type; that's
  `@fhir-place/react-fhir`'s job. The workbench is not a clinical
  viewer; it's an inspection tool.

## What this means for a reviewer

If you're evaluating the project today, treat:

- **PRs 1–7 (shipped)** as the credible part. `pnpm test:run` is
  green; the agent loop runs against the public HAPI sandbox; every
  agent run + tool call + final answer is persisted; the safety
  properties are anchored to file paths in `docs/safety.md`.
- **PRs 8 / 9 (in flight)** as planned, not delivered. The Phase A
  Definition of Done in `apps/workbench/TASKS.md` is not yet met.
- **The icebox** as a hard line. The project is positioned as a
  research artifact, not a product, and the absence of clinical
  features is the point.
