#!/usr/bin/env node
/**
 * Queries two FHIR servers, scores patients by resource-type breadth and
 * volume, and prints the top candidates for use as stable test fixtures.
 *
 * Usage:
 *   node scripts/discover-test-patients.mjs
 *
 * Override servers with env vars:
 *   SERVER1=https://r4.smarthealthit.org \
 *   SERVER2=https://hapi.fhir.org/baseR4 \
 *   SAMPLE=40 \
 *     node scripts/discover-test-patients.mjs
 *
 * PATIENT_QUERY narrows the patient pool (filters appended to /Patient).
 * Examples:
 *   PATIENT_QUERY='birthdate=gt2010-01-01'                    # pediatric
 *   PATIENT_QUERY='_has:AllergyIntolerance:patient:_id:exists=true'  # has allergies
 */

const SERVERS = [
  { name: "SMART Health IT", url: process.env.SERVER1 ?? "https://r4.smarthealthit.org" },
  { name: "HAPI public",     url: process.env.SERVER2 ?? "https://hapi.fhir.org/baseR4" },
];

const COMPARTMENT_TYPES = [
  "Condition",
  "Observation",
  "MedicationRequest",
  "Encounter",
  "Procedure",
  "Immunization",
  "AllergyIntolerance",
  "DiagnosticReport",
  "CarePlan",
];

const SAMPLE_SIZE   = parseInt(process.env.SAMPLE ?? "40", 10);
const TOP_N         = parseInt(process.env.TOP    ?? "4",  10);
const CONCURRENCY   = 6;
const PATIENT_QUERY = (process.env.PATIENT_QUERY ?? "").trim();

async function fhirGet(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/fhir+json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

/** Returns [count, error] — null error means success. */
async function countResources(base, type, patientId) {
  try {
    const bundle = await fhirGet(
      `${base}/${type}?patient=${patientId}&_summary=count`,
    );
    return [bundle.total ?? 0, null];
  } catch (err) {
    return [0, err.message];
  }
}

async function pool(tasks, concurrency) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function fetchPatientIds(base, count) {
  const ids = [];
  const filter = PATIENT_QUERY ? `&${PATIENT_QUERY}` : "";
  let url = `${base}/Patient?_count=${count}${filter}`;
  while (url && ids.length < count) {
    const bundle = await fhirGet(url);
    for (const e of bundle.entry ?? []) {
      if (e.resource?.id) ids.push(e.resource.id);
    }
    const next = (bundle.link ?? []).find((l) => l.relation === "next");
    url = next ? next.url : null;
  }
  return ids.slice(0, count);
}

async function fetchPatient(base, id) {
  try {
    return await fhirGet(`${base}/Patient/${id}`);
  } catch {
    return null;
  }
}

function patientLabel(p) {
  if (!p) return "(unknown)";
  const name = p.name?.[0];
  const given = name?.given?.join(" ") ?? "";
  const family = name?.family ?? "";
  const dob = p.birthDate ?? "?";
  const gender = p.gender ?? "?";
  return `${given} ${family} | ${gender} | DOB: ${dob}`.trim();
}

async function scoreServer(server) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`Server: ${server.name}  (${server.url})`);
  if (PATIENT_QUERY) console.log(`Filter: ${PATIENT_QUERY}`);
  console.log("═".repeat(60));

  console.log(`Fetching up to ${SAMPLE_SIZE} patients…`);
  let ids;
  try {
    ids = await fetchPatientIds(server.url, SAMPLE_SIZE);
  } catch (err) {
    console.error(`  ✗ Failed to list patients: ${err.message}`);
    return [];
  }
  console.log(`  Found ${ids.length} patient IDs in sample.`);

  const scores = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    process.stdout.write(`  [${i + 1}/${ids.length}] Patient ${id} … `);

    const results = await pool(
      COMPARTMENT_TYPES.map((type) => () => countResources(server.url, type, id)),
      CONCURRENCY,
    );

    const errors  = results.filter(([, e]) => e !== null).map(([, e]) => e);
    const byType  = Object.fromEntries(
      COMPARTMENT_TYPES.map((t, j) => [t, results[j][0]]),
    );
    const total   = results.reduce((a, [n]) => a + n, 0);
    const breadth = results.filter(([n]) => n > 0).length;
    const score   = total + breadth * 15;

    const errNote = errors.length ? ` ⚠ ${errors.length} query error(s)` : "";
    console.log(`total=${total} breadth=${breadth}/${COMPARTMENT_TYPES.length} score=${score}${errNote}`);
    if (errors.length) errors.forEach((e) => console.log(`      ↳ ${e}`));
    scores.push({ id, byType, total, breadth, score, errors: errors.length, server: server.name, base: server.url });
  }

  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, TOP_N);

  console.log(`\nTop ${TOP_N} for ${server.name}:`);
  for (const p of top) {
    const resource = await fetchPatient(p.base, p.id);
    const label    = patientLabel(resource);
    const bar      = COMPARTMENT_TYPES.map(
      (t) => `${t}: ${p.byType[t]}`,
    ).join(" | ");
    console.log(`\n  ★ ${p.id}`);
    console.log(`    ${label}`);
    console.log(`    ${bar}`);
    console.log(`    score=${p.score}  total=${p.total}  breadth=${p.breadth}/${COMPARTMENT_TYPES.length}`);
    p.label = label;
  }

  return top;
}

async function main() {
  const allTop = [];
  for (const server of SERVERS) {
    const top = await scoreServer(server);
    allTop.push(...top);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("FINAL CANDIDATES — copy these into test-patients.json");
  console.log("═".repeat(60));
  const output = allTop.map((p) => ({
    id:      p.id,
    label:   p.label,
    server:  p.server,
    score:   p.score,
    total:   p.total,
    breadth: p.breadth,
    byType:  p.byType,
  }));
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
