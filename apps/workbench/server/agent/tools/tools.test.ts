import { describe, expect, it } from "vitest";
import type { AgentSession, DataConnection } from "../../../db/schema.js";
import { createRegistry } from "../registry.js";
import { inMemoryLogger } from "../tool-log.js";
import {
  getPatient,
  searchAllergyIntolerancesForPatient,
  searchConditionsForPatient,
  searchEncountersForPatient,
  searchMedicationRequestsForPatient,
  searchObservationsForPatient,
} from "./index.js";

const SESSION: AgentSession = {
  id: "sess_1",
  connectionId: "conn_1",
  patientId: "pat-1",
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

const CONNECTION: DataConnection = {
  id: "conn_1",
  name: "test",
  kind: "fhir_clinical",
  baseUrl: "https://upstream.test/fhir",
  authType: "bearer",
  authToken: "secret-tok",
  createdAt: "2026-04-30T00:00:00.000Z",
  updatedAt: "2026-04-30T00:00:00.000Z",
  lastCapabilityAt: null,
  lastCapabilityStatus: null,
  lastCapabilityFhirVersion: null,
  lastCapabilitySoftware: null,
  lastCapabilityJson: null,
  lastCapabilityError: null,
};

interface FetchSpy {
  fetch: typeof fetch;
  urls: string[];
  authHeaders: string[];
}

function fakeFetch(
  responder: (url: string) => unknown,
  status = 200,
): FetchSpy {
  const urls: string[] = [];
  const authHeaders: string[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    urls.push(String(input));
    authHeaders.push(new Headers(init?.headers).get("Authorization") ?? "");
    const body = responder(String(input));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/fhir+json" },
    });
  };
  return { fetch: fetchFn, urls, authHeaders };
}

function patientBundle(...resources: unknown[]) {
  return {
    resourceType: "Bundle",
    type: "searchset",
    entry: resources.map((resource) => ({ resource })),
  };
}

describe("getPatient", () => {
  it("reads /Patient/:id and returns the resource", async () => {
    const spy = fakeFetch(() => ({
      resourceType: "Patient",
      id: "pat-1",
      gender: "female",
    }));
    const reg = createRegistry([
      getPatient as Parameters<typeof createRegistry>[0][number],
    ]);
    const env = await reg.run({
      toolName: "getPatient",
      rawInput: { patientId: "pat-1" },
      session: SESSION,
      connection: CONNECTION,
      fetchFn: spy.fetch,
    });
    expect(env.ok).toBe(true);
    if (env.ok)
      expect(env.data).toMatchObject({ resourceType: "Patient", id: "pat-1" });
    expect(spy.urls).toEqual(["https://upstream.test/fhir/Patient/pat-1"]);
    expect(spy.authHeaders).toEqual(["Bearer secret-tok"]);
  });
});

describe("searchConditionsForPatient", () => {
  it("forwards patient + clinical-status and unwraps the Bundle", async () => {
    const spy = fakeFetch(() =>
      patientBundle(
        { resourceType: "Condition", id: "c1", clinicalStatus: { coding: [{ code: "active" }] } },
        { resourceType: "Condition", id: "c2" },
      ),
    );
    const reg = createRegistry([
      searchConditionsForPatient as Parameters<typeof createRegistry>[0][number],
    ]);
    const env = await reg.run({
      toolName: "searchConditionsForPatient",
      rawInput: { patientId: "pat-1", clinicalStatus: "active", limit: 50 },
      session: SESSION,
      connection: CONNECTION,
      fetchFn: spy.fetch,
    });
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.data).toHaveLength(2);
      expect(env.count).toBe(2);
    }
    expect(spy.urls[0]).toContain("/Condition?");
    expect(spy.urls[0]).toContain("patient=Patient%2Fpat-1");
    expect(spy.urls[0]).toContain("clinical-status=active");
    expect(spy.urls[0]).toContain("_count=50");
  });

  it("rejects an unknown clinicalStatus at the input boundary", async () => {
    const reg = createRegistry([
      searchConditionsForPatient as Parameters<typeof createRegistry>[0][number],
    ]);
    const env = await reg.run({
      toolName: "searchConditionsForPatient",
      rawInput: { patientId: "pat-1", clinicalStatus: "indeterminate" },
      session: SESSION,
      connection: CONNECTION,
    });
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.reason).toBe("invalid_input");
  });

  it("returns an empty array when the upstream returns zero entries (no inference)", async () => {
    const spy = fakeFetch(() => ({
      resourceType: "Bundle",
      type: "searchset",
      entry: [],
    }));
    const reg = createRegistry([
      searchConditionsForPatient as Parameters<typeof createRegistry>[0][number],
    ]);
    const env = await reg.run({
      toolName: "searchConditionsForPatient",
      rawInput: { patientId: "pat-1" },
      session: SESSION,
      connection: CONNECTION,
      fetchFn: spy.fetch,
    });
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.data).toEqual([]);
      expect(env.count).toBe(0);
    }
  });
});

describe("searchMedicationRequestsForPatient", () => {
  it("forwards status when supplied", async () => {
    const spy = fakeFetch(() => patientBundle());
    const reg = createRegistry([
      searchMedicationRequestsForPatient as Parameters<typeof createRegistry>[0][number],
    ]);
    await reg.run({
      toolName: "searchMedicationRequestsForPatient",
      rawInput: { patientId: "pat-1", status: "active" },
      session: SESSION,
      connection: CONNECTION,
      fetchFn: spy.fetch,
    });
    expect(spy.urls[0]).toContain("/MedicationRequest?");
    expect(spy.urls[0]).toContain("status=active");
  });

  it("rejects an unsupported status value", async () => {
    const reg = createRegistry([
      searchMedicationRequestsForPatient as Parameters<typeof createRegistry>[0][number],
    ]);
    const env = await reg.run({
      toolName: "searchMedicationRequestsForPatient",
      rawInput: { patientId: "pat-1", status: "tentative" },
      session: SESSION,
      connection: CONNECTION,
    });
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.reason).toBe("invalid_input");
  });
});

describe("searchAllergyIntolerancesForPatient", () => {
  it(
    'returns an empty array (count: 0) when no allergies exist — must NOT be ' +
      'summarised as "no known allergies" upstream of this tool',
    async () => {
      const spy = fakeFetch(() => patientBundle());
      const reg = createRegistry([
        searchAllergyIntolerancesForPatient as Parameters<typeof createRegistry>[0][number],
      ]);
      const env = await reg.run({
        toolName: "searchAllergyIntolerancesForPatient",
        rawInput: { patientId: "pat-1" },
        session: SESSION,
        connection: CONNECTION,
        fetchFn: spy.fetch,
      });
      expect(env.ok).toBe(true);
      if (env.ok) {
        expect(env.data).toEqual([]);
        expect(env.count).toBe(0);
      }
    },
  );
});

describe("searchEncountersForPatient", () => {
  it("forwards date range as ge/le query repeats", async () => {
    const spy = fakeFetch(() => patientBundle());
    const reg = createRegistry([
      searchEncountersForPatient as Parameters<typeof createRegistry>[0][number],
    ]);
    await reg.run({
      toolName: "searchEncountersForPatient",
      rawInput: {
        patientId: "pat-1",
        dateRange: { from: "2024-01-01", to: "2024-12-31" },
      },
      session: SESSION,
      connection: CONNECTION,
      fetchFn: spy.fetch,
    });
    expect(spy.urls[0]).toContain("date=ge2024-01-01");
    expect(spy.urls[0]).toContain("date=le2024-12-31");
  });

  it("rejects malformed dateRange.from", async () => {
    const reg = createRegistry([
      searchEncountersForPatient as Parameters<typeof createRegistry>[0][number],
    ]);
    const env = await reg.run({
      toolName: "searchEncountersForPatient",
      rawInput: { patientId: "pat-1", dateRange: { from: "yesterday" } },
      session: SESSION,
      connection: CONNECTION,
    });
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.reason).toBe("invalid_input");
  });
});

describe("searchObservationsForPatient", () => {
  it("forwards category + dateRange together", async () => {
    const spy = fakeFetch(() => patientBundle());
    const reg = createRegistry([
      searchObservationsForPatient as Parameters<typeof createRegistry>[0][number],
    ]);
    await reg.run({
      toolName: "searchObservationsForPatient",
      rawInput: {
        patientId: "pat-1",
        category: "laboratory",
        dateRange: { from: "2024-09-01", to: "2024-12-01" },
        limit: 10,
      },
      session: SESSION,
      connection: CONNECTION,
      fetchFn: spy.fetch,
    });
    expect(spy.urls[0]).toContain("/Observation?");
    expect(spy.urls[0]).toContain("category=laboratory");
    expect(spy.urls[0]).toContain("date=ge2024-09-01");
    expect(spy.urls[0]).toContain("date=le2024-12-01");
    expect(spy.urls[0]).toContain("_count=10");
  });

  it("rejects an unsupported category (e.g. 'survey')", async () => {
    const reg = createRegistry([
      searchObservationsForPatient as Parameters<typeof createRegistry>[0][number],
    ]);
    const env = await reg.run({
      toolName: "searchObservationsForPatient",
      rawInput: { patientId: "pat-1", category: "survey" },
      session: SESSION,
      connection: CONNECTION,
    });
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.reason).toBe("invalid_input");
  });
});

describe("end-to-end: registry + tools + logger", () => {
  it("logs every tool call with shaped entries the audit log can persist later", async () => {
    const spy = fakeFetch(() => ({ resourceType: "Patient", id: "pat-1" }));
    const reg = createRegistry([
      getPatient as Parameters<typeof createRegistry>[0][number],
    ]);
    const logger = inMemoryLogger();
    await reg.run({
      toolName: "getPatient",
      rawInput: { patientId: "pat-1" },
      session: SESSION,
      connection: CONNECTION,
      fetchFn: spy.fetch,
      logger,
    });
    expect(logger.entries).toHaveLength(1);
    const [entry] = logger.entries;
    expect(entry?.tool).toBe("getPatient");
    expect(entry?.toolVersion).toBe("1");
    expect(entry?.sessionId).toBe("sess_1");
    expect(entry?.patientId).toBe("pat-1");
    expect(entry?.envelope.ok).toBe(true);
  });
});
