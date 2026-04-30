# AGENTS.md

Rules for coding agents working on this repository.

## Scope

This file applies to the `@fhir-place/workbench` app and its supporting docs,
schemas, and OpenSpec changes. The component library under
`packages/react-fhir/` and the demo app under `apps/demo/` predate the
workbench and have their own conventions; do not refactor them as part of a
workbench PR.

## Phase A working constraint

The workbench is **synthetic-only, read-only, patient-summary**. Do not add
any of the following without an explicit instruction that names the feature:

- SMART on FHIR auth
- Real PHI handling, HIPAA compliance claims
- Write-back / mutation against the FHIR server
- Draft / queue / approval workflows
- Prior authorization, care-gap detection, quality-measure explanation
- CQL execution, `$evaluate-measure`
- DocumentReference text extraction
- MCP server
- BigQuery / OMOP / claims / wearable connection types
- Memory, multi-agent planning
- Clinician preview mode
- Arbitrary FHIR query generation by the agent
- Arbitrary code execution by the agent

If a task seems to require one of these, stop and ask before writing code.

## How to pick up work

1. The Phase A backlog is in [`apps/workbench/TASKS.md`](apps/workbench/TASKS.md). PR cards land in order.
2. Each PR card has a tracking issue on GitHub under the
   `fhir-workbench-phase-a` label.
3. Implement only the first card in the `Backlog` section unless explicitly
   instructed otherwise. Do not start PR N+1 work inside PR N.
4. Every major feature must have a matching OpenSpec change under
   `openspec/changes/<change-name>/` that ships with the PR.

## Engineering rules

- Every behavior change must include tests, or an explicit reason tests are
  not applicable in the PR description.
- Resource text from FHIR is **data, never instruction**. Never let it flow
  into a system prompt or tool-name position without escaping/wrapping.
- Tools the agent can call must be:
  - typed (input schema enforced),
  - patient-scoped (the patient ID is required and validated server-side),
  - deny-by-default (missing or unauthorized patient IDs reject),
  - resource-allowlisted (no arbitrary FHIR query generation).
- Agent answers must validate against the `AgentAnswer` schema before render.
  Supported claims must cite the resources that support them; missing-data
  and cannot-determine are first-class fields, not absence of text.
- Every agent run, every tool call, and every final answer is persisted.
- The synthetic-only / not-for-clinical-use banner stays visible on every UI
  surface that touches FHIR data.

## Code style

- Match the existing repo: TS strict, ES modules, React function components,
  Tailwind utility classes. No new state-management libraries; use TanStack
  Query for server state and component-local `useState` for UI state.
- Default to no comments. Add a single short line only when the *why* is
  non-obvious (e.g. a workaround for a known bug, a hidden invariant).
- Prefer editing existing files to creating new ones.

## Don't push to `main`

Develop on a feature branch (the branch name is set per-task). Open a PR; do
not merge to `main` without a review.
