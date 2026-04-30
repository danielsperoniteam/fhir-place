import type { StructureDefinition } from "fhir/r4";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { resolveStructureDefinition } from "./resolve.js";

const BASE = "https://fhir.example.test/fhir";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const mkClient = () => new FetchFhirClient({ baseUrl: BASE });

const sd = (type: string, id = type): StructureDefinition => ({
  resourceType: "StructureDefinition",
  id,
  url: `http://hl7.org/fhir/StructureDefinition/${type}`,
  name: type,
  status: "active",
  kind: "resource",
  abstract: false,
  type,
});

describe("resolveStructureDefinition", () => {
  it("returns the instance read when the server stores the SD at /StructureDefinition/{type}", async () => {
    const searchHit = vi.fn();
    server.use(
      http.get(`${BASE}/StructureDefinition/Patient`, () =>
        HttpResponse.json(sd("Patient")),
      ),
      http.get(`${BASE}/StructureDefinition`, () => {
        searchHit();
        return HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: [],
        });
      }),
    );
    const result = await resolveStructureDefinition(mkClient(), "Patient");
    expect(result.type).toBe("Patient");
    expect(searchHit).not.toHaveBeenCalled();
  });

  it("falls back to search-by-canonical when the instance read 404s", async () => {
    server.use(
      http.get(`${BASE}/StructureDefinition/Patient`, () =>
        HttpResponse.json(
          {
            resourceType: "OperationOutcome",
            issue: [{ severity: "error", code: "not-found" }],
          },
          { status: 404 },
        ),
      ),
      http.get(`${BASE}/StructureDefinition`, ({ request }) => {
        const url = new URL(request.url).searchParams.get("url");
        expect(url).toBe("http://hl7.org/fhir/StructureDefinition/Patient");
        return HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: [{ resource: sd("Patient", "generated-id") }],
        });
      }),
    );
    const result = await resolveStructureDefinition(mkClient(), "Patient");
    expect(result.type).toBe("Patient");
    expect(result.id).toBe("generated-id");
  });

  it("falls back to the bundled core SD when both instance read and search come up empty (Patient)", async () => {
    server.use(
      http.get(`${BASE}/StructureDefinition/Patient`, () =>
        HttpResponse.json(
          { resourceType: "OperationOutcome" },
          { status: 404 },
        ),
      ),
      http.get(`${BASE}/StructureDefinition`, () =>
        HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: [],
        }),
      ),
    );
    const result = await resolveStructureDefinition(mkClient(), "Patient");
    expect(result.type).toBe("Patient");
    expect(result.url).toBe("http://hl7.org/fhir/StructureDefinition/Patient");
    // Bundled SD ships a snapshot with the common elements
    expect(result.snapshot?.element.some((e) => e.path === "Patient.name")).toBe(true);
  });

  it("falls back to the bundled core SD for Observation too", async () => {
    server.use(
      http.get(`${BASE}/StructureDefinition/Observation`, () =>
        new HttpResponse(null, { status: 410 }),
      ),
      http.get(`${BASE}/StructureDefinition`, () =>
        HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: [],
        }),
      ),
    );
    const result = await resolveStructureDefinition(mkClient(), "Observation");
    expect(result.type).toBe("Observation");
    expect(result.snapshot?.element.some((e) => e.path === "Observation.status")).toBe(true);
  });



  it("resolves profiled canonicals via url search", async () => {
    const profile = "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient";
    server.use(
      http.get(`${BASE}/StructureDefinition/us-core-patient`, () => new HttpResponse(null, { status: 404 })),
      http.get(`${BASE}/StructureDefinition`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("url")).toBe(profile);
        return HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: [{ resource: { ...sd("Patient", "us-core-patient"), url: profile } }],
        });
      }),
    );
    const result = await resolveStructureDefinition(mkClient(), "Patient", { profile });
    expect(result.url).toBe(profile);
  });

  it("throws a friendly error when every fallback fails", async () => {
    server.use(
      http.get(`${BASE}/StructureDefinition/ServiceRequest`, () =>
        new HttpResponse(null, { status: 404 }),
      ),
      http.get(`${BASE}/StructureDefinition`, () =>
        HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: [],
        }),
      ),
    );
    await expect(
      resolveStructureDefinition(mkClient(), "ServiceRequest"),
    ).rejects.toThrow(/Could not resolve StructureDefinition for "ServiceRequest"/);
  });

  it("does not mask genuine errors (500) with the bundled fallback", async () => {
    server.use(
      http.get(`${BASE}/StructureDefinition/Patient`, () =>
        HttpResponse.json(
          { resourceType: "OperationOutcome" },
          { status: 500 },
        ),
      ),
    );
    await expect(
      resolveStructureDefinition(mkClient(), "Patient"),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("useBundledFallback: false disables the last-resort core lookup", async () => {
    server.use(
      http.get(`${BASE}/StructureDefinition/Patient`, () =>
        new HttpResponse(null, { status: 404 }),
      ),
      http.get(`${BASE}/StructureDefinition`, () =>
        HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: [],
        }),
      ),
    );
    await expect(
      resolveStructureDefinition(mkClient(), "Patient", {
        useBundledFallback: false,
      }),
    ).rejects.toThrow(/Could not resolve/);
  });
});
