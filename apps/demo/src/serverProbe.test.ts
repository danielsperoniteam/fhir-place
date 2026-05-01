import { describe, expect, it, vi } from "vitest";
import type { ServerConfig } from "./config.js";
import { probeFhirServer } from "./serverProbe.js";

const baseServer: ServerConfig = {
  id: "test",
  label: "Test",
  baseUrl: "https://example.org/fhir",
  authMode: "none",
};

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response => {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/fhir+json" },
    ...init,
  });
};

describe("probeFhirServer", () => {
  it("returns ok with software + fhirVersion on success", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        resourceType: "CapabilityStatement",
        software: { name: "HAPI FHIR Server" },
        fhirVersion: "4.0.1",
      }),
    );
    const result = await probeFhirServer(baseServer, { fetchImpl });
    expect(result).toEqual({
      ok: true,
      software: "HAPI FHIR Server",
      fhirVersion: "4.0.1",
    });
  });

  it("omits software/fhirVersion fields when the response lacks them", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ resourceType: "CapabilityStatement" }),
    );
    const result = await probeFhirServer(baseServer, { fetchImpl });
    expect(result).toEqual({ ok: true });
  });

  it("hits the /metadata endpoint on the configured base URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}));
    await probeFhirServer(baseServer, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://example.org/fhir/metadata");
  });

  it("trims trailing slashes from baseUrl when constructing /metadata", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}));
    await probeFhirServer(
      { ...baseServer, baseUrl: "https://example.org/fhir///" },
      { fetchImpl },
    );
    expect(fetchImpl.mock.calls[0]![0]).toBe("https://example.org/fhir/metadata");
  });

  it("forwards Authorization header for bearer auth", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}));
    await probeFhirServer(
      { ...baseServer, authMode: "bearer", bearerToken: "tok-xyz" },
      { fetchImpl },
    );
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: "Bearer tok-xyz",
      Accept: "application/fhir+json",
    });
  });

  it("forwards custom headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}));
    await probeFhirServer(
      {
        ...baseServer,
        headers: [{ key: "Epic-Client-ID", value: "abc-123" }],
      },
      { fetchImpl },
    );
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ "Epic-Client-ID": "abc-123" });
  });

  it("returns an http error on non-2xx", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("nope", { status: 401, statusText: "Unauthorized" }),
    );
    const result = await probeFhirServer(baseServer, { fetchImpl });
    expect(result).toEqual({
      ok: false,
      kind: "http",
      message: "HTTP 401 Unauthorized",
    });
  });

  it("returns a network error with a CORS hint on TypeError", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const result = await probeFhirServer(baseServer, { fetchImpl });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("network");
    expect(result.message).toMatch(/Failed to fetch/);
    expect(result.message).toMatch(/CORS or network issue/);
  });

  it("treats other thrown errors as http-kind so the message surfaces verbatim", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await probeFhirServer(baseServer, { fetchImpl });
    expect(result).toEqual({ ok: false, kind: "http", message: "boom" });
  });
});
