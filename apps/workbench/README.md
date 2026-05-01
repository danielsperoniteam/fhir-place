# @fhir-place/workbench

A research workbench for evidence-backed agent answers grounded in **synthetic
FHIR data**. Phase A only.

> **Synthetic data only. Not for clinical use. Do not enter real patient
> information.** This is research / prototyping software. It does not implement
> SMART on FHIR auth, does not handle PHI, and is not a clinical decision
> support tool.

## Status — Phase A (PRs 1–8 shipped)

This package currently ships:

- A Vite + React + Tailwind UI shell with a synthetic-only banner on every page.
- A SQLite + Drizzle local-first database (`data_connection`, `agent_session`,
  `agent_answer`, `tool_call`, `evidence_claim`).
- A small Hono API at `apps/workbench/server/` that the frontend talks to over
  `/api`.
- A connection setup flow: list, create, test (CapabilityStatement probe),
  delete.
- A read-only FHIR proxy with a per-resource search-param allow-list.
- Patient search by name / identifier / birthdate / gender, a demographics
  panel, six compartment cards, and a raw FHIR JSON viewer.
- A typed, patient-scoped, deny-by-default tool registry (six tools) plus a
  debug session runner.
- The structured `AgentAnswer` Zod schema and a renderer that only ever sees
  validated answers.
- A bounded patient-summary agent loop (Anthropic, sonnet-4-6 default) that
  can only call the registered tools plus a terminal `finalize` tool, and
  treats resource text as data, never instruction.
- A persisted audit log: every agent run, every tool call (agent or debug),
  every final answer, and every cited claim is replay-inspectable. JSON
  export is one click; the `SessionPage` "Past runs" panel shows the
  tool-call timeline and cited evidence inline.
- A deterministic, offline eval harness under `server/eval/` covering five
  Phase A safety cases (known-condition, no-allergy-data, missing-labs,
  prompt-injection, permission-violation). `pnpm eval` writes
  `eval-report.json`, prints PASS / FAIL per case, and exits non-zero on
  failure. See [`docs/evals.md`](docs/evals.md).

In flight: failure gallery (PR 9, [#78]) and the remaining demo write-up bits
(PR 10, [#79]).
See [`TASKS.md`](TASKS.md), [`docs/architecture.md`](docs/architecture.md),
[`docs/safety.md`](docs/safety.md), [`docs/limitations.md`](docs/limitations.md),
[`docs/audit-model.md`](docs/audit-model.md), [`docs/evals.md`](docs/evals.md),
and the copy-pasteable [`docs/demo-script.md`](docs/demo-script.md).

[#78]: https://github.com/samsuffolksperoni/fhir-place/issues/78
[#79]: https://github.com/samsuffolksperoni/fhir-place/issues/79

## Local setup

The frontend (Vite, port 5174) and the API (Hono, port 5175) run as two
processes. From the repo root, in two terminals:

```bash
pnpm install
pnpm --filter @fhir-place/workbench db:setup
pnpm --filter @fhir-place/workbench server   # terminal 1
pnpm --filter @fhir-place/workbench dev      # terminal 2
```

Vite dev proxies `/api` to the Hono server. Override the API port with
`WORKBENCH_PORT`:

```bash
WORKBENCH_PORT=6000 pnpm --filter @fhir-place/workbench server
WORKBENCH_PORT=6000 pnpm --filter @fhir-place/workbench dev
```

The SQLite file defaults to `apps/workbench/workbench.sqlite`; override with
`WORKBENCH_DB_URL=/some/path.sqlite`.

### Agent provider configuration

By default, the patient-summary agent reads `ANTHROPIC_API_KEY`.

- `WORKBENCH_AGENT_API_KEY` overrides `ANTHROPIC_API_KEY`.
- `WORKBENCH_AGENT_MODEL` overrides the default `claude-sonnet-4-6`.
- `WORKBENCH_AGENT_BASE_URL` lets you point the Anthropic SDK at a compatible
  gateway endpoint.

If you want to run via AWS Bedrock, run the workbench against a Bedrock-aware
gateway that exposes the Anthropic Messages API shape, then set
`WORKBENCH_AGENT_BASE_URL` + `WORKBENCH_AGENT_API_KEY` for that gateway.

#### Does Bedrock make sense for this workbench?

It can, depending on your deployment constraints.

Use Bedrock when you need one or more of:

- AWS-native networking and identity boundaries (for example, private VPC
  routing and IAM-based access to your gateway).
- Centralized model routing/governance shared with other internal AWS workloads.
- A single provider control plane for demos that must stay inside an AWS
  account boundary.

Keep Anthropic direct when you want the simplest local setup with the fewest
moving parts.

#### How this works in practice

The workbench server still calls the Anthropic Messages API contract expected
by the current Phase A orchestrator. In a Bedrock deployment, you place a small
gateway in front of Bedrock that:

1. Accepts Anthropic-compatible requests from the workbench.
2. Authenticates and signs outbound Bedrock calls with AWS credentials.
3. Maps Bedrock responses back into Anthropic-compatible response shapes.

Because this translation happens at the gateway edge, the workbench app and
agent loop do not need Bedrock-specific code paths.

#### Example use case

Your team runs internal synthetic-data demos in an AWS sandbox account and
already has a platform gateway that standardizes model access. The workbench
uses that gateway endpoint so demo traffic follows existing AWS guardrails and
logging pipelines.

#### Example `.env` values (gateway pattern)

```bash
# Anthropic-compatible gateway endpoint (backed by Bedrock internally)
WORKBENCH_AGENT_BASE_URL=https://llm-gateway.internal.example.com/anthropic

# Gateway-issued key/token (not an Anthropic key in this pattern)
WORKBENCH_AGENT_API_KEY=demo_gateway_token

# Optional model override used by the workbench agent
WORKBENCH_AGENT_MODEL=claude-sonnet-4-6
```

## Scripts

| Script | What it does |
| --- | --- |
| `dev` | Vite dev server on port 5174 |
| `server` | Hono API on port 5175 (watch mode via tsx) |
| `server:start` | Hono API on port 5175 (one-shot) |
| `build` | Typecheck (frontend + node) and produce a production bundle |
| `test` / `test:run` | Vitest |
| `typecheck` | tsc on both `tsconfig.json` and `tsconfig.node.json` |
| `db:setup` | Open `workbench.sqlite` and apply migrations under `db/migrations/` |
| `db:generate` | Re-generate Drizzle migrations from `db/schema.ts` |
| `eval` | Run the offline Phase A eval harness; writes `eval-report.json` |

## Iterating quickly

Most iteration should stay off CI. The local loop is already fast:

- **Two terminals.** `server` (tsx watches and restarts on save) plus `dev`
  (Vite HMR). Vite proxies `/api` so edits on either side land sub-second.
- **Vitest in watch mode.** `pnpm --filter @fhir-place/workbench test` (no
  `:run`) re-runs on save.
- **Throwaway DB per experiment.** Point `WORKBENCH_DB_URL` at a tmp file,
  then `db:setup`, so you can blow away state without fighting migrations:
  ```bash
  WORKBENCH_DB_URL=/tmp/wb-$(date +%s).sqlite pnpm --filter @fhir-place/workbench db:setup
  ```
- **Don't burn Anthropic calls while iterating UI.** Drive
  `AgentAnswerRenderer` from `src/agent/fixtures.ts` on
  `AnswerPreviewPage`. Only hit the live agent when validating the loop
  itself.
- **For agent-loop tweaks**, write a vitest with the Anthropic SDK stubbed
  to return canned `tool_use` blocks ending in `finalize`. Faster than
  clicking through the UI.
- **Iterating the preview workflow.** Don't push-and-wait. Trigger
  `workbench-preview.yml` manually via `workflow_dispatch` (Actions tab →
  "Run workflow" on the branch), or run it locally with
  [`act`](https://github.com/nektos/act):
  ```bash
  act -W .github/workflows/workbench-preview.yml workflow_dispatch
  ```
- **Pre-push gate.** `pnpm --filter @fhir-place/workbench typecheck &&
  pnpm --filter @fhir-place/workbench test:run && pnpm --filter
  @fhir-place/workbench build` mirrors `ci.yml` and catches the 95% case
  before the round-trip.

## Layout

```
apps/workbench/
├── src/                 # Vite frontend (React)
│   ├── api/             # fetch-based API client
│   ├── components/      # presentational components
│   ├── pages/           # route pages
│   ├── App.tsx
│   ├── main.tsx
│   └── config.ts
├── server/              # Node-only: Hono API
│   ├── routes/          # /api/* handlers
│   ├── services/        # store + FHIR probe
│   ├── schemas.ts       # Zod input schemas (Phase A allow-list)
│   ├── app.ts
│   └── index.ts         # boots the server on WORKBENCH_PORT
├── db/                  # Node-only: SQLite + Drizzle schema and client
│   ├── schema.ts
│   ├── client.ts
│   └── migrations/      # checked-in SQL migrations
├── scripts/             # Node-only CLI scripts (db:setup, etc.)
├── tsconfig.json        # frontend tsconfig (vite/client types)
└── tsconfig.node.json   # node-only tsconfig (db, scripts, server, vite config)
```

The `db/`, `server/`, and `scripts/` folders are deliberately node-only; the
Vite frontend must not import them. The two-tsconfig split enforces that
boundary.

## Phase A non-goals

This project does **not** implement, and will not implement during Phase A:

- SMART on FHIR auth
- Real PHI handling
- HIPAA compliance claims
- Write-back / mutation against the FHIR server
- CQL execution or `$evaluate-measure`
- DocumentReference text extraction
- Arbitrary FHIR query generation by the agent
- Arbitrary code execution by the agent

See [`docs/limitations.md`](docs/limitations.md).
