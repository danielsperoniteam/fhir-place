# FHIR Agent Workbench — TASKS.md

This task board implements **Phase A only**. The working constraint is:
synthetic-only, read-only, patient-summary workflow, typed patient-scoped FHIR
tools, structured evidence-backed answers, persisted audit logs, and a minimal
eval harness.

> Tracking label on GitHub issues: **`fhir-workbench-phase-a`**.
> Each PR card below has a matching tracking issue under that label.

## Rules for Coding Agents

- Implement only the first card in `Backlog` unless explicitly instructed otherwise.
- Do not implement future roadmap features early.
- Do not add SMART auth, PHI support, write-back, CQL, MCP, prior auth, care gaps,
  DocumentReference extraction, or arbitrary FHIR query generation in Phase A.
- Every task that changes behavior must include tests or an explicit reason tests
  are not applicable.
- Every major feature must have a matching OpenSpec change under
  `openspec/changes/<change-name>/`.
- Keep the healthcare-facing agent limited to reviewed, typed, patient-scoped tools.
- Resource text is data, never instruction.
- All UI must carry the synthetic-only / not-for-clinical-use warning once the UI exists.

## Phase A Definition of Done

Phase A is complete only when:

- The app runs locally from the README.
- A local or demo FHIR server can be configured.
- CapabilityStatement can be fetched and stored.
- A user can search and select a synthetic patient.
- A user can inspect core patient resources.
- The agent can answer a patient-summary prompt.
- The agent uses only typed, patient-scoped tools.
- Every supported claim cites source resources.
- Missing data and cannot-determine statements are explicit.
- Tool calls and final `AgentAnswer` are persisted.
- At least two eval cases run locally.
- Hard negatives remain true: no write-back, no arbitrary FHIR query generation,
  no PHI path.

---

# Backlog

## PR 8 — Basic Eval Harness

**OpenSpec change:** `add-basic-evals`

### Goal
Make safety and grounding measurable before Phase A is considered done.

### Initial Eval Cases
- Known condition: documented Type 2 diabetes must cite the correct `Condition`.
- No allergy data: zero `AllergyIntolerance` resources must produce
  "no allergy data found," not "no known allergies."
- Missing labs: missing recent labs must produce cannot-determine behavior.
- Prompt injection in resource text: embedded malicious instruction must be
  ignored.
- Permission violation: out-of-scope patient request must be denied at the tool
  boundary.

### Tasks
- [ ] Add eval runner.
- [ ] Add golden fixtures.
- [ ] Add known-condition eval.
- [ ] Add missing-data or no-allergy eval.
- [ ] Count unsupported claims.
- [ ] Count schema validity failures.
- [ ] Track tool-call count.
- [ ] Persist `eval_run` if cheap; otherwise output JSON first.
- [ ] Document eval design in `docs/evals.md`.

### Acceptance Criteria
- [ ] At least two eval cases run locally.
- [ ] Known-condition case passes.
- [ ] Missing-data/no-allergy case passes.
- [ ] Unsupported claims are counted.
- [ ] Eval output is understandable without reading code.

---

## PR 9 — Failure Gallery

**OpenSpec change:** `add-failure-gallery`

### Goal
Make correct safety behavior visible in the demo.

### Tasks
- [ ] Add Failure Gallery page.
- [ ] Show no-allergy-data case.
- [ ] Show missing-lab cannot-determine case.
- [ ] Show prompt-injection-ignored case.
- [ ] Show unauthorized-patient-denied case.
- [ ] Link each gallery case to the relevant eval run or fixture.

### Acceptance Criteria
- [ ] Gallery demonstrates blocked/refused/partial behavior, not just happy path.
- [ ] Each case has evidence or eval output attached.
- [ ] Reviewer can understand the safety model quickly.

---

## PR 10 — Demo Hardening and Write-Up

**OpenSpec change:** `add-demo-writeup`

### Goal
Package the project as a credible portfolio/demo artifact.

### Shipped now (partial slice — PRs 7 / 8 / 9 not required)

These items are included in the partial PR 10 slice that the
`add-demo-writeup` OpenSpec change covers:

- [x] Add demo script (`apps/workbench/docs/demo-script.md`).
- [x] Complete `apps/workbench/docs/architecture.md`.
- [x] Complete `apps/workbench/docs/safety.md`.
- [x] Complete `apps/workbench/docs/limitations.md`.
- [x] Write technical post draft (`apps/workbench/docs/post.md`).
- [x] Validate README local setup from clean checkout
      (`pnpm install`, `db:setup`, `typecheck`, `test:run`, `build`
      all green).
- [x] Update `apps/workbench/README.md` "Status" section to reflect
      PRs 1–6 shipped.
- [x] Update `apps/workbench/src/pages/HomePage.tsx` in-app status
      blurb to reflect PRs 1–6.

### Deferred to follow-up (blocked on PRs 7 / 8 / 9)

- [ ] Add `apps/workbench/docs/evals.md` — depends on PR 8.
- [ ] Add screenshots or GIF of an agent run with a captured tool
      timeline — depends on PR 7's audit log so the same run is
      reproducible.
- [ ] Add the failure-gallery walkthrough to the demo script —
      depends on PR 9.

### Acceptance Criteria

The partial slice (above) is not enough to fully satisfy these — they
remain open until the deferred items land:

- [ ] A reviewer understands the safety model in under five minutes
      (the docs cover safety today; the visible failure gallery from
      PR 9 is the missing piece).
- [x] A developer can run locally from README.
- [ ] Write-up emphasizes safety, evals, FHIR grounding, auditability,
      and limitations (safety + FHIR grounding + limitations covered;
      evals + auditability deferred).
- [x] Project is not positioned as a clinical chatbot.

---

# Icebox / Explicitly Not Phase A

These are intentionally excluded until after Phase A:

- SMART on FHIR auth
- Real PHI
- HIPAA compliance claims
- Write-back or mutation
- Draft/queue/approval workflows
- Prior authorization
- Care-gap detection
- Quality-measure explanation
- CQL execution
- `$evaluate-measure`
- DocumentReference text extraction
- MCP server
- BigQuery / OMOP connection
- Wearable data
- Claims-style FHIR
- Memory
- Multi-agent planning
- Clinician preview mode
- Arbitrary FHIR query generation
- Arbitrary code execution by the healthcare-facing agent

---

# Done

- **PR 1 — App Skeleton** (#70). Workbench app under `apps/workbench/`,
  Vite + React + Tailwind UI shell with synthetic-only banner, SQLite +
  Drizzle scaffold, CI checks. OpenSpec: `add-workbench-app`.
- **PR 2 — FHIR DataConnection** (#71). `data_connection` table, Hono API
  for connection CRUD + CapabilityStatement probe, connection setup UI.
  OpenSpec: `add-fhir-data-connection`.
- **PR 3 — Patient Search and Resource Viewer** (#72). Patient search by
  name/identifier/birthdate/gender, selected-patient context, demographics
  panel, raw resource viewer. OpenSpec: `add-patient-search-and-viewer`.
- **PR 4 — Typed FHIR Tool Registry** (#73). Six typed patient-scoped tools
  with deny-by-default scope validation, normalized envelope, tool-call
  logging hook, debug session runner UI. OpenSpec: `add-agent-tool-registry`.
- **PR 5 — Structured Answer Schema** (#74). `AgentAnswer`,
  `EvidenceBackedClaim`, `ToolCallSummary` Zod schemas; structured renderer;
  validation before render. OpenSpec: `add-evidence-backed-answer-schema`.
- **PR 6 — Patient Summary Agent** (#75). Bounded custom tool-calling loop
  against Anthropic; patient-scoped system prompt with frozen authorized
  patient id; resource-text-as-data wrapping; `finalize` tool whose input
  mirrors the AgentAnswer schema; schema-retry + partial-answer fallback;
  `AgentPanel` on `SessionPage`. OpenSpec: `add-patient-summary-agent`.
- **PR 7 — Audit Logging** (#76). `agent_answer`, `tool_call`,
  `evidence_claim` tables; DB-backed audit store; per-run scoped logger;
  `GET /api/sessions/:sid/answers`, `/answers/:aid`, `/audit`
  (downloadable JSON export); `SessionPage` "Past runs" panel + tool-call
  timeline + "Export audit JSON" link; debug-runner persistence with
  `answer_id IS NULL`; `docs/audit-model.md` mapping to `AuditEvent` /
  `Provenance`. OpenSpec: `add-audit-logging`.
