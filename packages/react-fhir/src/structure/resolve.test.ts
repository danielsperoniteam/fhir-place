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
import { ObservationStructureDefinition } from "../../test/fixtures/StructureDefinition-Observation.js";
import { PatientStructureDefinition } from "../../test/fixtures/StructureDefinition-Patient.js";
import {
  clearSpecFetcherCache,
  createBundledSpecFetcher,
  setCoreStructureDefinitionFetcher,
} from "./core/index.js";
import { resolveStructureDefinition } from "./resolve.js";

const BASE = "https://fhir.example.test/fhir";
const server = setupServer();

const FIXTURES: Record<string, StructureDefinition> = {
  Patient: PatientStructureDefinition,
  Observation: ObservationStructureDefinition,
};

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  // Stub the spec fetcher so step 3 doesn't try to hit hl7.org from tests.
  setCoreStructureDefinitionFetcher(async (type) => FIXTURES[type]);
});
afterEach(() => {
  server.resetHandlers();
  clearSpecFetcherCache();
});
afterAll(() => {
  server.close();
  setCoreStructureDefinitionFetcher(createBundledSpecFetcher());
});

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
  it("returns the bundled core SD without hitting the server (default path for core types)", async () => {
    const instanceHit = vi.fn();
    const searchHit = vi.fn();
    server.use(
      http.get(`${BASE}/StructureDefinition/Patient`, () => {
        instanceHit();
        return HttpResponse.json(sd("Patient", "should-not-be-returned"));
      }),
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
    expect(result.id).toBe("Patient"); // from the FIXTURES bundled fixture
    expect(instanceHit).not.toHaveBeenCalled();
    expect(searchHit).not.toHaveBeenCalled();
  });

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

  it("falls back to search-by-canonical when the instance read 404s (no bundled SD available)", async () => {
    // Patient is bundled, so we'd skip the server entirely; opt out to exercise
    // the server-side instance-read → search-by-canonical fallback path.
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
    const result = await resolveStructureDefinition(mkClient(), "Patient", {
      useBundledFallback: false,
    });
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



  it("falls back to the bundled core SD when canonical search returns 400 (servers that don't index _url)", async () => {
    server.use(
      http.get(`${BASE}/StructureDefinition/MedicationRequest`, () =>
        new HttpResponse(null, { status: 404 }),
      ),
      http.get(`${BASE}/StructureDefinition`, () =>
        HttpResponse.json(
          {
            resourceType: "OperationOutcome",
            issue: [{ severity: "error", code: "invalid", diagnostics: "_url not supported" }],
          },
          { status: 400 },
        ),
      ),
    );
    setCoreStructureDefinitionFetcher(async (type) =>
      type === "MedicationRequest" ? sd("MedicationRequest", "core-mr") : undefined,
    );
    const result = await resolveStructureDefinition(mkClient(), "MedicationRequest");
    expect(result.type).toBe("MedicationRequest");
    expect(result.id).toBe("core-mr");
    setCoreStructureDefinitionFetcher(async (type) => FIXTURES[type]);
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
    // The bundled-first path returns immediately for core types, so trigger
    // the server path with useBundledFallback:false to verify a 500 still
    // bubbles up with its FhirError status.
    server.use(
      http.get(`${BASE}/StructureDefinition/Patient`, () =>
        HttpResponse.json(
          { resourceType: "OperationOutcome" },
          { status: 500 },
        ),
      ),
    );
    await expect(
      resolveStructureDefinition(mkClient(), "Patient", { useBundledFallback: false }),
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
