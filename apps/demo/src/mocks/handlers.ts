import { http, HttpResponse } from "msw";
import type { Communication, Patient, Resource } from "fhir/r4";
import { FHIR_BASE_URL } from "../config.js";
import {
  allergiesFor,
  carePlansFor,
  compartmentStructureDefinitions,
  conditionsFor,
  diagnosticReportsFor,
  encountersFor,
  immunizationsFor,
  medicationRequestsFor,
  observationsFor,
  observationStructureDefinition,
  patients,
  patientStructureDefinition,
  proceduresFor,
  searchBundle,
} from "./fixtures.js";

// Share the base URL with the client. Dev → "/fhir"; GH Pages → "/fhir-place/fhir".
// A hardcoded "/fhir" here caused a production-only 404 when the app was served
// under a non-root base path (see #8).
const BASE = FHIR_BASE_URL;

// Mutable in-memory store so create/update/delete actually persist during the session.
const store = {
  patients: new Map<string, Patient>(patients.map((p) => [p.id!, p])),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const okJson = (data: any, init?: ResponseInit) =>
  HttpResponse.json(data, {
    ...init,
    headers: {
      "Content-Type": "application/fhir+json",
      ...init?.headers,
    },
  });

const readSearch = [{ code: "read" }, { code: "search-type" }];
const capabilityResource = (
  type: string,
  searchParam: Array<{ name: string; type: "token" | "reference" | "date"; documentation?: string }>,
) => ({
  type,
  interaction: readSearch,
  searchParam,
});

export const handlers = [
  http.get(`*${BASE}/metadata`, () =>
    okJson({
      resourceType: "CapabilityStatement",
      status: "active",
      date: "2024-01-01",
      kind: "instance",
      fhirVersion: "4.0.1",
      format: ["json"],
      rest: [
        {
          mode: "server",
          resource: [
            {
              type: "Patient",
              interaction: [
                { code: "read" },
                { code: "search-type" },
                { code: "create" },
                { code: "update" },
                { code: "delete" },
              ],
              searchParam: [
                { name: "_id", type: "token", documentation: "Logical id" },
                { name: "name", type: "string", documentation: "Any of the names" },
                { name: "family", type: "string", documentation: "Family name" },
                { name: "given", type: "string", documentation: "Given name" },
                { name: "identifier", type: "token" },
                { name: "birthdate", type: "date" },
                { name: "gender", type: "token" },
                { name: "address-city", type: "string" },
                { name: "phone", type: "token" },
                { name: "email", type: "token" },
              ],
            },
            {
              type: "Observation",
              interaction: readSearch,
              searchParam: [
                { name: "_id", type: "token" },
                { name: "code", type: "token" },
                { name: "category", type: "token" },
                { name: "subject", type: "reference" },
                { name: "patient", type: "reference" },
                { name: "status", type: "token" },
                { name: "date", type: "date" },
              ],
            },
            capabilityResource("Condition", [
              { name: "patient", type: "reference" },
              { name: "code", type: "token" },
              { name: "category", type: "token" },
              { name: "clinical-status", type: "token" },
              { name: "onset-date", type: "date" },
            ]),
            capabilityResource("MedicationRequest", [
              { name: "patient", type: "reference" },
              { name: "code", type: "token" },
              { name: "status", type: "token" },
              { name: "intent", type: "token" },
              { name: "authoredon", type: "date" },
            ]),
            capabilityResource("AllergyIntolerance", [
              { name: "patient", type: "reference", documentation: "Who the sensitivity is for" },
              { name: "code", type: "token" },
              { name: "clinical-status", type: "token" },
              { name: "type", type: "token" },
              { name: "category", type: "token" },
            ]),
            capabilityResource("Procedure", [
              { name: "patient", type: "reference" },
              { name: "code", type: "token" },
              { name: "status", type: "token" },
              { name: "date", type: "date" },
            ]),
            capabilityResource("Encounter", [
              { name: "patient", type: "reference" },
              { name: "status", type: "token" },
              { name: "class", type: "token" },
              { name: "type", type: "token" },
              { name: "date", type: "date" },
            ]),
            capabilityResource("Immunization", [
              { name: "patient", type: "reference" },
              { name: "vaccine-code", type: "token" },
              { name: "status", type: "token" },
              { name: "date", type: "date" },
            ]),
            capabilityResource("DiagnosticReport", [
              { name: "patient", type: "reference" },
              { name: "code", type: "token" },
              { name: "category", type: "token" },
              { name: "status", type: "token" },
              { name: "date", type: "date" },
            ]),
            capabilityResource("CarePlan", [
              { name: "patient", type: "reference" },
              { name: "category", type: "token" },
              { name: "status", type: "token" },
              { name: "intent", type: "token" },
              { name: "date", type: "date" },
            ]),
          ],
        },
      ],
    }),
  ),

  http.get(`*${BASE}/StructureDefinition/Patient`, () =>
    okJson(patientStructureDefinition),
  ),
  http.get(`*${BASE}/StructureDefinition/Observation`, () =>
    okJson(observationStructureDefinition),
  ),
  // Minimal SDs for compartment types so ResourceView / ResourceEditor
  // don't hard-fail when the user clicks into a Condition / MedicationRequest /
  // AllergyIntolerance / etc.
  ...compartmentStructureDefinitions.map((sd) =>
    http.get(`*${BASE}/StructureDefinition/${sd.type}`, () => okJson(sd)),
  ),

  http.get(`*${BASE}/Patient`, ({ request }) => {
    const url = new URL(request.url);
    const qp = url.searchParams;
    const name = qp.get("name")?.toLowerCase();
    const family = qp.get("family")?.toLowerCase();
    const given = qp.get("given")?.toLowerCase();
    const gender = qp.get("gender");
    const city = qp.get("address-city")?.toLowerCase();
    const count = Number(qp.get("_count") ?? 20);
    const offset = Number(qp.get("_getpagesoffset") ?? 0);
    const all = Array.from(store.patients.values());
    const filtered = all.filter((p) => {
      if (name && !p.name?.some((n) =>
        (n.family ?? "").toLowerCase().includes(name) ||
        (n.given ?? []).some((g) => g.toLowerCase().includes(name)),
      )) return false;
      if (family && !p.name?.some((n) => (n.family ?? "").toLowerCase().includes(family))) return false;
      if (given && !p.name?.some((n) => (n.given ?? []).some((g) => g.toLowerCase().includes(given)))) return false;
      if (gender && p.gender !== gender) return false;
      if (city && !p.address?.some((a) => (a.city ?? "").toLowerCase().includes(city))) return false;
      return true;
    });
    const page = filtered.slice(offset, offset + count);
    const bundle = searchBundle(page);
    bundle.total = filtered.length;
    const nextOffset = offset + count;
    if (nextOffset < filtered.length) {
      const nextUrl = new URL(url);
      nextUrl.searchParams.set("_getpagesoffset", String(nextOffset));
      bundle.link = [
        { relation: "self", url: request.url },
        { relation: "next", url: nextUrl.toString() },
      ];
    }
    return okJson(bundle);
  }),

  http.get(`*${BASE}/Patient/:id`, ({ params }) => {
    const p = store.patients.get(String(params.id));
    if (!p) {
      return okJson(
        {
          resourceType: "OperationOutcome",
          issue: [
            { severity: "error", code: "not-found", diagnostics: `Patient/${params.id} not found` },
          ],
        },
        { status: 404 },
      );
    }
    return okJson(p);
  }),

  http.post(`*${BASE}/Patient`, async ({ request }) => {
    const body = (await request.json()) as Patient;
    const id = body.id ?? `p-${Date.now()}`;
    const created: Patient = {
      ...body,
      id,
      meta: { versionId: "1", lastUpdated: new Date().toISOString() },
    };
    store.patients.set(id, created);
    return okJson(created, { status: 201 });
  }),

  http.put(`*${BASE}/Patient/:id`, async ({ params, request }) => {
    const id = String(params.id);
    const body = (await request.json()) as Patient;
    const prev = store.patients.get(id);
    const versionId = String(Number(prev?.meta?.versionId ?? "0") + 1);
    const updated: Patient = {
      ...body,
      id,
      meta: { versionId, lastUpdated: new Date().toISOString() },
    };
    store.patients.set(id, updated);
    return okJson(updated);
  }),

  http.delete(`*${BASE}/Patient/:id`, ({ params }) => {
    store.patients.delete(String(params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`*${BASE}/Observation`, ({ request }) => {
    const url = new URL(request.url);
    const subject = url.searchParams.get("subject") ?? url.searchParams.get("patient");
    const id = subject?.replace(/^Patient\//, "") ?? "";
    return okJson(searchBundle(observationsFor(id)));
  }),

  // Compartment search + instance-read handlers. Searches scope by
  // `?patient=` / `?subject=`; instance reads look the id up in the
  // preseeded fixture set.
  ...(() => {
    const patientIdFromRequest = (request: Request): string => {
      const qp = new URL(request.url).searchParams;
      const ref = qp.get("patient") ?? qp.get("subject");
      return ref?.replace(/^Patient\//, "") ?? "";
    };
    // All fixture patients we have data for. Today only "ada".
    const ALL_PATIENT_IDS = ["ada"];
    const compartmentHandlers = <T extends Resource>(
      type: string,
      source: (id: string) => T[],
    ) => {
      const store = new Map<string, T>();
      for (const pid of ALL_PATIENT_IDS) {
        for (const r of source(pid)) {
          if (r.id) store.set(r.id, r);
        }
      }
      return [
        http.get(`*${BASE}/${type}`, ({ request }) => {
          const fixtures = source(patientIdFromRequest(request));
          // Created-during-session resources of this type that don't belong to
          // a patient compartment — surface them on the unscoped index search
          // so e2e create flows can immediately see what they just made.
          const url = new URL(request.url);
          const hasPatientFilter = url.searchParams.has("patient") || url.searchParams.has("subject");
          const extras = hasPatientFilter
            ? []
            : Array.from(store.values()).filter(
                (r) => !fixtures.some((f) => f.id === r.id),
              );
          return okJson(searchBundle([...fixtures, ...extras]));
        }),
        http.get(`*${BASE}/${type}/:id`, ({ params }) => {
          const hit = store.get(String(params.id));
          if (hit) return okJson(hit);
          return okJson(
            {
              resourceType: "OperationOutcome",
              issue: [
                { severity: "error", code: "not-found", diagnostics: `${type}/${params.id} not found` },
              ],
            },
            { status: 404 },
          );
        }),
        http.post(`*${BASE}/${type}`, async ({ request }) => {
          const body = (await request.json()) as T & { id?: string };
          const id = body.id ?? `${type.toLowerCase()}-${Date.now()}`;
          const created = {
            ...body,
            id,
            resourceType: type,
            meta: { versionId: "1", lastUpdated: new Date().toISOString() },
          } as T;
          store.set(id, created);
          return okJson(created, { status: 201 });
        }),
        http.put(`*${BASE}/${type}/:id`, async ({ params, request }) => {
          const id = String(params.id);
          const body = (await request.json()) as T;
          const prev = store.get(id);
          const versionId = String(
            Number((prev as { meta?: { versionId?: string } } | undefined)?.meta?.versionId ?? "0") + 1,
          );
          const updated = {
            ...body,
            id,
            meta: { versionId, lastUpdated: new Date().toISOString() },
          } as T;
          store.set(id, updated);
          return okJson(updated);
        }),
        http.delete(`*${BASE}/${type}/:id`, ({ params }) => {
          store.delete(String(params.id));
          return new HttpResponse(null, { status: 204 });
        }),
      ];
    };
    return [
      ...compartmentHandlers("Condition", conditionsFor),
      ...compartmentHandlers("MedicationRequest", medicationRequestsFor),
      ...compartmentHandlers("AllergyIntolerance", allergiesFor),
      ...compartmentHandlers("Procedure", proceduresFor),
      ...compartmentHandlers("Encounter", encountersFor),
      ...compartmentHandlers("Immunization", immunizationsFor),
      ...compartmentHandlers("DiagnosticReport", diagnosticReportsFor),
      ...compartmentHandlers("CarePlan", carePlansFor),
    ];
  })(),

  // Minimal Communication fixture — auto-derived resource type with the
  // structural-leaf-collision shape (#400): `basedOn.reference`,
  // `partOf.reference`, `recipient.reference`, and `category.coding.system`
  // would all label as generic "Reference" / "System" headers in the
  // column picker without parent-element disambiguation.
  http.get(`*${BASE}/Communication`, () => {
    const communication: Communication = {
      resourceType: "Communication",
      id: "comm-1",
      status: "completed",
      basedOn: [{ reference: "CommunicationRequest/cr-0" }],
      partOf: [{ reference: "CarePlan/cp-1" }],
      subject: { reference: "Patient/ada" },
      recipient: [{ reference: "Practitioner/pr-1" }],
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/communication-category",
              code: "notification",
            },
          ],
        },
      ],
      meta: { versionId: "1", lastUpdated: "2024-10-01T12:00:00Z" },
    };
    return okJson(searchBundle([communication]));
  }),
];
