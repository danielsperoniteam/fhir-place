import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Patient } from "fhir/r4";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { FhirClientProvider } from "./FhirClientProvider.js";
import {
  nextPageUrl,
  useCapabilities,
  useCreateResource,
  useDeleteResource,
  useInfiniteSearch,
  useResource,
  useSearch,
  useSearchParameter,
  useStructureDefinition,
  useUpdateResource,
  useValueSet,
} from "./queries.js";

const BASE = "https://fhir.example.test/fhir";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const mkWrapper = () => {
  const client = new FetchFhirClient({ baseUrl: BASE });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <FhirClientProvider client={client}>{children}</FhirClientProvider>
    </QueryClientProvider>
  );
  return { wrapper, qc, client };
};

describe("query hooks", () => {
  it("useCapabilities fetches /metadata", async () => {
    server.use(
      http.get(`${BASE}/metadata`, () =>
        HttpResponse.json({ resourceType: "CapabilityStatement", status: "active" }),
      ),
    );
    const { wrapper } = mkWrapper();
    const { result } = renderHook(() => useCapabilities(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.resourceType).toBe("CapabilityStatement");
  });

  it("useResource is disabled when id is undefined", () => {
    const { wrapper } = mkWrapper();
    const { result } = renderHook(() => useResource<Patient>("Patient", undefined), {
      wrapper,
    });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useResource fetches when id is provided", async () => {
    server.use(
      http.get(`${BASE}/Patient/42`, () =>
        HttpResponse.json({ resourceType: "Patient", id: "42", gender: "other" }),
      ),
    );
    const { wrapper } = mkWrapper();
    const { result } = renderHook(() => useResource<Patient>("Patient", "42"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("42");
  });

  it("useSearch passes params to the server", async () => {
    let captured: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE}/Patient`, ({ request }) => {
        captured = new URL(request.url).searchParams;
        return HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          total: 0,
          entry: [],
        });
      }),
    );
    const { wrapper } = mkWrapper();
    const { result } = renderHook(
      () => useSearch<Patient>("Patient", { name: "adams", _count: 5 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(captured!.get("name")).toBe("adams");
    expect(captured!.get("_count")).toBe("5");
  });

  it("useStructureDefinition reads the definition resource", async () => {
    server.use(
      http.get(`${BASE}/StructureDefinition/Patient`, () =>
        HttpResponse.json({
          resourceType: "StructureDefinition",
          id: "Patient",
          url: "http://hl7.org/fhir/StructureDefinition/Patient",
          name: "Patient",
          status: "active",
          kind: "resource",
          abstract: false,
          type: "Patient",
        }),
      ),
    );
    const { wrapper } = mkWrapper();
    const { result } = renderHook(() => useStructureDefinition("Patient"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("Patient");
  });

  it("useCreateResource POSTs and invalidates caches", async () => {
    const writes = vi.fn();
    server.use(
      http.post(`${BASE}/Patient`, async ({ request }) => {
        writes(await request.json());
        return HttpResponse.json({ resourceType: "Patient", id: "new-id" }, { status: 201 });
      }),
    );
    const { wrapper, qc } = mkWrapper();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateResource<Patient>(), { wrapper });
    let created: Patient | undefined;
    await act(async () => {
      created = await result.current.mutateAsync({
        resourceType: "Patient",
        gender: "male",
      });
    });
    expect(writes).toHaveBeenCalled();
    expect(created?.id).toBe("new-id");
    expect(invalidate).toHaveBeenCalled();
  });

  it("useUpdateResource PUTs by id", async () => {
    server.use(
      http.put(`${BASE}/Patient/7`, async ({ request }) => {
        const body = (await request.json()) as Patient;
        return HttpResponse.json({ ...body, meta: { versionId: "2" } });
      }),
    );
    const { wrapper } = mkWrapper();
    const { result } = renderHook(() => useUpdateResource<Patient>(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        resourceType: "Patient",
        id: "7",
        gender: "female",
      });
    });
    expect(result.current.data?.meta?.versionId).toBe("2");
  });

  it("useDeleteResource DELETEs by type and id", async () => {
    const hit = vi.fn();
    server.use(
      http.delete(`${BASE}/Patient/9`, () => {
        hit();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { wrapper } = mkWrapper();
    const { result } = renderHook(() => useDeleteResource(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ type: "Patient", id: "9" });
    });
    expect(hit).toHaveBeenCalledOnce();
    expect(result.current.isSuccess).toBe(true);
  });

  describe("useValueSet", () => {
    it("prefers the $expand operation and returns the expanded ValueSet", async () => {
      const url = "http://hl7.org/fhir/ValueSet/administrative-gender";
      server.use(
        http.get(`${BASE}/ValueSet/$expand`, ({ request }) => {
          expect(new URL(request.url).searchParams.get("url")).toBe(url);
          return HttpResponse.json({
            resourceType: "ValueSet",
            status: "active",
            url,
            expansion: {
              identifier: "x",
              timestamp: "2024-01-01T00:00:00Z",
              contains: [
                { system: "s", code: "male" },
                { system: "s", code: "female" },
              ],
            },
          });
        }),
      );
      const { wrapper } = mkWrapper();
      const { result } = renderHook(() => useValueSet(url), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.expansion?.contains).toHaveLength(2);
    });

    it("falls back to ValueSet?url=... when $expand errors", async () => {
      const url = "http://hl7.org/fhir/ValueSet/task-status";
      server.use(
        http.get(`${BASE}/ValueSet/$expand`, () =>
          HttpResponse.json({ resourceType: "OperationOutcome" }, { status: 501 }),
        ),
        http.get(`${BASE}/ValueSet`, ({ request }) => {
          expect(new URL(request.url).searchParams.get("url")).toBe(url);
          return HttpResponse.json({
            resourceType: "Bundle",
            type: "searchset",
            entry: [
              {
                resource: {
                  resourceType: "ValueSet",
                  status: "active",
                  url,
                  compose: {
                    include: [
                      { system: "s", concept: [{ code: "draft" }, { code: "requested" }] },
                    ],
                  },
                },
              },
            ],
          });
        }),
      );
      const { wrapper } = mkWrapper();
      const { result } = renderHook(() => useValueSet(url), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.compose?.include?.[0]?.concept).toHaveLength(2);
    });

    it("is disabled when canonical is undefined", () => {
      const { wrapper } = mkWrapper();
      const { result } = renderHook(() => useValueSet(undefined), { wrapper });
      expect(result.current.fetchStatus).toBe("idle");
    });

    it("strips a `|version` suffix before resolving against the server", async () => {
      const base = "http://hl7.org/fhir/ValueSet/administrative-gender";
      let captured: string | null = null;
      server.use(
        http.get(`${BASE}/ValueSet/$expand`, ({ request }) => {
          captured = new URL(request.url).searchParams.get("url");
          return HttpResponse.json({
            resourceType: "ValueSet",
            status: "active",
            url: base,
            expansion: {
              identifier: "x",
              timestamp: "2024-01-01T00:00:00Z",
              contains: [{ system: "s", code: "male" }],
            },
          });
        }),
      );
      const { wrapper } = mkWrapper();
      const { result } = renderHook(() => useValueSet(`${base}|4.0.1`), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(captured).toBe(base);
    });

    it("falls back to a bundled core ValueSet when the canonical carries a version", async () => {
      const base = "http://hl7.org/fhir/ValueSet/allergy-intolerance-category";
      server.use(
        http.get(`${BASE}/ValueSet/$expand`, () =>
          HttpResponse.json({ resourceType: "OperationOutcome" }, { status: 501 }),
        ),
        http.get(`${BASE}/ValueSet`, () =>
          HttpResponse.json({ resourceType: "Bundle", type: "searchset", entry: [] }),
        ),
      );
      const { wrapper } = mkWrapper();
      const { result } = renderHook(() => useValueSet(`${base}|4.0.1`), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.url).toBe(base);
      expect(result.current.data?.expansion?.contains).toBeDefined();
    });
  });

  describe("useSearchParameter", () => {
    it("fetches SearchParameter?base=&code= and returns the first match", async () => {
      let captured: URLSearchParams | null = null;
      server.use(
        http.get(`${BASE}/SearchParameter`, ({ request }) => {
          captured = new URL(request.url).searchParams;
          return HttpResponse.json({
            resourceType: "Bundle",
            type: "searchset",
            entry: [
              {
                resource: {
                  resourceType: "SearchParameter",
                  url: "http://example/sp/Patient-given",
                  name: "given",
                  status: "active",
                  description: "Given names",
                  code: "given",
                  base: ["Patient"],
                  type: "string",
                  expression: "Patient.name.given",
                },
              },
            ],
          });
        }),
      );
      const { wrapper } = mkWrapper();
      const { result } = renderHook(
        () => useSearchParameter("Patient", "given"),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(captured!.get("base")).toBe("Patient");
      expect(captured!.get("code")).toBe("given");
      expect(result.current.data?.expression).toBe("Patient.name.given");
    });

    it("returns null (not undefined) when the server has no matching SearchParameter", async () => {
      server.use(
        http.get(`${BASE}/SearchParameter`, () =>
          HttpResponse.json({ resourceType: "Bundle", type: "searchset", entry: [] }),
        ),
      );
      const { wrapper } = mkWrapper();
      const { result } = renderHook(
        () => useSearchParameter("Patient", "made-up"),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    it("returns null when the server errors out", async () => {
      server.use(
        http.get(`${BASE}/SearchParameter`, () =>
          HttpResponse.json({ resourceType: "OperationOutcome" }, { status: 500 }),
        ),
      );
      const { wrapper } = mkWrapper();
      const { result } = renderHook(
        () => useSearchParameter("Patient", "given"),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    it("is disabled when base or code is empty", () => {
      const { wrapper } = mkWrapper();
      const { result: r1 } = renderHook(
        () => useSearchParameter("", "given"),
        { wrapper },
      );
      expect(r1.current.fetchStatus).toBe("idle");
      const { result: r2 } = renderHook(
        () => useSearchParameter("Patient", ""),
        { wrapper },
      );
      expect(r2.current.fetchStatus).toBe("idle");
    });
  });

  describe("nextPageUrl / useInfiniteSearch", () => {
    it("nextPageUrl reads the rel='next' link from a Bundle", () => {
      expect(
        nextPageUrl({
          resourceType: "Bundle",
          type: "searchset",
          link: [
            { relation: "self", url: "https://fhir.example/fhir/Patient?_count=2" },
            { relation: "next", url: "https://fhir.example/fhir/Patient?_getpages=abc" },
          ],
        }),
      ).toBe("https://fhir.example/fhir/Patient?_getpages=abc");
      expect(nextPageUrl(undefined)).toBeUndefined();
      expect(
        nextPageUrl({ resourceType: "Bundle", type: "searchset" }),
      ).toBeUndefined();
    });

    it("follows Bundle.link[rel=next] across three pages", async () => {
      const makePage = (
        page: number,
        ids: string[],
        nextUrl?: string,
      ) => ({
        resourceType: "Bundle",
        type: "searchset",
        total: 6,
        entry: ids.map((id) => ({ resource: { resourceType: "Patient", id } })),
        ...(nextUrl ? { link: [{ relation: "next", url: nextUrl }] } : {}),
      });
      const nextUrl1 = `${BASE}/Patient?_getpages=page2`;
      const nextUrl2 = `${BASE}/Patient?_getpages=page3`;
      server.use(
        http.get(`${BASE}/Patient`, ({ request }) => {
          const pageParam = new URL(request.url).searchParams.get("_getpages");
          if (pageParam === "page2") return HttpResponse.json(makePage(2, ["p3", "p4"], nextUrl2));
          if (pageParam === "page3") return HttpResponse.json(makePage(3, ["p5", "p6"]));
          return HttpResponse.json(makePage(1, ["p1", "p2"], nextUrl1));
        }),
      );

      const { wrapper } = mkWrapper();
      const { result } = renderHook(
        () => useInfiniteSearch<Patient>("Patient", { _count: 2 }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.hasNextPage).toBe(true);

      // fetchNextPage resolves with the fresh query state (including appended
      // pages); result.current updates on a subsequent React render.
      let latest = await act(() => result.current.fetchNextPage());
      expect(latest.data?.pages.length).toBe(2);

      latest = await act(() => result.current.fetchNextPage());
      expect(latest.data?.pages.length).toBe(3);
      expect(latest.hasNextPage).toBe(false);

      const allIds = latest.data!.pages.flatMap((b) =>
        (b.entry ?? []).map((e) => e.resource?.id),
      );
      expect(allIds).toEqual(["p1", "p2", "p3", "p4", "p5", "p6"]);
    });

    it("stops at a single page when no next link is present", async () => {
      server.use(
        http.get(`${BASE}/Patient`, () =>
          HttpResponse.json({
            resourceType: "Bundle",
            type: "searchset",
            total: 1,
            entry: [{ resource: { resourceType: "Patient", id: "only" } }],
          }),
        ),
      );
      const { wrapper } = mkWrapper();
      const { result } = renderHook(
        () => useInfiniteSearch<Patient>("Patient"),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.hasNextPage).toBe(false);
    });
  });

  it("throws when useFhirClient is used without provider", async () => {
    const { renderHook: rh } = await import("@testing-library/react");
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    expect(() =>
      rh(() => useResource("Patient", "1"), { wrapper }),
    ).toThrow(/FhirClientProvider/);
  });
});
