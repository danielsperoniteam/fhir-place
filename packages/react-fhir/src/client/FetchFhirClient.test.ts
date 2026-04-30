import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { Bundle, Patient } from "fhir/r4";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FetchFhirClient } from "./FetchFhirClient.js";
import { FhirError } from "./types.js";

const BASE = "https://fhir.example.test/fhir";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const mkPatient = (overrides: Partial<Patient> = {}): Patient => ({
  resourceType: "Patient",
  id: "123",
  name: [{ given: ["Ada"], family: "Lovelace" }],
  gender: "female",
  ...overrides,
});

describe("FetchFhirClient", () => {
  it("reads a resource by type and id", async () => {
    server.use(
      http.get(`${BASE}/Patient/123`, ({ request }) => {
        expect(request.headers.get("accept")).toBe("application/fhir+json");
        return HttpResponse.json(mkPatient());
      }),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    const p = await client.read<Patient>("Patient", "123");
    expect(p.id).toBe("123");
    expect(p.name?.[0]?.family).toBe("Lovelace");
  });

  it("vread targets a specific version", async () => {
    server.use(
      http.get(`${BASE}/Patient/123/_history/2`, () =>
        HttpResponse.json(mkPatient({ meta: { versionId: "2" } })),
      ),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    const p = await client.vread<Patient>("Patient", "123", "2");
    expect(p.meta?.versionId).toBe("2");
  });

  it("search serialises params and returns a Bundle", async () => {
    server.use(
      http.get(`${BASE}/Patient`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("name")).toBe("smith");
        expect(url.searchParams.get("_count")).toBe("10");
        return HttpResponse.json<Bundle<Patient>>({
          resourceType: "Bundle",
          type: "searchset",
          total: 1,
          entry: [{ resource: mkPatient() }],
        });
      }),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    const bundle = await client.search<Patient>("Patient", {
      name: "smith",
      _count: 10,
    });
    expect(bundle.total).toBe(1);
    expect(bundle.entry?.[0]?.resource?.resourceType).toBe("Patient");
  });

  it("create POSTs the resource with FHIR JSON content-type", async () => {
    let captured: { method: string; contentType: string | null; body: unknown } | null =
      null;
    server.use(
      http.post(`${BASE}/Patient`, async ({ request }) => {
        captured = {
          method: request.method,
          contentType: request.headers.get("content-type"),
          body: await request.json(),
        };
        return HttpResponse.json(mkPatient({ id: "new-1" }), { status: 201 });
      }),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    const created = await client.create(mkPatient({ id: undefined }));
    expect(created.id).toBe("new-1");
    expect(captured).toMatchObject({
      method: "POST",
      contentType: "application/fhir+json",
    });
  });

  it("create sends If-None-Exist for conditional create", async () => {
    let header: string | null = null;
    server.use(
      http.post(`${BASE}/Patient`, ({ request }) => {
        header = request.headers.get("if-none-exist");
        return HttpResponse.json(mkPatient({ id: "cond" }));
      }),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    await client.create(mkPatient({ id: undefined }), {
      ifNoneExist: "identifier=urn:oid:1.2.3|abc",
    });
    expect(header).toBe("identifier=urn:oid:1.2.3|abc");
  });

  it("update PUTs with If-Match when provided", async () => {
    let header: string | null = null;
    server.use(
      http.put(`${BASE}/Patient/123`, ({ request }) => {
        header = request.headers.get("if-match");
        return HttpResponse.json(mkPatient({ meta: { versionId: "3" } }));
      }),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    const updated = await client.update(mkPatient() as Patient & { id: string }, {
      ifMatch: 'W/"2"',
    });
    expect(updated.meta?.versionId).toBe("3");
    expect(header).toBe('W/"2"');
  });

  it("patch sends JSON Patch content-type and operations", async () => {
    let received: { contentType: string | null; body: unknown } | null = null;
    server.use(
      http.patch(`${BASE}/Patient/123`, async ({ request }) => {
        received = {
          contentType: request.headers.get("content-type"),
          body: await request.json(),
        };
        return HttpResponse.json(mkPatient({ gender: "other" }));
      }),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    const patched = await client.patch<Patient>("Patient", "123", [
      { op: "replace", path: "/gender", value: "other" },
    ]);
    expect(patched.gender).toBe("other");
    expect(received).toMatchObject({
      contentType: "application/json-patch+json",
      body: [{ op: "replace", path: "/gender", value: "other" }],
    });
  });

  it("delete returns void on 204", async () => {
    server.use(http.delete(`${BASE}/Patient/123`, () => new HttpResponse(null, { status: 204 })));
    const client = new FetchFhirClient({ baseUrl: BASE });
    await expect(client.delete("Patient", "123")).resolves.toBeUndefined();
  });

  it("readReference resolves relative references", async () => {
    server.use(
      http.get(`${BASE}/Patient/abc`, () => HttpResponse.json(mkPatient({ id: "abc" }))),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    const p = await client.readReference<Patient>({ reference: "Patient/abc" });
    expect(p.id).toBe("abc");
  });

  it("readReference fetches absolute URLs as-is", async () => {
    server.use(
      http.get("https://other.example.test/fhir/Patient/xyz", () =>
        HttpResponse.json(mkPatient({ id: "xyz" })),
      ),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    const p = await client.readReference<Patient>({
      reference: "https://other.example.test/fhir/Patient/xyz",
    });
    expect(p.id).toBe("xyz");
  });

  it("throws FhirError with OperationOutcome on 4xx", async () => {
    server.use(
      http.get(`${BASE}/Patient/missing`, () =>
        HttpResponse.json(
          {
            resourceType: "OperationOutcome",
            issue: [
              {
                severity: "error",
                code: "not-found",
                diagnostics: "Resource Patient/missing is not known",
              },
            ],
          },
          { status: 404 },
        ),
      ),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    await expect(client.read("Patient", "missing")).rejects.toMatchObject({
      name: "FhirError",
      status: 404,
      operationOutcome: { resourceType: "OperationOutcome" },
    });
  });

  it("FhirError is thrown when body is non-JSON", async () => {
    server.use(
      http.get(`${BASE}/Patient/err`, () =>
        new HttpResponse("Internal Server Error", { status: 500 }),
      ),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    const err = await client.read("Patient", "err").catch((e) => e);
    expect(err).toBeInstanceOf(FhirError);
    expect(err.status).toBe(500);
    expect(err.operationOutcome).toBeUndefined();
  });

  it("applies static and dynamic headers; dynamic wins on collision", async () => {
    let authz: string | null = null;
    let tenant: string | null = null;
    server.use(
      http.get(`${BASE}/Patient/1`, ({ request }) => {
        authz = request.headers.get("authorization");
        tenant = request.headers.get("x-tenant");
        return HttpResponse.json(mkPatient({ id: "1" }));
      }),
    );
    const client = new FetchFhirClient({
      baseUrl: BASE,
      headers: { Authorization: "Bearer static", "X-Tenant": "acme" },
      getHeaders: () => ({ Authorization: "Bearer dynamic" }),
    });
    await client.read("Patient", "1");
    expect(authz).toBe("Bearer dynamic");
    expect(tenant).toBe("acme");
  });

  it("passes through AbortSignal", async () => {
    const controller = new AbortController();
    server.use(
      http.get(`${BASE}/Patient/slow`, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(mkPatient());
      }),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    const p = client.read("Patient", "slow", { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toThrow();
  });

  it("capabilities() GETs /metadata", async () => {
    server.use(
      http.get(`${BASE}/metadata`, () =>
        HttpResponse.json({
          resourceType: "CapabilityStatement",
          status: "active",
          fhirVersion: "4.0.1",
        }),
      ),
    );
    const client = new FetchFhirClient({ baseUrl: BASE });
    const cap = await client.capabilities();
    expect(cap.resourceType).toBe("CapabilityStatement");
    expect(cap.fhirVersion).toBe("4.0.1");
  });



  it("fails stalled requests with a timeout FhirError", async () => {
    server.use(
      http.get(`${BASE}/Patient/slow-timeout`, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json(mkPatient({ id: "slow-timeout" }));
      }),
    );
    const client = new FetchFhirClient({ baseUrl: BASE, requestTimeoutMs: 5 });
    await expect(client.read("Patient", "slow-timeout")).rejects.toMatchObject({
      name: "FhirError",
      status: 408,
    });
  });
  it("uses a custom fetch implementation when supplied", async () => {
    const customFetch = vi.fn(async () =>
      new Response(JSON.stringify(mkPatient({ id: "fake" })), {
        status: 200,
        headers: { "Content-Type": "application/fhir+json" },
      }),
    );
    const client = new FetchFhirClient({
      baseUrl: BASE,
      fetch: customFetch as unknown as typeof fetch,
    });
    const p = await client.read<Patient>("Patient", "fake");
    expect(p.id).toBe("fake");
    expect(customFetch).toHaveBeenCalledOnce();
  });
});
