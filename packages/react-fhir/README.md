# @fhir-place/react-fhir

Spec-driven React components, hooks, and a typed REST client for FHIR (R4),
built on the plain FHIR REST API. UI derives from `StructureDefinition`,
`SearchParameter`, and `CapabilityStatement` — no vendor SDK, no
resource-specific UI code.

> Pre-1.0. Safe for prototypes; expect breaking changes before 1.0.

## Install

```bash
pnpm add @fhir-place/react-fhir @tanstack/react-query react react-dom
```

Peer dependencies:

| Peer | Range |
| --- | --- |
| `react` | `^18.0.0 \|\| ^19.0.0` |
| `react-dom` | `^18.0.0 \|\| ^19.0.0` |
| `@tanstack/react-query` | `^5.0.0` |

## Quick start

Wrap your app in `QueryClientProvider` and `FhirClientProvider`. Every hook
reads the active client from context and runs through TanStack Query, so cache
invalidation, suspense, and devtools all work out of the box.

```tsx
import { FetchFhirClient, FhirClientProvider } from "@fhir-place/react-fhir";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();
const fhir = new FetchFhirClient({
  baseUrl: "https://hapi.fhir.org/baseR4",
  // Optional auth — runs per request, so tokens refresh transparently.
  // getHeaders: async () => ({ Authorization: `Bearer ${await getToken()}` }),
});

export function App({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <FhirClientProvider client={fhir}>{children}</FhirClientProvider>
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

```ts
import { FetchFhirClient } from "@fhir-place/react-fhir/client";

const fhir = new FetchFhirClient({ baseUrl: "https://hapi.fhir.org/baseR4" });
const patient = await fhir.read("Patient", "example");
const bundle = await fhir.search("Patient", { name: "smith", _count: 20 });
```

### `hooks/`

- **`FhirClientProvider` / `useFhirClient`** — context
- **`useResource`, `useSearch`, `useInfiniteSearch`, `useCapabilities`, `useStructureDefinition`, `useSearchParameter`, `useValueSet`, `useReadReference`** — TanStack Query wrappers with stable query keys (`fhirQueryKeys`). `useSearchParameter` resolves a `(base, code)` pair to its canonical `SearchParameter` resource so spec-aware code can prefer `expression` over the kebab→camel naming convention.
- **`useCreateResource`, `useUpdateResource`, `useDeleteResource`** — mutations that invalidate matching read queries on success

```tsx
import { useResource, useSearch, useUpdateResource } from "@fhir-place/react-fhir/hooks";
import type { Patient } from "fhir/r4";

function PatientCard({ id }: { id: string }) {
  const { data, isLoading } = useResource<Patient>("Patient", id);
  if (isLoading) return <p>Loading…</p>;
  return <h1>{data?.name?.[0]?.family}</h1>;
}
```

### `structure/`

- **`walkResource` / `walkObject`** — iterate a StructureDefinition snapshot, yield present elements in canonical order, resolve `[x]` choice types
- **`directChildren`, `findElement`** — querying SDs
- **`pathGet` / `pathSet` / `pathRemove` / `prune`** — immutable path helpers used by the editor

```ts
import { walkResource, findElement, pathGet } from "@fhir-place/react-fhir/structure";

const value = pathGet(patient, "name.0.family");
for (const node of walkResource(patient, structureDef)) {
  // canonical-order traversal of present elements
}
```

### `components/`

- **`<ResourceView>`** — spec-driven read-only view. Dispatches by FHIR datatype; falls back to JSON for unknowns. Recurses into BackboneElements. Zero resource-specific code.
- **`<ResourceEditor>`** — spec-driven form. Inputs for every R4 primitive + HumanName, Address, ContactPoint, Identifier, Reference, Period, Quantity, Coding, CodeableConcept. BackboneElement recursion. Arrays with add/remove; choice-type switching clears the other variant. `onChange` on every keystroke; `onSave` receives a pruned draft.
- **`<ResourceSearch>`** — form driven by `CapabilityStatement.rest[].resource[].searchParam`. Type-aware placeholders (token, date, reference, number, quantity, uri). Priority params + "show more" toggle. Optional NLP search via `onAskAI` prop.
- **`<ResourceTable>`** — generic list/table renderer driven by the StructureDefinition; FHIR-datatype-aware cell formatting (HumanName, CodeableConcept, Reference, …) using the same renderer map as `<ResourceView>`. Supports controlled sort, row clicks, custom per-column renderers.
- **`<ColumnPicker>`** — companion popover to `<ResourceTable>`: toggle column visibility with checkboxes, persist user choice to `localStorage` via `storageKey`. Keyboard-accessible.
- **`<SortPicker>`** — popover to choose the `_sort` search parameter, driven by the resource's search params.
- **`<ReferencePicker>`** — debounced search-and-pick widget for FHIR `Reference` fields. Accepts `targets` (allowed resource types), searches the server live as the user types, and returns a typed `Reference`. Replaces the raw `Type/id` text field that `<ResourceEditor>` generates for Reference elements by default. Also exports `<ReferencePickerFallback>` for when the search fails.
- **`<Narrative>`** — the *only* place `dangerouslySetInnerHTML` is used. DOMPurify with a FHIR-appropriate allowlist: no `<script>`, no `on*`, no `javascript:`, no forms or inputs.
- **`defaultTypeRenderers` / `defaultTypeInputs`** — the dispatch maps. Every built-in renderer/input is overridable by passing `renderers` / `inputs` props.

```tsx
import { ResourceView, ResourceEditor, ResourceSearch } from "@fhir-place/react-fhir/components";

<ResourceView resource={patient} />;
<ResourceEditor resource={patient} onSave={(draft) => fhir.update(draft)} />;
<ResourceSearch resourceType="Patient" onSelect={(p) => navigate(`/Patient/${p.id}`)} />;
```

## Subpath exports

The package ships four stable subpath entry points alongside the root export.

| Import | Use it for |
| --- | --- |
| `@fhir-place/react-fhir` | Convenience root — re-exports all four layers. |
| `@fhir-place/react-fhir/client` | `FhirClient`, `FetchFhirClient`, `FhirError`, `SearchParams`. No React. |
| `@fhir-place/react-fhir/hooks` | `FhirClientProvider`, `useFhirClient`, query / mutation hooks, `fhirQueryKeys`. Requires `@tanstack/react-query`. |
| `@fhir-place/react-fhir/structure` | StructureDefinition / SearchParameter walkers, path helpers, value-set / binding utilities. No React, no network. |
| `@fhir-place/react-fhir/components` | `ResourceView`, `ResourceEditor`, `ResourceSearch`, `ResourceTable`, `Narrative`, datatype renderers + inputs. |

**API stability:** The root export and the four subpath exports are the public API and follow semver. Anything accessed via a deeper relative path is internal and can change between minor releases. Pre-1.0, minor-version bumps may include breaking changes — check the [changelog](./CHANGELOG.md) before upgrading.

## Architecture: layer boundaries

The library has four layers. Imports flow downward only — a higher layer may depend on layers below it, never the reverse.

```
components/   ← UI (React, JSX, datatype dispatch)
   ↓
hooks/        ← TanStack Query wrappers around the client (React, no JSX)
   ↓
structure/    ← StructureDefinition introspection (no React, no network)
   ↓
client/       ← Typed FHIR REST transport (no React)
```

- `client/` talks to a FHIR server. No React or DOM dependencies — safe to use from Node tooling.
- `structure/` understands the FHIR metamodel: walking SDs, resolving paths, formatting values, expanding ValueSets. Pure functions, no I/O.
- `hooks/` glues `client/` to TanStack Query and exposes the cache via stable query keys.
- `components/` renders / edits resources by dispatching on FHIR datatype.

When contributing, prefer adding to the lowest layer that can host the behaviour. A new search-param helper belongs in `client/`; a new datatype formatter belongs in `structure/`; a new query hook belongs in `hooks/`; a new input or renderer belongs in `components/`.

## Design principles

- **Spec-driven.** UI derives from `StructureDefinition` / `SearchParameter` / `CapabilityStatement`, not hand-written per resource type. If you find yourself writing resource-specific logic in the library, push it to the consumer app or make it a generic primitive.
- **Server-agnostic.** Plain FHIR REST via a `FhirClient` interface; no vendor SDK in the critical path. The demo works against public HAPI, docker-compose HAPI, or via MSW with no server at all. Every feature flows through the `FhirClient` interface — no direct `fetch` outside `FetchFhirClient`.
- **Headless.** No Mantine / Bootstrap / Material lock-in. Tailwind + unstyled primitives.
- **Safe by default.** Narrative sanitised with DOMPurify; only `<Narrative>` gets to render HTML. Every other component uses React's default escaping.
- **Escape hatches everywhere.** Pass `renderers` / `inputs` to override any datatype. Use `client.request()` for custom operations. Subclass `FetchFhirClient` for custom auth.

See [`docs/decisions/0004-positioning.md`](../../docs/decisions/0004-positioning.md) for the positioning rationale and the "tRPC-of-FHIR" wedge.

## Building your own FHIR app

The components are a toolbox, not a framework. Typical pattern for a new app:

1. **Wire a `FhirClient`** — point at your server, plug in auth via `getHeaders`.
2. **Resource list** — call `useSearch<YourType>(...)` or `useInfiniteSearch(...)` and render with `<ResourceSearch>` for the filter form and `<ResourceTable>` for results.
3. **Detail page** — `<ResourceView resource={...} />`.
4. **Create / edit** — `<ResourceEditor resource={...} onSave={...} />`.
5. **Override per-type UX** where needed — pass `renderers` or `inputs` to swap in app-specific widgets (e.g. a chart for repeated `Observation.valueQuantity`).
6. **Resource-specific workflow** — put business logic (e.g. Task state transitions, Goal progress) in your own hooks alongside the library's generic ones.

See [`apps/demo`](../../apps/demo/README.md) for a full working example of this pattern.

## Comparison with other React-FHIR libraries

| Library | Backend | UI lock-in | Spec-driven | LLM/MCP story |
| --- | --- | --- | --- | --- |
| **`@fhir-place/react-fhir`** | Any FHIR REST | None — Tailwind + unstyled | Yes (StructureDefinition + SearchParameter + CapabilityStatement) | Roadmap (Zod-from-SD, optional MCP package) |
| `@medplum/react` | Best with Medplum (some components require Medplum-specific extensions) | Mantine v7 required | Partial | Server-side only |
| `@bonfhir/react` + `@bonfhir/mantine` | Any | Mantine renderers | Yes (codegen for R4B / R5) | None |
| `@beda.software/fhir-react` | Any (Aidbox-leaning) | None — hooks only | Hook-level | None |
| `1uphealth/fhir-react` | Display-only, no client | Bootstrap | No | None |

Where this library loses today: fewer batteries-included components than `@medplum/react`, no Mantine renderer parity with `@bonfhir/mantine`, no SMART App Launch adapter shipped, no profile-aware codegen yet.

## Roadmap / known gaps

Tracked items (comment / upvote on the issue, or pick one up — each has a concrete API sketch and acceptance criteria):

| # | Item |
| --- | --- |
| [#4](https://github.com/samsuffolksperoni/fhir-place/issues/4) | ValueSet resolution + binding-aware code input |
| [#121](https://github.com/samsuffolksperoni/fhir-place/issues/121) | Typed search builder v0 — core API |
| [#123](https://github.com/samsuffolksperoni/fhir-place/issues/123) | Profile-aware codegen spike (US Core 7 seed) |
| [#124](https://github.com/samsuffolksperoni/fhir-place/issues/124) | Experimental Zod schema generation from `StructureDefinition` |
| [#125](https://github.com/samsuffolksperoni/fhir-place/issues/125) | Interop demo matrix (HAPI + Medplum + Aidbox) |
| [#127](https://github.com/samsuffolksperoni/fhir-place/issues/127) | Inferno (g)(10) CI badge |
| [#128](https://github.com/samsuffolksperoni/fhir-place/issues/128) | Optional `@fhir-place/mcp` package |

See the [full issue list](https://github.com/samsuffolksperoni/fhir-place/issues) for the current state — issues are the source of truth and stay up to date as work lands.

Deferred (open an issue if you need it): Extensions in the editor, profile-URL support in `useStructureDefinition`, SMART on FHIR v2 auth, R4B / R5, Subscriptions / realtime.

## Testing

```bash
pnpm test          # watch mode (Vitest + MSW + jsdom)
pnpm test:run      # single run
pnpm test:ci       # single run with coverage + thresholds
```

Coverage thresholds are enforced in `vitest.config.ts`; `test:ci` is what CI runs to gate merges.

## License

MIT — see [LICENSE](https://github.com/samsuffolksperoni/fhir-place/blob/main/LICENSE).
