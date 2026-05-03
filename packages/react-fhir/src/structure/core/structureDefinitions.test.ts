import type { StructureDefinition } from "fhir/r4";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSpecFetcherCache,
  coreStructureDefinition,
  createDefaultSpecFetcher,
  DEFAULT_SPEC_BASE_URL,
  setCoreStructureDefinitionFetcher,
} from "./index.js";

const sd = (type: string): StructureDefinition => ({
  resourceType: "StructureDefinition",
  id: type,
  url: `http://hl7.org/fhir/StructureDefinition/${type}`,
  name: type,
  status: "active",
  kind: "resource",
  abstract: false,
  type,
  snapshot: { element: [{ id: type, path: type }] },
});

describe("coreStructureDefinition (runtime spec fetcher)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearSpecFetcherCache();
    setCoreStructureDefinitionFetcher(createDefaultSpecFetcher());
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    setCoreStructureDefinitionFetcher(createDefaultSpecFetcher());
    clearSpecFetcherCache();
  });

  it("fetches the per-type profile JSON from the published R4 spec", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(sd("Patient")), { status: 200 }),
    );
    const result = await coreStructureDefinition("Patient");
    expect(result?.type).toBe("Patient");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toBe(`${DEFAULT_SPEC_BASE_URL}/patient.profile.json`);
  });

  it("lower-cases the type segment so URL casing matches the published files", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(sd("AdverseEvent")), { status: 200 }),
    );
    await coreStructureDefinition("AdverseEvent");
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toBe(`${DEFAULT_SPEC_BASE_URL}/adverseevent.profile.json`);
  });

  it("returns undefined for 404 (unknown resource type)", async () => {
    fetchSpy.mockResolvedValue(new Response("not found", { status: 404 }));
    expect(await coreStructureDefinition("MadeUpThing")).toBeUndefined();
  });

  it("memoises successful results so each type costs at most one fetch", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(sd("Observation")), { status: 200 }),
    );
    await coreStructureDefinition("Observation");
    await coreStructureDefinition("Observation");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures (a transient 5xx can be retried)", async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(sd("Patient")), { status: 200 }),
      );
    await expect(coreStructureDefinition("Patient")).rejects.toThrow(/503/);
    const second = await coreStructureDefinition("Patient");
    expect(second?.type).toBe("Patient");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("rejects responses whose body isn't a StructureDefinition", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ resourceType: "OperationOutcome" }), { status: 200 }),
    );
    await expect(coreStructureDefinition("Patient")).rejects.toThrow(
      /Expected a StructureDefinition/,
    );
  });

  it("honours setCoreStructureDefinitionFetcher overrides (e.g. local mirror)", async () => {
    const custom = vi.fn(async (type: string) => sd(type));
    setCoreStructureDefinitionFetcher(custom);
    const result = await coreStructureDefinition("ServiceRequest");
    expect(result?.type).toBe("ServiceRequest");
    expect(custom).toHaveBeenCalledWith("ServiceRequest", undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("createDefaultSpecFetcher accepts a custom base URL", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(sd("Patient")), { status: 200 }),
    );
    const local = createDefaultSpecFetcher("/fhir-r4");
    setCoreStructureDefinitionFetcher(local);
    await coreStructureDefinition("Patient");
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toBe("/fhir-r4/patient.profile.json");
  });

  it("propagates AbortSignal to the fetch", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(sd("Patient")), { status: 200 }),
    );
    const ctrl = new AbortController();
    await coreStructureDefinition("Patient", ctrl.signal);
    const opts = fetchSpy.mock.calls[0]![1] as RequestInit | undefined;
    expect(opts?.signal).toBe(ctrl.signal);
  });
});
