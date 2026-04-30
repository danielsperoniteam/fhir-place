# fhir-place

This repo holds two related projects:

- **`@fhir-place/react-fhir`** (this README) — a spec-driven React component
  library for FHIR. Published on npm; consumed by the demo and the workbench.
- **`@fhir-place/workbench`** — a research workbench for evidence-backed agent
  answers over **synthetic** FHIR data. Phase A only, not for clinical use.
  See [`apps/workbench/README.md`](apps/workbench/README.md) and the Phase A
  board in [`apps/workbench/TASKS.md`](apps/workbench/TASKS.md). Coding-agent
  rules: [`AGENTS.md`](AGENTS.md).

The rest of this README is about the library.

---

A React component library for building FHIR resource viewers and editors driven by the FHIR specification itself (`StructureDefinition`, `SearchParameter`, `CapabilityStatement`). Minimal resource-specific code — everything derives from the spec's own metadata, so the library works natively against any FHIR REST API.

**Live demo:** <https://samsuffolksperoni.github.io/fhir-place/> — hits the **public HAPI R4 server**. Patient data there is shared and reset periodically; creates / edits you make are visible to everyone (and won't last forever). Local `pnpm dev` uses an in-browser MSW mock by default so you can work offline.

## Status

Early alpha. R4 first. MIT licensed. Safe to depend on for prototypes and side projects; expect breaking changes before 1.0.

- **94 unit tests** (Vitest + MSW + jsdom)
- **Playwright e2e + screenshots** (patient list, detail, mobile, create / edit / delete, search)
- **Nightly live-HAPI integration suite** covers full CRUD, reference resolution, CapabilityStatement + StructureDefinition walks

## Packages

| Path | What it is |
| --- | --- |
| `packages/react-fhir` | the component library (client, hooks, generic renderers, spec-driven view/edit/search) |
| `apps/demo` | a development/demo app for the library — ships with MSW in-browser mock FHIR so it runs offline |
| `apps/workbench` | research workbench for evidence-backed agent answers over synthetic FHIR data (separate project — see [`apps/workbench/README.md`](apps/workbench/README.md)) |

## Install (in your app)

```bash
pnpm add @fhir-place/react-fhir @tanstack/react-query react react-dom
```

Published on npm as of 0.1.0. Pre-1.0, expect minor-version bumps to include breaking changes — check the changelog before upgrading. Versioning is managed via [changesets](https://github.com/changesets/changesets); see [CONTRIBUTING](CONTRIBUTING.md) for how to ship a PR with a changeset.

## Quick start

```tsx
import {
  FetchFhirClient,
  FhirClientProvider,
  ResourceView,
  ResourceEditor,
  ResourceSearch,
  useSearch,
  useResource,
  useCreateResource,
} from "@fhir-place/react-fhir";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();
const fhir = new FetchFhirClient({
  baseUrl: "https://hapi.fhir.org/baseR4",
  // Optional: bearer token, per-request or static
  // getHeaders: async () => ({ Authorization: `Bearer ${await getToken()}` }),
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FhirClientProvider client={fhir}>
        <YourPages />
      </FhirClientProvider>
    </QueryClientProvider>
  );
}
```

### Read a resource

```tsx
function PatientDetail({ id }: { id: string }) {
  const { data: patient } = useResource<Patient>("Patient", id);
  if (!patient) return null;
  return <ResourceView resource={patient} />;
}
```

### Edit / create

```tsx
function PatientEditor({ initial }: { initial: Patient }) {
  const update = useUpdateResource<Patient>();
  return (
    <ResourceEditor
      resource={initial}
      saving={update.isPending}
      onSave={(draft) => update.mutateAsync(draft as Patient & { id: string })}
    />
  );
}
```

### Search

```tsx
function Patients() {
  const [params, setParams] = useState<SearchParams>({ _count: 20 });
  const { data } = useSearch<Patient>("Patient", params);
  return (
    <>
      <ResourceSearch
        resourceType="Patient"
        priorityParams={["name", "family", "gender", "birthdate"]}
        onSubmit={setParams}
      />
      <ul>
        {data?.entry?.map((e) => (
          <li key={e.resource!.id}>{e.resource!.name?.[0]?.family}</li>
        ))}
      </ul>
    </>
  );
}
```

## What's in the library

### `client/`
- **`FhirClient` interface** — `read`, `vread`, `history`, `search`, `create`, `update`, `patch` (JSON Patch), `delete`, `readReference` (relative + absolute), generic `request()` escape hatch
- **`FetchFhirClient`** — the only shipped implementation. Supports `If-Match` / `If-None-Match` / `If-None-Exist`, static + dynamic headers, `AbortSignal`, custom `fetch`
- **`FhirError`** — carries status, URL, and `OperationOutcome` from the server when available

### `hooks/`
- **`FhirClientProvider` / `useFhirClient`** — context
- **`useResource`, `useSearch`, `useCapabilities`, `useStructureDefinition`, `useSearchParameter`, `useValueSet`, `useReadReference`** — TanStack Query wrappers with stable query keys (`fhirQueryKeys`). `useSearchParameter` resolves a `(base, code)` pair to its canonical `SearchParameter` resource so spec-aware code can prefer `expression` over the kebab→camel naming convention.
- **`useCreateResource`, `useUpdateResource`, `useDeleteResource`** — mutations that invalidate matching read queries on success

### `structure/`
- **`walkResource` / `walkObject`** — iterate a StructureDefinition snapshot, yield present elements in canonical order, resolve `[x]` choice types
- **`directChildren`, `findElement`** — querying SDs
- **`pathGet` / `pathSet` / `pathRemove` / `prune`** — immutable helpers used by the editor

### `components/`
- **`<ResourceView>`** — spec-driven read-only view. Dispatches by FHIR datatype; falls back to JSON for unknowns. Recurses into BackboneElements. Zero resource-specific code.
- **`<ResourceEditor>`** — spec-driven form. Inputs for every R4 primitive + HumanName, Address, ContactPoint, Identifier, Reference, Period, Quantity, Coding, CodeableConcept. BackboneElement recursion. Arrays with add/remove; choice-type switching clears the other variant. `onChange` on every keystroke; `onSave` receives a pruned draft.
- **`<ResourceSearch>`** — form driven by `CapabilityStatement.rest[].resource[].searchParam`. Type-aware placeholders (token, date, reference, number, quantity, uri). Priority params + "show more" toggle.
- **`<ResourceTable>`** — generic list/table renderer driven by the StructureDefinition; FHIR-datatype-aware cell formatting (HumanName, CodeableConcept, Reference, …) using the same renderer map as `<ResourceView>`. Supports controlled sort, row clicks, custom per-column renderers.
- **`<ColumnPicker>`** — companion popover to `<ResourceTable>`: toggle column visibility with checkboxes, persist user choice to `localStorage` via `storageKey`. Keyboard-accessible (Esc closes, ArrowUp/Down navigate).
- **`<Narrative>`** — the *only* place `dangerouslySetInnerHTML` is allowed. DOMPurify with a FHIR-appropriate allowlist: no `<script>`, no `on*`, no `javascript:`, no forms or inputs.
- **`defaultTypeRenderers` / `defaultTypeInputs`** — the dispatch maps. Every built-in renderer/input is overridable by passing `renderers` / `inputs` props.

## Design principles

- **Spec-driven.** UI derives from StructureDefinition / SearchParameter, not hand-written per resource type.
- **Server-agnostic.** Plain FHIR REST via a `FhirClient` interface; no vendor SDK lock-in. The demo works against the public HAPI server, a docker-compose HAPI, or (via MSW) no server at all.
- **Safe by default.** Narrative sanitised with DOMPurify; a lint rule keeps `dangerouslySetInnerHTML` out of every other file.
- **Escape hatches everywhere.** Pass `renderers` / `inputs` to override any datatype. Use `client.request()` for custom operations. Subclass `FetchFhirClient` for custom auth.
- **Tree-shakeable, typed.** ESM + `.d.ts`; subpath exports `@fhir-place/react-fhir/client`, `/hooks`, `/structure`, `/components`.

## Dev

```bash
pnpm install
pnpm dev                                          # demo app + in-browser MSW mock FHIR (Vite on :5173)
pnpm test                                         # unit tests (jsdom + MSW)
pnpm -r typecheck                                 # all packages
pnpm --filter @fhir-place/demo e2e                # Playwright incl. screenshots (screenshots/)
pnpm --filter @fhir-place/react-fhir test:integration    # live-server integration, defaults to https://hapi.fhir.org/baseR4
```

The demo defaults to MSW in dev. To point it at a real server:

```bash
# public HAPI
VITE_USE_MOCK=false VITE_FHIR_BASE_URL=https://hapi.fhir.org/baseR4 pnpm dev

# local docker HAPI (starts a R4 server on :8080 with persistent data)
docker compose up -d
VITE_USE_MOCK=false VITE_FHIR_BASE_URL=http://localhost:8080/fhir pnpm dev
```

### CI layout

- **`.github/workflows/ci.yml`** — typecheck + unit tests + library/demo build on every PR
- **`.github/workflows/pages.yml`** — builds the demo (mock mode) and deploys to GitHub Pages on push to `main`
- **`.github/workflows/integration.yml`** — runs the live-HAPI suite nightly at 05:00 UTC, on push to `main`, and via manual dispatch. PRs skip it so HAPI flakiness can't block unrelated work.

## Building your own FHIR app on this library

The components are a toolbox, not a framework. Typical pattern for a new app:

1. **Wire a `FhirClient`** — point at your server, plug in auth via `headers` or `getHeaders`.
2. **Hook a Resource list page** — call `useSearch<YourType>(...)` directly and render the results however you want. `<ResourceSearch>` gives you a driven filter form.
3. **Hook a detail page** — `<ResourceView resource={...} />`.
4. **Hook create/edit** — `<ResourceEditor resource={...} onSave={...} />`.
5. **Override per-type UX** where needed — pass `renderers` or `inputs` to swap in app-specific widgets (e.g. a signature pad for `Signature`, a chart for repeated `Observation.valueQuantity`).
6. **Resource-specific workflow** — put business logic (e.g. Task state transitions, Goal progress calculations) in your own hooks alongside the library's generic hooks.

## Roadmap

Honest list of what's missing if you're building a real app today.

### Tracked (has an issue)

Comment / upvote if one of these is blocking you — or pick one up; each issue has a concrete API sketch and acceptance criteria.

| # | Item | Why it matters |
| --- | --- | --- |
| [#4](https://github.com/samsuffolksperoni/fhir-place/issues/4) | ValueSet resolution + binding-aware code input | Every real `code` field (`Task.status`, `Goal.lifecycleStatus`, `Observation.status`) today falls back to a plain text input. |
| [#5](https://github.com/samsuffolksperoni/fhir-place/issues/5) | `<ReferencePicker>` search-and-pick widget | Linking a Task to a Goal today means typing `Goal/abc123` into a raw text field. |
| [#6](https://github.com/samsuffolksperoni/fhir-place/issues/6) | Generic `<ResourceTable>` with column picker | We ship `<ResourceView>` (detail) and `<ResourceSearch>` (filter form) but no list/table component. |
| [#7](https://github.com/samsuffolksperoni/fhir-place/issues/7) | Pagination via `Bundle.link[rel=next]` in `useSearch` | `useSearch` returns one Bundle; browsing more than `_count` matches needs `useInfiniteSearch`. |
| [#11](https://github.com/samsuffolksperoni/fhir-place/issues/11) | Auto-populate `<ResourceSearch>` token fields from their ValueSet binding | Search by `gender` should be a dropdown of `male / female / other / unknown`, not a free-text field. Builds on #4. |

### Deferred (open an issue if you need it)

These will become issues once a concrete use case surfaces — premature issues rot.

- **Extensions.** `<ResourceEditor>` skips `extension` / `modifierExtension` by default. Many real profiles lean on them.
- **Profile support.** `useStructureDefinition` fetches base types; taking a profile canonical URL is a small change we haven't made.
- **SMART on FHIR v2 auth.** Deferred. Bearer-token auth works via `FhirClient.getHeaders`; launch flows need a dedicated adapter.
- **R4B / R5.** R4 only for v1. The `FhirClient` interface will grow a `fhirVersion` discriminator for version-specific code.
- **Subscriptions / realtime.** Out of scope; poll with TanStack Query's `refetchInterval` for now.

PRs welcome on any tracked item. For a deferred item: open an issue describing your use case and we can prioritise.

## License

MIT — see [`LICENSE`](LICENSE).
