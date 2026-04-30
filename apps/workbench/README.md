# @fhir-place/workbench

A research workbench for evidence-backed agent answers grounded in **synthetic
FHIR data**. Phase A only.

> **Synthetic data only. Not for clinical use. Do not enter real patient
> information.** This is research / prototyping software. It does not implement
> SMART on FHIR auth, does not handle PHI, and is not a clinical decision
> support tool.

## Status — Phase A (PRs 1–6 shipped)

This package currently ships:

- A Vite + React + Tailwind UI shell with a synthetic-only banner on every page.
- A SQLite + Drizzle local-first database (`data_connection`, `agent_session`).
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

In flight: audit logging (PR 7, [#76]), eval harness (PR 8, [#77]), failure
gallery (PR 9, [#78]), and the remaining demo write-up bits (PR 10, [#79]).
See [`TASKS.md`](TASKS.md), [`docs/architecture.md`](docs/architecture.md),
[`docs/safety.md`](docs/safety.md), [`docs/limitations.md`](docs/limitations.md),
and the copy-pasteable [`docs/demo-script.md`](docs/demo-script.md).

[#76]: https://github.com/samsuffolksperoni/fhir-place/issues/76
[#77]: https://github.com/samsuffolksperoni/fhir-place/issues/77
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
