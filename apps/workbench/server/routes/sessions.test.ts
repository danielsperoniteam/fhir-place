import { afterEach, describe, expect, it } from "vitest";
import { jsonResponse, makeTestApp } from "../test-utils.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function newApp(fetchFn?: typeof fetch) {
  const t = makeTestApp({ fetchFn });
  cleanups.push(t.cleanup);
  return t;
}

async function createConn(
  app: ReturnType<typeof makeTestApp>["app"],
  overrides: Partial<{
    name: string;
    baseUrl: string;
    authType: "none" | "bearer";
    authToken: string;
  }> = {},
) {
  const res = await app.request("/api/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: overrides.name ?? "test",
      kind: "fhir_clinical",
      baseUrl: overrides.baseUrl ?? "https://upstream.test/fhir",
      authType: overrides.authType ?? "none",
      ...(overrides.authToken ? { authToken: overrides.authToken } : {}),
    }),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.connection.id as string;
}

async function createSession(
  app: ReturnType<typeof makeTestApp>["app"],
  connectionId: string,
  patientId: string,
) {
  const res = await app.request("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, patientId }),
  });
  expect(res.status).toBe(201);
  const body = await res.json();
  return body.session.id as string;
}

describe("/api/sessions", () => {
  it("creates a session bound to a connection + patient", async () => {
    const { app } = newApp();
    const cid = await createConn(app);
    const res = await app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: cid, patientId: "pat-1" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.session).toMatchObject({
      connectionId: cid,
      patientId: "pat-1",
    });
  });

  it("rejects an invalid FHIR id at the boundary", async () => {
    const { app } = newApp();
    const cid = await createConn(app);
    const res = await app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: cid, patientId: "../bad" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when creating against an unknown connection", async () => {
    const { app } = newApp();
    const res = await app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: "nope", patientId: "pat-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("lists registered tools at /api/sessions/tools", async () => {
    const { app } = newApp();
    const res = await app.request("/api/sessions/tools");
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "getPatient",
        "searchConditionsForPatient",
        "searchMedicationRequestsForPatient",
        "searchAllergyIntolerancesForPatient",
        "searchEncountersForPatient",
        "searchObservationsForPatient",
      ]),
    );
  });
});

describe("POST /api/sessions/:sid/tools/:toolName", () => {
  it("invokes a tool and returns the envelope on success (HTTP 200)", async () => {
    const { app } = newApp(async (input) => {
      const url = String(input);
      if (url.endsWith("/Patient/pat-1")) {
        return jsonResponse({ resourceType: "Patient", id: "pat-1" });
      }
      return jsonResponse({ resourceType: "Bundle", entry: [] });
    });
    const cid = await createConn(app);
    const sid = await createSession(app, cid, "pat-1");

    const res = await app.request(
      `/api/sessions/${sid}/tools/getPatient`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: "pat-1" }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      tool: "getPatient",
      toolVersion: "1",
    });
    expect(body.data).toMatchObject({ resourceType: "Patient", id: "pat-1" });
  });

  it("returns 404 for an unknown tool name with reason: 'unknown_tool'", async () => {
    const { app } = newApp();
    const cid = await createConn(app);
    const sid = await createSession(app, cid, "pat-1");

    const res = await app.request(`/api/sessions/${sid}/tools/noSuch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: "pat-1" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "unknown_tool",
    });
  });

  it("returns 403 with reason: 'unauthorized_patient' when body patientId differs from session", async () => {
    const { app } = newApp();
    const cid = await createConn(app);
    const sid = await createSession(app, cid, "pat-1");

    const res = await app.request(
      `/api/sessions/${sid}/tools/getPatient`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: "ANOTHER" }),
      },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false,
      reason: "unauthorized_patient",
    });
  });

  it("returns 400 with reason: 'invalid_input' for missing patientId", async () => {
    const { app } = newApp();
    const cid = await createConn(app);
    const sid = await createSession(app, cid, "pat-1");

    const res = await app.request(
      `/api/sessions/${sid}/tools/getPatient`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      reason: "invalid_input",
    });
  });

  it("returns 404 with reason: 'session_not_found' for unknown session", async () => {
    const { app } = newApp();
    const res = await app.request("/api/sessions/no-session/tools/getPatient", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: "pat-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("logs the tool call (in-memory logger captures every invocation)", async () => {
    const t = newApp(async () =>
      jsonResponse({ resourceType: "Patient", id: "pat-1" }),
    );
    const cid = await createConn(t.app);
    const sid = await createSession(t.app, cid, "pat-1");

    await t.app.request(`/api/sessions/${sid}/tools/getPatient`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: "pat-1" }),
    });
    await t.app.request(`/api/sessions/${sid}/tools/getPatient`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: "ANOTHER" }),
    });
    expect(t.logger.entries).toHaveLength(2);
    const first = t.logger.entries[0];
    const second = t.logger.entries[1];
    expect(first?.envelope.ok).toBe(true);
    expect(second?.envelope.ok).toBe(false);
    if (second && !second.envelope.ok) {
      expect(second.envelope.reason).toBe("unauthorized_patient");
    }
  });

  it("never returns the connection's auth token in any envelope", async () => {
    const t = newApp(async () =>
      jsonResponse({ resourceType: "Patient", id: "pat-1" }),
    );
    const cid = await createConn(t.app, {
      authType: "bearer",
      authToken: "super-secret-tok",
    });
    const sid = await createSession(t.app, cid, "pat-1");

    const res = await t.app.request(
      `/api/sessions/${sid}/tools/getPatient`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: "pat-1" }),
      },
    );
    const text = await res.text();
    expect(text).not.toContain("super-secret-tok");
  });
});
