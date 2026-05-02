import { describe, expect, it, vi } from "vitest";
import type { FhirClient } from "@fhir-place/react-fhir";
import { buildFhirDataSource } from "./fhirDataSource.js";

const fakeBundle = {
  resourceType: "Bundle",
  type: "searchset",
  entry: [
    { resource: { resourceType: "Patient", id: "p1" } },
    { resource: { resourceType: "Observation", id: "o1" } },
  ],
};

const stubClient = (overrides: Partial<FhirClient> = {}): FhirClient => ({
  baseUrl: "http://fhir.local",
  fhirVersion: "4.0",
  capabilities: vi.fn(),
  read: vi.fn(),
  vread: vi.fn(),
  history: vi.fn(),
  search: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  readReference: vi.fn(),
  request: vi.fn(),
  ...overrides,
});

describe("buildFhirDataSource", () => {
  it("calls $everything and feeds the bundle to cql-exec-fhir", async () => {
    const request = vi.fn().mockResolvedValue(fakeBundle);
    const client = stubClient({ request });

    const built = await buildFhirDataSource({ client, patientId: "p1" });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "Patient/p1/$everything", method: "GET" }),
    );
    expect(built.bundle).toBe(fakeBundle);
    // Sanity-check that cql-exec-fhir loaded the patient.
    const patient = built.source.currentPatient();
    expect(patient).toBeDefined();
  });

  it("falls back to compartment search when $everything fails", async () => {
    const request = vi.fn().mockRejectedValue(new Error("404"));
    const read = vi.fn().mockResolvedValue({ resourceType: "Patient", id: "p1" });
    const search = vi
      .fn()
      .mockResolvedValue({ resourceType: "Bundle", entry: [] });

    const client = stubClient({ request, read, search });
    const built = await buildFhirDataSource({ client, patientId: "p1" });

    expect(read).toHaveBeenCalledWith("Patient", "p1", expect.any(Object));
    expect(search).toHaveBeenCalled();
    expect(built.bundle.entry?.[0]?.resource).toEqual({
      resourceType: "Patient",
      id: "p1",
    });
  });

  it("URL-encodes the patient id", async () => {
    const request = vi.fn().mockResolvedValue(fakeBundle);
    const client = stubClient({ request });
    await buildFhirDataSource({ client, patientId: "weird/id" });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "Patient/weird%2Fid/$everything" }),
    );
  });
});
