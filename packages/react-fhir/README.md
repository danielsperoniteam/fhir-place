# @fhir-place/react-fhir

Spec-driven React components, hooks, and a typed REST client for FHIR (R4),
built on the plain FHIR REST API. UI derives from `StructureDefinition`,
`SearchParameter`, and `CapabilityStatement` — no vendor SDK, no
resource-specific UI code.

> Pre-1.0. Safe for prototypes; expect breaking changes before 1.0. The
> canonical project docs (design principles, screenshots, demo, roadmap) live
> in the [repo README](https://github.com/samsuffolksperoni/fhir-place#readme).

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

## Minimal setup

Wrap your app in `QueryClientProvider` and `FhirClientProvider`. Every hook in
this package reads the active client from context and runs through TanStack
Query, so cache invalidation, suspense, and devtools all work out of the box.

```tsx
import { FetchFhirClient, FhirClientProvider } from "@fhir-place/react-fhir";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();
const fhir = new FetchFhirClient({
  baseUrl: "https://hapi.fhir.org/baseR4",
  // Optional auth — runs per request, so tokens can refresh transparently.
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

## Examples

### `client/` — typed FHIR REST client

```ts
import { FetchFhirClient } from "@fhir-place/react-fhir/client";

const fhir = new FetchFhirClient({ baseUrl: "https://hapi.fhir.org/baseR4" });
const patient = await fhir.read("Patient", "example");
const bundle = await fhir.search("Patient", { name: "smith", _count: 20 });
```

`FetchFhirClient` supports `If-Match` / `If-None-Match` / `If-None-Exist`,
static + dynamic headers, `AbortSignal`, JSON Patch, and custom `fetch`. Errors
throw `FhirError` carrying status + the server's `OperationOutcome`.

### `hooks/` — TanStack Query wrappers

```tsx
import { useResource, useSearch, useUpdateResource } from "@fhir-place/react-fhir/hooks";
import type { Patient } from "fhir/r4";

function PatientCard({ id }: { id: string }) {
  const { data, isLoading } = useResource<Patient>("Patient", id);
  if (isLoading) return <p>Loading…</p>;
  return <h1>{data?.name?.[0]?.family}</h1>;
}
```

Mutations (`useCreateResource`, `useUpdateResource`, `useDeleteResource`)
invalidate matching read queries on success. Stable query keys are exported as
`fhirQueryKeys` so callers can target them with `invalidate` / `refetch`.

### `components/` — spec-driven UI

```tsx
import { ResourceView, ResourceEditor, ResourceSearch } from "@fhir-place/react-fhir/components";

<ResourceView resource={patient} />;
<ResourceEditor resource={patient} onSave={(draft) => fhir.update(draft)} />;
<ResourceSearch resourceType="Patient" onSelect={(p) => …} />;
```

Renderers and inputs are driven by the FHIR datatype dispatch maps
(`defaultTypeRenderers`, `defaultTypeInputs`). Override per-datatype by passing
`renderers` / `inputs` props — no fork required.

### `structure/` — StructureDefinition introspection

```ts
import { walkResource, findElement, pathGet } from "@fhir-place/react-fhir/structure";

const value = pathGet(patient, "name.0.family");
for (const node of walkResource(patient, structureDef)) {
  // canonical-order traversal of present elements
}
```

## Subpath exports

The package ships four stable subpath entry points alongside the root export.
Use the subpath that matches the layer you depend on — it keeps bundles small
and makes the dependency direction explicit:

| Import | Use it for |
| --- | --- |
| `@fhir-place/react-fhir` | The convenience root export — re-exports all four layers below. |
| `@fhir-place/react-fhir/client` | `FhirClient`, `FetchFhirClient`, `FhirError`, `SearchParams`. No React. |
| `@fhir-place/react-fhir/hooks` | `FhirClientProvider`, `useFhirClient`, query / mutation hooks, `fhirQueryKeys`. Requires `@tanstack/react-query`. |
| `@fhir-place/react-fhir/structure` | StructureDefinition / SearchParameter walkers, path helpers, value-set / binding utilities. No React, no network. |
| `@fhir-place/react-fhir/components` | `ResourceView`, `ResourceEditor`, `ResourceSearch`, `ResourceTable`, `Narrative`, datatype renderers + inputs. |

### API surface stability

- The root export and the four subpath exports are the **public API**. They
  follow semver on the package version.
- Anything imported via a deeper relative path (e.g. `dist/components/inputs/Period.js`)
  is **internal**. It can move or change shape between minor releases.
- Pre-1.0, minor-version bumps may include breaking changes — see the
  [changelog](./CHANGELOG.md) before upgrading.

## Architecture: layer boundaries

The library is organised as four layers, each with a single responsibility.
Imports flow downward — a higher layer may depend on the layers below it, but
not the reverse.

```
components/   ← UI (React, JSX, datatype dispatch)
   ↓
hooks/        ← TanStack Query wrappers around the client (React, no JSX)
   ↓
structure/    ← StructureDefinition introspection (no React, no network)
   ↓
client/       ← Typed FHIR REST transport (no React)
```

- `client/` knows how to talk to a FHIR server. It has no React or DOM
  dependencies and is safe to import from Node tooling.
- `structure/` understands the FHIR metamodel — walking SDs, resolving paths,
  formatting values, expanding ValueSets. Pure functions, no I/O.
- `hooks/` glues `client/` to TanStack Query and exposes the cache via stable
  query keys. Imports `client/` and `structure/`; never `components/`.
- `components/` renders / edits resources by dispatching on FHIR datatype.
  Imports any layer below; never imported by lower layers.

When you contribute, prefer adding to the lowest layer that can host the
behaviour. A new search-param helper belongs in `client/`; a new datatype
formatter belongs in `structure/`; a new query hook belongs in `hooks/`; a new
input or renderer belongs in `components/`.

## Testing

```bash
pnpm test          # watch mode (Vitest + MSW + jsdom)
pnpm test:run      # single run
pnpm test:ci       # single run with coverage + thresholds
```

Coverage thresholds are enforced in `vitest.config.ts`; `test:ci` is the
script CI runs to gate merges.

## License

MIT — see [LICENSE](https://github.com/samsuffolksperoni/fhir-place/blob/main/LICENSE).
