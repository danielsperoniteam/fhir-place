# fhir-ui (`apps/demo`)

fhir-ui is a full FHIR browser and editor built on [`@fhir-place/react-fhir`](../../packages/react-fhir/README.md). It ships as the live demo at <https://samsuffolksperoni.github.io/fhir-place/> and serves as the reference implementation of what you can build with react-fhir.

## What it does

### Browse and search any resource type

- Sidebar lists resource types (Patient, Observation, Condition, …); click to open a list page.
- Search form is driven by the server's `CapabilityStatement` — all search parameters for the resource type appear automatically.
- Results show in **List** (formatted primary + metadata rows), **Table** (column-picked, sortable), or **JSON** layouts. Toggle with the layout switcher.
- Infinite scroll / "Load more" via `useInfiniteSearch`.

### Create, view, and edit resources

- Detail page renders the resource with `<ResourceView>` — spec-driven, FHIR-datatype-aware, recurses into BackboneElements.
- Edit page uses `<ResourceEditor>` — a form generated from the resource's `StructureDefinition`. Supports every R4 primitive and composite type (HumanName, Address, Reference, CodeableConcept, etc.).
- Create page opens a blank `<ResourceEditor>` for any resource type.

### Patient compartment navigation

- Patient detail page surfaces compartment chips (Observations, Conditions, Encounters, …) with counts.
- Clicking a chip opens the compartment-scoped list page (`patient=<id>` filter applied automatically).

### NLP / Ask AI search

- "Ask AI" input in the search form accepts natural language ("patients born in 1980 named Smith") and translates it to FHIR search parameters via the Anthropic API.
- Requires an Anthropic API key, set in Settings. The key stays local (localStorage only).
- Standalone Ask page available via the sidebar.

### Goal / Task workflows (early)

Goal and Task resource types work through the generic fhir-ui pages — search, list, detail, create, and edit all work without any Goal/Task-specific code, because the app derives its UI from the `StructureDefinition`. There are no dedicated workflow pages (e.g. a goal-progress tracker or task state machine view) yet; those would live in `routes/fhir-ui/pages/` when the time comes.

### CQL runner

- Paste or write Clinical Quality Language (CQL) and evaluate it against resources fetched from the active FHIR server.
- Uses `cql-execution` + `cql-exec-fhir` for local evaluation.

### Developer-friendly shell features

- **Tab bar** — open multiple resource types / records simultaneously; tabs are URL-synced so they survive refresh.
- **Jump dialog** — `⌘K` / `Ctrl+K` to jump to any resource type or run NLP search directly.
- **Server picker** — switch between the MSW mock, public HAPI, and any custom base URL at runtime.
- **Dark mode** — full light/dark theme toggle.
- **HTTP request preview** — search card shows the exact FHIR URL before you submit.
- **Column picker** — choose which fields appear in table view; persisted per resource type to `localStorage`.
- **Sort picker** — choose `_sort` from the server's advertised search params.
- **Responsive** — cards layout on mobile; sidebar collapses.

## How it's built on react-fhir

fhir-ui is the consumer app in this monorepo. It imports `@fhir-place/react-fhir` as a workspace dependency and uses every layer:

| react-fhir layer | Used for |
| --- | --- |
| `client/` — `FetchFhirClient` | Wired in `main.tsx`; the active server URL comes from `ServerPicker` / env var |
| `hooks/` — `useInfiniteSearch`, `useResource`, `useStructureDefinition`, `useCreateResource`, `useUpdateResource`, `useDeleteResource` | All resource data fetching and mutations; TanStack Query handles caching |
| `structure/` | Column derivation in `ResourceListPage` (summary elements from SD snapshot); path helpers in the editor |
| `components/` — `ResourceSearch`, `ResourceTable`, `ColumnPicker`, `SortPicker`, `ResourceView`, `ResourceEditor` | Every list, detail, create, and edit page |

The app adds its own app-layer concerns on top:
- **Routing** (`react-router-dom`) — `/:resourceType`, `/:resourceType/:id`, `/:resourceType/:id/edit`, `/new`, `/ask`, `/settings`, `/cql-runner`
- **Tab context** (`TabsContext`) — open-tab list kept in React state, synced to the browser URL
- **Theme context** (`ThemeContext`) — CSS variable swap for dark/light mode
- **Resource list config** (`resourceListConfig.ts`) — per-type `formatPrimary` / `formatMeta` / `priorityParams` / `tableColumns` for the most common resource types (Patient, Observation, Condition, …). Unknown types fall back to StructureDefinition-derived columns automatically.
- **NLP query translation** (`ask/anthropicQuery.ts`) — calls the Anthropic API to turn a natural-language question into `{ resourceType, params }`.

## App structure

```
apps/demo/src/
├── App.tsx                    # shell layout: sidebar, topbar, tab bar, routes
├── main.tsx                   # React root, QueryClientProvider, FhirClientProvider
├── config.ts                  # env var reading, API key storage
├── resourceListConfig.ts      # per-type display config (columns, formatters, priority params)
├── patientFields.ts           # Patient-specific list formatters
├── compartment.ts             # Patient compartment resource types + counts
├── serverProbe.ts             # active server capability detection
│
├── components/                # app-shell UI components
│   ├── CCSidebar.tsx          # resource type sidebar
│   ├── CCTopbar.tsx           # server picker, dark mode, settings
│   ├── CCTabs.tsx             # tab bar
│   ├── FhirUiLayout.tsx       # (thin layout wrapper, mostly legacy)
│   ├── JumpDialog.tsx         # ⌘K jump/search dialog
│   ├── PatientCompartmentLinks.tsx
│   ├── PatientRowCounts.tsx   # inline compartment counts on patient list
│   ├── SearchRequestPreview.tsx
│   └── ServerPicker.tsx
│
├── context/
│   ├── TabsContext.tsx         # open tab list + URL sync
│   └── ThemeContext.tsx        # light/dark theme
│
├── routes/
│   ├── fhir-ui/pages/
│   │   ├── ResourceListPage.tsx    # list + search + table/list/json layouts
│   │   ├── ResourceDetailPage.tsx  # ResourceView + compartment links
│   │   ├── ResourceCreatePage.tsx  # blank ResourceEditor
│   │   ├── ResourceEditPage.tsx    # populated ResourceEditor
│   │   ├── AskPage.tsx             # standalone NLP search
│   │   └── SettingsPage.tsx        # API key, server URL
│   └── cql-runner/
│       ├── CqlRunnerPage.tsx
│       └── CqlRunner.tsx
│
├── ask/
│   └── anthropicQuery.ts      # NLP → FHIR params via Anthropic API
│
└── mocks/                     # MSW handlers (in-browser mock FHIR server)
```

## Running locally

```bash
# from repo root
pnpm install
pnpm dev           # starts Vite on :5173, MSW mock FHIR active by default
```

### Pointing at a real FHIR server

```bash
# public HAPI R4
VITE_USE_MOCK=false VITE_FHIR_BASE_URL=https://hapi.fhir.org/baseR4 pnpm dev

# local Docker HAPI (persistent, R4, port 8080)
docker compose up -d
VITE_USE_MOCK=false VITE_FHIR_BASE_URL=http://localhost:8080/fhir pnpm dev

# Medplum sandbox (example)
VITE_USE_MOCK=false VITE_FHIR_BASE_URL=https://api.medplum.com/fhir/R4 pnpm dev
```

Or use the **Server picker** in the app's top bar to switch servers at runtime without restarting.

### NLP search (Ask AI)

Open Settings in the app and paste an Anthropic API key. The key is stored in `localStorage` only — it never leaves the browser.

### Tests and e2e

```bash
pnpm --filter @fhir-place/demo test:run     # unit tests (Vitest)
pnpm --filter @fhir-place/demo e2e          # Playwright (screenshots land in screenshots/)
```
