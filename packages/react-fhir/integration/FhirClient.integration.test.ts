import type {
  Bundle,
  CapabilityStatement,
  Observation,
  Patient,
  StructureDefinition,
  ValueSet,
} from "fhir/r4";
import { afterAll, describe, expect, test } from "vitest";
import { codesFromValueSet } from "../src/structure/binding.js";
import { directChildren, walkResource } from "../src/structure/walker.js";
import {
  FHIR_BASE_URL,
  isFhirError,
  makeClient,
  serverReachable,
  TEST_IDENTIFIER_SYSTEM,
} from "./helpers.js";

// Top-level await: probe the server BEFORE tests are registered so we can
// skip the whole describe block (and get an honest "skipped" count) when the
// target is unreachable.
const reachable = await serverReachable();

describe.skipIf(!reachable)(`integration: FhirClient @ ${FHIR_BASE_URL}`, () => {
  const client = makeClient();
  const cleanup: Array<{ type: string; id: string }> = [];

  afterAll(async () => {
    // Best-effort cleanup; HAPI may have wiped them already.
    await Promise.allSettled(
      cleanup.map(({ type, id }) => client.delete(type, id).catch(() => {})),
    );
  });

  test(
    "capabilities() returns a valid R4 CapabilityStatement",
    async () => {
      const cap: CapabilityStatement = await client.capabilities();
      expect(cap.resourceType).toBe("CapabilityStatement");
      expect(cap.fhirVersion).toMatch(/^4\./);
      expect(cap.rest?.[0]?.resource?.length ?? 0).toBeGreaterThan(0);
      expect(
        cap.rest?.[0]?.resource?.some((r) => r.type === "Patient"),
      ).toBe(true);
    },
    30_000,
  );

  test(
    "StructureDefinition for Patient walks cleanly through directChildren()",
    async () => {
      const sd = await client.read<StructureDefinition>(
        "StructureDefinition",
        "Patient",
      );
      expect(sd.kind).toBe("resource");
      expect(sd.type).toBe("Patient");
      const kids = directChildren(sd, "Patient");
      const paths = kids.map((k) => k.path);
      // A handful of well-known R4 Patient elements that must always be present.
      for (const p of ["Patient.id", "Patient.name", "Patient.gender", "Patient.birthDate"]) {
        expect(paths).toContain(p);
      }
    },
    30_000,
  );

  test(
    "create → read → update → search → delete roundtrip on Patient",
    async () => {
      const unique = (globalThis.crypto ?? require("crypto")).randomUUID();
      const seed: Patient = {
        resourceType: "Patient",
        identifier: [
          { system: TEST_IDENTIFIER_SYSTEM, value: unique, use: "usual" },
        ],
        name: [
          {
            given: ["Integration"],
            family: `Test-${unique.slice(0, 8)}`,
            use: "official",
          },
        ],
        gender: "other",
        birthDate: "2000-01-01",
      };

      // create
      const created = await client.create<Patient>(seed);
      expect(created.id).toBeTruthy();
      expect(created.meta?.versionId).toBeTruthy();
      cleanup.push({ type: "Patient", id: created.id! });

      // read
      const read = await client.read<Patient>("Patient", created.id!);
      expect(read.id).toBe(created.id);
      expect(read.name?.[0]?.given).toEqual(["Integration"]);

      // update — bump the birth date and confirm the server bumps versionId
      const updated = await client.update<Patient>({
        ...read,
        id: read.id!,
        birthDate: "2000-02-02",
      });
      expect(updated.birthDate).toBe("2000-02-02");
      expect(updated.meta?.versionId).not.toBe(read.meta?.versionId);

      // search by our unique identifier — should find exactly this resource
      const bundle: Bundle<Patient> = await client.search<Patient>("Patient", {
        identifier: `${TEST_IDENTIFIER_SYSTEM}|${unique}`,
      });
      expect(bundle.resourceType).toBe("Bundle");
      expect(bundle.type).toBe("searchset");
      expect(bundle.total ?? bundle.entry?.length ?? 0).toBeGreaterThanOrEqual(1);
      const hit = bundle.entry?.find((e) => e.resource?.id === created.id);
      expect(hit).toBeTruthy();

      // delete
      await client.delete("Patient", created.id!);
      cleanup.pop(); // already removed

      // read after delete — HAPI returns 404 or 410; either is acceptable
      const err = await client
        .read<Patient>("Patient", created.id!)
        .catch((e) => e);
      expect(isFhirError(err)).toBe(true);
      expect([404, 410]).toContain(err.status);
    },
    60_000,
  );

  test(
    "readReference() resolves a relative reference between two created resources",
    async () => {
      const unique = (globalThis.crypto ?? require("crypto")).randomUUID();

      const patient = await client.create<Patient>({
        resourceType: "Patient",
        identifier: [{ system: TEST_IDENTIFIER_SYSTEM, value: unique }],
        name: [{ given: ["Ref"], family: "Target" }],
        gender: "unknown",
      });
      cleanup.push({ type: "Patient", id: patient.id! });

      const observation = await client.create<Observation>({
        resourceType: "Observation",
        status: "final",
        code: {
          coding: [
            { system: "http://loinc.org", code: "8867-4", display: "Heart rate" },
          ],
          text: "Heart rate",
        },
        subject: { reference: `Patient/${patient.id}` },
        valueQuantity: {
          value: 72,
          unit: "beats/minute",
          system: "http://unitsofmeasure.org",
          code: "/min",
        },
      });
      cleanup.push({ type: "Observation", id: observation.id! });

      const resolved = await client.readReference<Patient>(observation.subject!);
      expect(resolved.resourceType).toBe("Patient");
      expect(resolved.id).toBe(patient.id);
    },
    60_000,
  );

  test(
    "readReference() resolves an absolute reference URL",
    async () => {
      const unique = (globalThis.crypto ?? require("crypto")).randomUUID();
      const patient = await client.create<Patient>({
        resourceType: "Patient",
        identifier: [{ system: TEST_IDENTIFIER_SYSTEM, value: unique }],
        name: [{ given: ["Absolute"], family: "Reference" }],
      });
      cleanup.push({ type: "Patient", id: patient.id! });

      const resolved = await client.readReference<Patient>({
        reference: `${FHIR_BASE_URL}/Patient/${patient.id}`,
      });
      expect(resolved.resourceType).toBe("Patient");
      expect(resolved.id).toBe(patient.id);
    },
    60_000,
  );

  test(
    "readReference() throws on malformed reference",
    async () => {
      const err = await client
        .readReference<Patient>({ reference: "not-a-fhir-reference" })
        .catch((e) => e);
      expect(err).toBeInstanceOf(Error);
    },
    30_000,
  );

  test(
    "walkResource() produces sensible output for a real fetched Patient",
    async () => {
      const unique = (globalThis.crypto ?? require("crypto")).randomUUID();
      const created = await client.create<Patient>({
        resourceType: "Patient",
        identifier: [{ system: TEST_IDENTIFIER_SYSTEM, value: unique }],
        name: [{ given: ["Walker"], family: "Test" }],
        gender: "female",
        birthDate: "1999-09-09",
      });
      cleanup.push({ type: "Patient", id: created.id! });

      const sd = await client.read<StructureDefinition>(
        "StructureDefinition",
        "Patient",
      );
      const walked = walkResource(sd, created);
      const keys = walked.map((w) => w.key);
      expect(keys).toContain("name");
      expect(keys).toContain("gender");
      expect(keys).toContain("birthDate");
      // every emitted element has a label and a value
      for (const w of walked) {
        expect(w.label).toBeTruthy();
        expect(w.value).toBeDefined();
      }
    },
    60_000,
  );

  test(
    "FhirError carries OperationOutcome for a not-found read",
    async () => {
      const err = await client
        .read("Patient", "definitely-does-not-exist-at-all-xyz-123")
        .catch((e) => e);
      expect(isFhirError(err)).toBe(true);
      expect([404, 410, 400]).toContain(err.status);
    },
    30_000,
  );

  test(
    "search on a guaranteed-missing identifier returns an empty searchset",
    async () => {
      const unique = (globalThis.crypto ?? require("crypto")).randomUUID();
      const bundle: Bundle<Patient> = await client.search<Patient>("Patient", {
        identifier: `${TEST_IDENTIFIER_SYSTEM}|missing-${unique}`,
      });
      expect(bundle.resourceType).toBe("Bundle");
      expect(bundle.type).toBe("searchset");
      expect(bundle.total ?? 0).toBe(0);
      expect((bundle.entry ?? []).length).toBe(0);
    },
    30_000,
  );

  test(
    "ValueSet/$expand on administrative-gender returns codes including 'female' (#29)",
    async () => {
      // useValueSet's first-step lookup. Real HAPI exposes $expand for the
      // core R4 ValueSets — if this regresses we want to know.
      const url = "http://hl7.org/fhir/ValueSet/administrative-gender";
      const vs = await client.request<ValueSet>({
        path: `/ValueSet/$expand?url=${encodeURIComponent(url)}`,
      });
      expect(vs.resourceType).toBe("ValueSet");
      const codes = codesFromValueSet(vs).map((c) => c.code);
      expect(codes).toContain("female");
      expect(codes).toContain("male");
      // sanity: codesFromValueSet handled whatever shape HAPI returned
      expect(codes.length).toBeGreaterThanOrEqual(2);
    },
    30_000,
  );

  test(
    "ValueSet?url=... fallback yields a usable concept list for goal-status (#29)",
    async () => {
      // useValueSet's second-step lookup: when $expand is unavailable or
      // empty, search-by-url should still return a ValueSet whose
      // compose.include we can flatten via codesFromValueSet.
      const url = "http://hl7.org/fhir/ValueSet/goal-status";
      const bundle = await client.search<ValueSet>("ValueSet", { url });
      const vs = bundle.entry?.[0]?.resource;
      // HAPI might not have this VS at all; tolerate that by skipping the
      // assertion rather than failing — the fallback chain in useValueSet
      // ends at the bundled core copy when the server has neither.
      if (!vs) {
        // eslint-disable-next-line no-console
        console.warn(
          `[integration] HAPI returned no ValueSet for ${url}; skipping fallback assertions.`,
        );
        return;
      }
      const codes = codesFromValueSet(vs).map((c) => c.code);
      expect(codes).toContain("active");
      expect(codes).toContain("planned");
    },
    30_000,
  );

  test(
    "pagination follows Bundle.link[rel=next] across multiple pages (#29)",
    async () => {
      // Create 25 tagged patients, search with _count=10, follow next links
      // until exhausted, and assert the cumulative ids match what we created.
      const unique = (globalThis.crypto ?? require("crypto")).randomUUID();
      const tagSystem = TEST_IDENTIFIER_SYSTEM;
      const tagCode = `paginate-${unique.slice(0, 8)}`;
      const created: Patient[] = [];
      for (let i = 0; i < 25; i++) {
        const p = await client.create<Patient>({
          resourceType: "Patient",
          identifier: [
            { system: TEST_IDENTIFIER_SYSTEM, value: `${unique}-${i}` },
          ],
          meta: { tag: [{ system: tagSystem, code: tagCode }] },
          name: [{ family: `Page-${unique.slice(0, 8)}-${i}` }],
        });
        cleanup.push({ type: "Patient", id: p.id! });
        created.push(p);
      }

      const expectedIds = new Set(created.map((p) => p.id!));
      const seen = new Set<string>();
      let nextUrl: string | undefined = undefined;
      let pages = 0;
      const MAX_PAGES = 10; // hard cap on the loop in case HAPI never stops

      do {
        const bundle: Bundle<Patient> = nextUrl
          ? await client.request<Bundle<Patient>>({ path: nextUrl })
          : await client.search<Patient>("Patient", {
              _tag: `${tagSystem}|${tagCode}`,
              _count: 10,
            });
        for (const e of bundle.entry ?? []) {
          if (e.resource?.id) seen.add(e.resource.id);
        }
        nextUrl = bundle.link?.find((l) => l.relation === "next")?.url;
        pages += 1;
      } while (nextUrl && pages < MAX_PAGES);

      // We should have walked ≥ 3 pages (25 / 10 = 3) and recovered every
      // tagged Patient. Use intersection rather than equality because HAPI
      // is shared — other test runs may have used the same _id but never
      // the same _tag, so this set is exclusive to us.
      expect(pages).toBeGreaterThanOrEqual(3);
      for (const id of expectedIds) {
        expect(seen.has(id), `missing ${id} after pagination`).toBe(true);
      }
    },
    180_000, // 25 creates + 3 pages on shared HAPI can be slow
  );

  test(
    "ReferencePicker-style search by partial name returns a well-shaped Bundle (#29)",
    async () => {
      // Underlying server contract for <ReferencePicker>: search by `name`
      // returns a bundle whose entries each have a Patient `resource` with
      // an id and a name field — that's the minimum the picker needs to
      // render labels via formatReferenceLabel().
      const unique = (globalThis.crypto ?? require("crypto")).randomUUID();
      const family = `Picker-${unique.slice(0, 8)}`;
      const created = await client.create<Patient>({
        resourceType: "Patient",
        identifier: [{ system: TEST_IDENTIFIER_SYSTEM, value: unique }],
        name: [{ given: ["Search"], family }],
      });
      cleanup.push({ type: "Patient", id: created.id! });

      const bundle = await client.search<Patient>("Patient", {
        name: family,
        _count: 10,
      });
      expect(bundle.resourceType).toBe("Bundle");
      expect(bundle.type).toBe("searchset");
      const hit = bundle.entry?.find((e) => e.resource?.id === created.id);
      expect(hit, `did not find Patient ${created.id} in search-by-name`).toBeTruthy();
      expect(hit!.resource?.name?.[0]?.family).toBe(family);
    },
    60_000,
  );

  test(
    "search with _id=a,b,c returns N resources in one call (batch read primitive)",
    async () => {
      // Underlying server contract that useResources / useReadReferences
      // depend on. Create 5 Patients with unique identifiers, fetch them
      // all in one search, and assert the round-trip is exact.
      const unique = (globalThis.crypto ?? require("crypto")).randomUUID();
      const created: Patient[] = [];
      for (let i = 0; i < 5; i++) {
        const seed: Patient = {
          resourceType: "Patient",
          identifier: [
            { system: TEST_IDENTIFIER_SYSTEM, value: `${unique}-${i}`, use: "usual" },
          ],
          name: [{ family: `Batch-${unique.slice(0, 8)}-${i}` }],
        };
        const p = await client.create<Patient>(seed);
        cleanup.push({ type: "Patient", id: p.id! });
        created.push(p);
      }

      const ids = created.map((p) => p.id!);
      const bundle = await client.search<Patient>("Patient", {
        _id: ids.join(","),
      });
      const got = (bundle.entry ?? [])
        .map((e) => e.resource?.id!)
        .filter(Boolean)
        .sort();
      expect(got).toEqual([...ids].sort());
    },
    60_000,
  );
});
