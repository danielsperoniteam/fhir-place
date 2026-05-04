#!/usr/bin/env node
// Idempotent label bootstrap for samsuffolksperoni/fhir-place.
//
// - Ensures every canonical label in CANONICAL exists with the right color
//   and description; updates any whose color/description drifted.
// - Deletes legacy labels in LEGACY_DELETE that have ZERO attached issues
//   (open or closed). Skips with a warning if any issues still reference
//   the legacy label.
//
// Required env:
//   GITHUB_TOKEN   token with `repo` scope (or workflow GITHUB_TOKEN)
// Optional env:
//   GITHUB_REPOSITORY   "owner/repo" (defaults to samsuffolksperoni/fhir-place)
//   DRY_RUN             "1" to log without making changes

const REPO = process.env.GITHUB_REPOSITORY || 'samsuffolksperoni/fhir-place';
const TOKEN = process.env.GITHUB_TOKEN;
const DRY_RUN = process.env.DRY_RUN === '1';
const API = 'https://api.github.com';

if (!TOKEN) {
  console.error('GITHUB_TOKEN is required');
  process.exit(1);
}

const CANONICAL = [
  // type:
  { name: 'type: bug', color: 'd73a4a', description: 'Defect or regression. Bugs default to priority: high.' },
  { name: 'type: feature', color: 'a2eeef', description: 'New capability or user-visible enhancement.' },
  { name: 'type: tech-debt', color: 'd4c5f9', description: 'Refactor, cleanup, build/perf, or non-functional improvement.' },
  { name: 'type: docs', color: '0075ca', description: 'Documentation only.' },
  { name: 'type: spike', color: 'fbca04', description: 'Time-boxed exploration; no shipping commitment.' },
  { name: 'type: epic', color: '5319e7', description: 'Tracker for sub-issues. Closes when all sub-issues close.' },
  // area:
  { name: 'area: fhir-explorer', color: '1d76db', description: 'apps/demo (canonical name: fhir-explorer; legacy: demo, fhir-ui, live-monitor).' },
  { name: 'area: react-fhir', color: '0e8a16', description: 'packages/react-fhir — the published library.' },
  { name: 'area: workbench', color: '8b00ff', description: 'Workbench app/page surface.' },
  { name: 'area: cql', color: 'c5def5', description: '@fhir-place/cql companion package.' },
  { name: 'area: mcp', color: 'c5def5', description: '@fhir-place/mcp companion package.' },
  { name: 'area: infra', color: '393b3a', description: 'CI, build tooling, deployment.' },
  { name: 'area: auth', color: 'b60205', description: 'Authentication / authorization.' },
  { name: 'area: security', color: 'b60205', description: 'Security-sensitive change or review.' },
  // priority:
  { name: 'priority: high', color: 'e11d21', description: 'Top of the queue.' },
  { name: 'priority: medium', color: 'fbca04', description: 'Default priority.' },
  { name: 'priority: low', color: '0e8a16', description: 'Nice-to-have.' },
  // status:
  { name: 'status: blocked', color: '000000', description: 'Cannot progress until a referenced blocker resolves.' },
  { name: 'status: needs-triage', color: 'cccccc', description: 'No type/area/priority set, or PM agent unsure — needs human review.' },
  { name: 'status: in-progress', color: 'fbca04', description: 'Engineer-dispatch agent has claimed this issue. Bot-managed; humans should not edit.' },
  { name: 'status: needs-human', color: 'd93f0b', description: 'Engineer-dispatch agent stopped — see latest comment for the failure.' },
  { name: 'status: agent-paused', color: '000000', description: 'Kill switch on the dispatch tracking issue — dispatchers skip while present.' },
  // origin:
  { name: 'origin: bot-filed', color: 'ededed', description: 'Auto-filed by automation (e.g. live-site-monitor.yml).' },
  // phase tracking — preserved as-is, no prefix (project-tracking convention).
  { name: 'phase-0', color: 'fef2c0', description: 'Phase 0 epic.' },
  { name: 'phase-1', color: 'fef2c0', description: 'Phase 1 epic.' },
  { name: 'phase-2', color: 'fef2c0', description: 'Phase 2 epic.' },
  { name: 'phase-3', color: 'fef2c0', description: 'Phase 3 epic.' },
  { name: 'fhir-workbench-phase-a', color: 'fef2c0', description: 'Workbench Phase A epic.' },
];

const LEGACY_DELETE = [
  'enhancement',     // → type: feature
  'bug',             // → type: bug
  'tech-debt',       // → type: tech-debt   (note: same name, different label id; old one orphaned)
  'epic',            // → type: epic
  'meta',            // → type: epic
  'demo',            // → area: fhir-explorer
  'live-monitor',    // → origin: bot-filed
  'workbench',       // → area: workbench
  'frontend',        // dropped (subsumed by area:)
  'backend',         // dropped (subsumed by area:)
  'infra',           // → area: infra
  'auth',            // → area: auth
  'security',        // → area: security
  'blocked',         // → status: blocked
];

async function gh(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function listAllLabels() {
  const out = [];
  let page = 1;
  // Pre-existing labels in this repo: the response includes `name` only; pagination via Link header.
  while (true) {
    const batch = await gh('GET', `/repos/${REPO}/labels?per_page=100&page=${page}`);
    if (!batch || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return out;
}

async function countIssuesWithLabel(label) {
  // search counts both open + closed
  const q = encodeURIComponent(`repo:${REPO} label:"${label}"`);
  const res = await gh('GET', `/search/issues?q=${q}&per_page=1`);
  return res?.total_count ?? 0;
}

async function ensureLabel(spec, existing) {
  const cur = existing.find((l) => l.name === spec.name);
  if (!cur) {
    console.log(`+ create  ${spec.name}  #${spec.color}`);
    if (!DRY_RUN) await gh('POST', `/repos/${REPO}/labels`, spec);
    return;
  }
  if (cur.color === spec.color && (cur.description ?? '') === spec.description) {
    return; // already in the right state
  }
  console.log(`~ update  ${spec.name}  ${cur.color} → ${spec.color}`);
  if (!DRY_RUN) {
    await gh('PATCH', `/repos/${REPO}/labels/${encodeURIComponent(cur.name)}`, {
      new_name: spec.name,
      color: spec.color,
      description: spec.description,
    });
  }
}

async function maybeDeleteLegacy(name, existing) {
  if (!existing.some((l) => l.name === name)) return;
  const count = await countIssuesWithLabel(name);
  if (count > 0) {
    console.log(`! skip    ${name} — still attached to ${count} issue(s)`);
    return;
  }
  console.log(`- delete  ${name} (orphaned)`);
  if (!DRY_RUN) await gh('DELETE', `/repos/${REPO}/labels/${encodeURIComponent(name)}`);
}

async function main() {
  console.log(`sync-labels: repo=${REPO} dry_run=${DRY_RUN}`);
  const existing = await listAllLabels();
  console.log(`found ${existing.length} existing labels`);

  for (const spec of CANONICAL) {
    await ensureLabel(spec, existing);
  }

  // Re-list because we may have created/updated labels above.
  const refreshed = await listAllLabels();
  for (const name of LEGACY_DELETE) {
    await maybeDeleteLegacy(name, refreshed);
  }

  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
