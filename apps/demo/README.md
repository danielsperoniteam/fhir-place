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
- **Resource list config** (`resourceListConfig.ts`) — see below
- **NLP query translation** (`ask/anthropicQuery.ts`) — calls the Anthropic API to turn a natural-language question into `{ resourceType, params }`.

## Resource list config (`resourceListConfig.ts`)

This file is the main place to touch when adding or customising how a resource type looks in the list/table view. It defines a `ResourceListConfig` per type and collects them all into `RESOURCE_LIST_CONFIG`.

### The `ResourceListConfig` interface

```ts
interface ResourceListConfig<T extends Resource = Resource> {
  title: string;              // page heading, e.g. "Patients"
  singular: string;           // used in "+ New {singular}" and empty-state copy
  priorityParams: string[];   // search params shown first in the filter form
  tableColumns: ResourceListColumn[];       // all columns the column-picker can offer
  defaultVisibleColumns: string[];          // subset shown before the user customises
  formatPrimary?: (resource: T) => string;  // main text in list-view rows (enables List layout)
  formatMeta?: (resource: T) => Array<string | undefined | null>; // secondary metadata in list rows
}
```

`formatPrimary` is optional. When omitted the resource type only renders in Table or JSON layout — the List toggle is disabled. Most resource types provide it; types like `Location` and `Medication` that don't have a natural "name" field still get one via `codeText()`.

`tableColumns` uses dot-notation paths (`"address.city"`, `"period.start"`). The special path `"__counts"` on Patient renders the `<PatientRowCounts>` component (compartment counts) rather than a raw field value.

### Configured resource types

All 20 types in `TOP_RESOURCE_TYPES` have explicit configs: Patient, AllergyIntolerance, Appointment, CarePlan, CareTeam, Condition, DiagnosticReport, DocumentReference, Encounter, Goal, Immunization, Location, Medication, MedicationRequest, Observation, Organization, Practitioner, Procedure, ServiceRequest, Task.

### Fallback for unconfigured types

Any resource type not in `RESOURCE_LIST_CONFIG` (e.g. a custom or less-common type) still works. `ResourceListPage` detects the missing config and falls back to:
1. Fetching the resource's `StructureDefinition` via `useStructureDefinition`.
2. Deriving columns from the `isSummary` elements in the SD snapshot (up to 8).
3. If the SD has no summary elements, defaulting to `["status", "code.text", "subject.reference", "id"]`.

This means the app handles any FHIR R4 resource type out of the box, with the configured types getting polished list-view presentation.

### Adding a new resource type

1. Add the type string to `TOP_RESOURCE_TYPES` in `resourceListConfig.ts`.
2. Define a `ResourceListConfig<YourType>` constant with the fields above.
3. Add it to the `RESOURCE_LIST_CONFIG` record.
4. Optionally add compartment entries in `compartment.ts` if the type should appear as a patient compartment chip.

### `patientFields.ts`

A separate utility that builds `PatientFieldOption[]` from a live `StructureDefinition`. Used by the Patient column picker to offer every top-level Patient field (including choice-type variants like `deceasedBoolean` / `deceasedDateTime`) with human-readable labels derived from the SD's `short` descriptions. Not part of `resourceListConfig.ts` because it depends on a runtime SD fetch rather than being statically declared.

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
