# fhir-place

This repo is two things:

- **[`@fhir-place/react-fhir`](packages/react-fhir/README.md)** — a spec-driven React library for FHIR, published on npm. Backend-agnostic; UI derives from `StructureDefinition`, `SearchParameter`, and `CapabilityStatement` so it works against any FHIR REST API.
- **[fhir-ui](apps/demo/README.md)** — a FHIR browser and editor built on react-fhir. Browse, search, create, edit, and delete FHIR resources across a tab-based shell with NLP search, CQL runner, dark mode, and a configurable server target.

**Live demo:** <https://danielsperoniteam.github.io/fhir-place/> — hits the public HAPI R4 server. Patient data is shared and reset periodically.

> Not affiliated with Zus Health's FHIRplace, Drummond's FHIRplace Pilot, or any other product using a similar name.

## Packages

| Path | What it is |
| --- | --- |
| [`packages/react-fhir`](packages/react-fhir/README.md) | npm library — typed FHIR client, TanStack Query hooks, StructureDefinition walkers, spec-driven React components |
| [`apps/demo`](apps/demo/README.md) | fhir-ui — the full browser/editor app built on react-fhir |
| [`apps/goals-tasks`](apps/goals-tasks/README.md) | minimal sample app showing a Goal + Task workflow built on react-fhir |

## Status

Early alpha. R4 first. MIT licensed. Safe to depend on for prototypes and side projects; expect breaking changes before 1.0.

- **94 unit tests** (Vitest + MSW + jsdom)
- **Playwright e2e + screenshots** across patient list, detail, mobile, CRUD, search
- **Nightly live-HAPI integration suite** covers full CRUD, reference resolution, CapabilityStatement + StructureDefinition walks

CI: typecheck + unit tests + build on every PR. Pages deploy on push to `main`. Integration suite runs nightly.

## Running locally

Requires **Node.js ≥ 20** and **pnpm** (`npm i -g pnpm`).

```bash
pnpm install
pnpm dev          # fhir-ui with in-browser MSW mock FHIR (Vite on :5173)
pnpm test         # unit tests (Vitest)
pnpm -r typecheck
pnpm --filter @fhir-place/demo e2e                       # Playwright e2e + screenshots
pnpm --filter @fhir-place/react-fhir test:integration    # live-HAPI integration suite
```

The app defaults to an in-browser MSW mock so it runs offline. To point at a real server:

```bash
# public HAPI
VITE_USE_MOCK=false VITE_FHIR_BASE_URL=https://hapi.fhir.org/baseR4 pnpm dev

# local Docker HAPI (persistent, R4, port 8080)
docker compose up -d
VITE_USE_MOCK=false VITE_FHIR_BASE_URL=http://localhost:8080/fhir pnpm dev
```

### Goal/Task deployable starter

[`apps/goals-tasks`](apps/goals-tasks/README.md) is a minimal but deployable sample for a Goal + Task workflow. It shows how to use the library primitives together for a real clinical use case:

- Search and list a patient's goals with `useSearch` + `<ResourceSearch>`
- Render goal and task details with `<ResourceView>`
- Create and update goals and tasks with `<ResourceEditor>` plus `useCreateResource` / `useUpdateResource`
- Persist state transitions through your FHIR server (`Task.status`, `Goal.lifecycleStatus`) using the generic mutation hooks

See [`apps/goals-tasks/README.md`](apps/goals-tasks/README.md) for the full breakdown and how to run it.

## Documentation

| Doc | What it covers |
| --- | --- |
| [`packages/react-fhir/README.md`](packages/react-fhir/README.md) | Install, quick start, full API reference, design principles, comparison with other libraries, roadmap |
| [`apps/demo/README.md`](apps/demo/README.md) | fhir-ui features, app structure, how it uses react-fhir, how to run |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | PR workflow, testing, changesets, bump conventions |
| [`docs/decisions/`](docs/decisions/) | Architecture Decision Records |
| [Open issues](https://github.com/danielsperoniteam/fhir-place/issues) | Tracked gaps and roadmap items |

## License

MIT — see [`LICENSE`](LICENSE).
