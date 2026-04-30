# Demo script

A ~10-minute walkthrough of the FHIR Agent Workbench. Targets a fresh
checkout against the **public HAPI sandbox** (`https://hapi.fhir.org/baseR4`)
so a reviewer doesn't need Docker or a local FHIR server to evaluate the
project.

Everything here is **synthetic**. The public HAPI sandbox is a shared,
publicly-resettable FHIR server intended for testing — do not enter real
patient information into it under any circumstance.

## Status: which PRs this script exercises

| PR | Component | Exercised below |
| --- | --- | --- |
| 1 | App skeleton, synthetic-only banner, SQLite + Drizzle | step 1 |
| 2 | FHIR DataConnection + CapabilityStatement probe | step 2 |
| 3 | Patient search and resource viewer | step 3 |
| 4 | Typed FHIR tool registry (debug runner) | step 4 |
| 5 | Structured `AgentAnswer` schema + renderer | step 5 |
| 6 | Patient-summary agent loop | step 6 (requires `ANTHROPIC_API_KEY`) |

Not yet shipped (see [`limitations.md`](./limitations.md)):

- PR 7 — audit log persistence of tool calls and final answers.
- PR 8 — eval harness with golden cases.
- PR 9 — failure gallery page.

## Prerequisites

- Node 22.x (`node --version`)
- pnpm 10.x (`pnpm --version`)
- A clean checkout of `samsuffolksperoni/fhir-place` on `main`
- For step 6 only: an `ANTHROPIC_API_KEY` environment variable

## 0. Install

```bash
pnpm install
pnpm --filter @fhir-place/workbench db:setup
```

Validation:

```bash
pnpm --filter @fhir-place/workbench typecheck
pnpm --filter @fhir-place/workbench test:run
pnpm --filter @fhir-place/workbench build
```

All three should exit 0 on a clean checkout. If they don't, stop here and
file an issue — the rest of the script assumes a healthy build.

## 1. Boot the workbench

In two terminals from the repo root:

```bash
# terminal 1: the API
pnpm --filter @fhir-place/workbench server
```

```bash
# terminal 2: the frontend
pnpm --filter @fhir-place/workbench dev
```

Open <http://localhost:5174>. You should see:

- The yellow **Synthetic data only — not for clinical use** banner
  (`apps/workbench/src/components/SyntheticOnlyBanner.tsx`). It sits
  above the header on every page and never moves.
- The home page summary of what Phase A ships.

## 2. Add a FHIR connection

Click **Connections → New connection**.

- **Name**: `Public HAPI sandbox`
- **Kind**: `fhir_clinical` (the only allow-listed kind in Phase A)
- **Auth**: `none`
- **Base URL**: `https://hapi.fhir.org/baseR4`

Save. The detail page now shows the row. Click **Test connection**. The
server fetches `/metadata`, persists the `CapabilityStatement`, and
shows:

- `lastCapabilityStatus: ok`
- `lastCapabilityFhirVersion: 4.0.1`
- `lastCapabilitySoftware: HAPI FHIR Server` (or whatever HAPI advertises)

What just happened, in code:

- The browser POSTed `/api/connections/:id/test` to the Hono API.
- `apps/workbench/server/services/fhir-connection.ts` fetched
  `${baseUrl}/metadata`, validated it was a `CapabilityStatement`, and
  persisted the result via the connection store.
- The auth token (none in this case) **never** leaves the server. The
  frontend only ever sees `hasAuthToken: true | false`.

See [`docs/data-connections.md`](./data-connections.md) for the full
allow-list and HTTP API.

## 3. Find a synthetic patient

Click into the connection, then **Patients**.

The HAPI sandbox has thousands of test patients. To narrow it down,
type something common into the search form — `family: smith`,
`gender: female`, `_count: 20` — and submit.

Picking any patient takes you to `/connections/:cid/patients/:pid`,
which renders:

- A demographics panel (HumanName, gender, birthdate, identifiers)
- Six compartment cards: Condition, MedicationRequest,
  AllergyIntolerance, Encounter, Observation, each with a one-line
  per-resource summary and a "+ N more" overflow.

Click any chip to land on `/connections/:cid/patients/:pid/:resourceType/:id`
— the raw FHIR JSON viewer. Resource bodies come straight from upstream
HAPI; the workbench does not rewrite them.

What just happened, in code:

- The browser called `/api/connections/:cid/fhir/<…>`.
- `apps/workbench/server/routes/fhir.ts` validated the resourceType
  against the Phase A allow-list (`Patient | Condition |
  MedicationRequest | AllergyIntolerance | Encounter | Observation`),
  filtered the search params against the per-resource allow-list, and
  forwarded only the allowed bits.
- Anything outside the allow-list (e.g. `_include`, `_revinclude`,
  `_has`, `_format`) is silently dropped — there is no path that lets a
  user or the agent expand the response shape.

See [`docs/patient-viewer.md`](./patient-viewer.md) for the full
allow-list.

## 4. Open a debug session against the typed tool registry

From the patient detail page, click **Open agent session** (or POST
`/api/sessions` directly — see [`docs/fhir-tools.md`](./fhir-tools.md)).

This creates an `agent_session` row bound to `(connectionId, patientId)`.
The session is the patient-scope chokepoint: every tool call inside it
must carry the same `patientId`, or it is rejected with
`reason: "unauthorized_patient"`.

Now exercise the registry by hand:

1. Pick **`getPatient`** from the dropdown, leave the extra JSON empty,
   click **Run**. The envelope shows the upstream `Patient` resource and
   `ok: true`.
2. Pick **`searchConditionsForPatient`**, leave the extra JSON empty,
   click **Run**. The envelope shows the patient's `Condition` array
   with `count` and (if truncated) `truncated: true`.
3. **Try to break out.** Type `{ "patientId": "Patient/different-id" }`
   into the extra JSON box and click **Run**. The envelope comes back
   `ok: false`, `reason: "unauthorized_patient"`. The session refused
   to widen its scope.
4. **Try an unknown tool.** No UI path exposes one, but `POST
   /api/sessions/:sid/tools/dropTable` returns `ok: false`,
   `reason: "unknown_tool"`.

This is the surface the LLM is allowed to call in step 6. Nothing else.

## 5. Inspect the structured `AgentAnswer` shape

Click **AgentAnswer preview** (top right of the session page) or visit
`/answer-preview` directly.

The page ships a known-good `AgentAnswer` JSON. Edit it in the textarea
to demonstrate the schema:

- Delete every entry from `claims[0].evidence` and submit. The page
  shows the Zod issues — `evidence` must contain at least one
  `ResourceReference`.
- Change `schemaVersion` from `"1"` to `"2"`. Validation rejects it.
  Bumping the version is an explicit breaking change.
- Replace one of the references with `Procedure/abc-123`. Validation
  rejects it — references must be against the Phase A allow-list:
  `Patient | Condition | MedicationRequest | AllergyIntolerance |
  Encounter | Observation`.

The renderer (`apps/workbench/src/agent/AgentAnswerRenderer.tsx`) only
ever sees a *validated* answer. It does not parse, branch on shape
mismatches, or render a "best effort" rendering of malformed input.

See [`docs/agent-answer.md`](./agent-answer.md) for the full schema.

## 6. Run the patient-summary agent (requires `ANTHROPIC_API_KEY`)

This is the live LLM workflow. Skip this step if you don't have an API
key handy — the rest of the demo stands without it.

Stop the API process, set the key, and restart:

```bash
ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @fhir-place/workbench server
```

Optionally pin the model:

```bash
WORKBENCH_AGENT_MODEL=claude-sonnet-4-6 \
ANTHROPIC_API_KEY=sk-ant-... \
pnpm --filter @fhir-place/workbench server
```

Reload the session page. The agent panel should now show:

- `Ready · provider anthropic · model claude-sonnet-4-6 · prompt patient-summary@v1`
- An enabled **Run "Summarise this patient."** button.

Click it. The orchestrator (`apps/workbench/server/agent/orchestrator.ts`)
runs the loop:

1. Renders the patient-scoped system prompt
   (`apps/workbench/server/agent/prompts.ts`) with the session's
   authorized patient id in plain text.
2. Lets the model call any of the six PR 4 tools plus a terminal
   `finalize` tool.
3. Wraps every tool result in
   `<tool_envelope ...><resource_data>…</resource_data></tool_envelope>`
   before handing it back to the model. Resource text never reaches the
   system prompt position.
4. Validates the `finalize` payload against the `AgentAnswer` Zod
   schema. On validation failure, returns one structured `is_error`
   tool_result so the model can correct itself; if the second attempt
   also fails, the orchestrator builds a partial answer.
5. Caps at 8 model calls and 4000 output tokens by default. Either
   limit triggers a partial-answer fallback with a `cannotDetermine`
   entry naming the cause.

The page renders the validated answer through
`AgentAnswerRenderer`: a short summary, the supported claims with their
evidence chips (each linking back to the resource viewer at step 3),
the missing-data and cannot-determine sections, and the tool-call
timeline.

What to look for:

- Every supported claim cites at least one FHIR resource. Click an
  evidence chip to land on the JSON.
- "No allergies" appears as a `missingData` entry, not as a supported
  claim.
- Anything the agent couldn't answer appears as a `cannotDetermine`
  entry with a `why` field, not as silence.

See [`/docs/agent-loop.md`](../../docs/agent-loop.md) for the full
loop contract and safety properties.

## What's *not* in this demo

- **Audit log review.** PR 7 will persist tool calls and final answers
  to SQLite (`tool_call`, `evidence_claim` tables) and add a session
  detail view with a tool-call timeline and JSON export. The current
  build keeps tool calls in the orchestrator's in-memory log only.
- **Eval harness output.** PR 8 will add a runnable eval suite with
  golden fixtures for known-condition, no-allergy-data, missing-labs,
  prompt-injection, and unauthorized-patient cases.
- **Failure gallery walkthrough.** PR 9 will surface the eval cases as
  a gallery page so the safety story is visible without reading code.

These three slices are the remaining Phase A work. Once they land, this
script will grow steps 7 (audit-log review), 8 (run the eval suite),
and 9 (walk the failure gallery), and then close issue #79 fully.
