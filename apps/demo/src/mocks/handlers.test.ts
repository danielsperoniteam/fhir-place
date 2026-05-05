import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * Regression: see https://github.com/danielsperoniteam/fhir-place/issues/8.
 *
 * The MSW handlers previously hardcoded `const BASE = "/fhir"` so the app
 * silently 404'd on GH Pages (served under /fhir-place/). This suite proves
 * the handlers follow `import.meta.env.BASE_URL` — i.e., the FHIR_BASE_URL
 * used by the FhirClient.
 */
describe.each([
  { base: "/", expectedFhir: "/fhir" },
  { base: "/fhir-place/", expectedFhir: "/fhir-place/fhir" },
  { base: "/nested/sub-path/", expectedFhir: "/nested/sub-path/fhir" },
])("mock handlers with BASE_URL=$base", ({ base, expectedFhir }) => {
  let server: ReturnType<typeof setupServer>;
  let fhirBase: string;

  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv("BASE_URL", base);
    const { FHIR_BASE_URL } = await import("../config.js");
    const { handlers } = await import("./handlers.js");
    fhirBase = FHIR_BASE_URL;
    server = setupServer(...handlers);
    server.listen({ onUnhandledRequest: "error" });
  });

  afterAll(() => {
    server.close();
    vi.unstubAllEnvs();
  });

  afterEach(() => server.resetHandlers());

  it("derives the expected FHIR base URL from BASE_URL", () => {
    expect(fhirBase).toBe(expectedFhir);
  });

  it("serves CapabilityStatement at the derived path", async () => {
    const res = await fetch(`http://localhost${fhirBase}/metadata`);
    expect(res.status).toBe(200);
    const cap = await res.json();
    expect(cap.resourceType).toBe("CapabilityStatement");
    expect(
      cap.rest?.[0]?.resource?.some(
        (r: { type: string }) => r.type === "Patient",
      ),
    ).toBe(true);
  });

  it("serves the Patient search at the derived path", async () => {
    const res = await fetch(`http://localhost${fhirBase}/Patient?_count=5`);
    expect(res.status).toBe(200);
    const bundle = await res.json();
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.entry?.length).toBeGreaterThan(0);
  });

  it("serves the Patient detail at the derived path", async () => {
    const res = await fetch(`http://localhost${fhirBase}/Patient/ada`);
    expect(res.status).toBe(200);
    const patient = await res.json();
    expect(patient.resourceType).toBe("Patient");
    expect(patient.id).toBe("ada");
  });

  it("serves the Patient StructureDefinition at the derived path", async () => {
    const res = await fetch(
      `http://localhost${fhirBase}/StructureDefinition/Patient`,
    );
    expect(res.status).toBe(200);
    const sd = await res.json();
    expect(sd.resourceType).toBe("StructureDefinition");
    expect(sd.type).toBe("Patient");
  });
});
