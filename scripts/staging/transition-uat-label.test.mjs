// Tests for transition-uat-label.mjs
//
// Run with:
//   node --test scripts/staging/transition-uat-label.test.mjs
//
// Uses built-in node:test — no test framework dependency, no network. The
// tested module exposes `transition()` with injectable getLabels/removeLabel/
// addLabel hooks so we never shell out to `gh` during tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPolicy, transition } from "./transition-uat-label.mjs";

function harness(initialLabels) {
  const calls = { removed: [], added: [], reads: 0 };
  return {
    calls,
    getLabelsFn: () => {
      calls.reads++;
      return [...initialLabels];
    },
    removeLabelFn: (_repo, _pr, label) => {
      calls.removed.push(label);
    },
    addLabelFn: (_repo, _pr, label) => {
      calls.added.push(label);
    },
  };
}

test("uat: skip is a no-op (no reads, no writes after first read)", () => {
  const h = harness(["uat: skip", "uat: complete"]);
  const result = transition({
    repo: "owner/repo",
    prNumber: "1",
    ...h,
  });
  assert.equal(result.skipped, true);
  assert.deepEqual(result.removed, []);
  assert.equal(result.added, null);
  assert.deepEqual(h.calls.removed, []);
  assert.deepEqual(h.calls.added, []);
});

test('preserves durable "uat: complete" on staging rebuild', () => {
  const h = harness(["uat: complete"]);
  const result = transition({
    repo: "owner/repo",
    prNumber: "2",
    ...h,
  });
  assert.equal(result.preserved, "uat: complete");
  assert.deepEqual(result.removed, []);
  assert.equal(result.added, null);
  assert.deepEqual(h.calls.removed, []);
  assert.deepEqual(h.calls.added, []);
});

test('preserves durable "uat: needs-changes" on staging rebuild', () => {
  const h = harness(["uat: needs-changes", "area: infra"]);
  const result = transition({
    repo: "owner/repo",
    prNumber: "3",
    ...h,
  });
  assert.equal(result.preserved, "uat: needs-changes");
  assert.deepEqual(result.removed, []);
  assert.equal(result.added, null);
  assert.deepEqual(h.calls.removed, []);
  assert.deepEqual(h.calls.added, []);
});

test('normal policy removes stale "uat: unable" and adds "uat: requested"', () => {
  const h = harness(["uat: unable"]);
  const result = transition({
    repo: "owner/repo",
    prNumber: "4",
    ...h,
  });
  assert.deepEqual(result.removed, ["uat: unable"]);
  assert.equal(result.added, "uat: requested");
});

test("durable outcomes win even when multiple UAT labels are present", () => {
  const h = harness(["uat: complete", "uat: needs-changes", "uat: unable"]);
  const result = transition({
    repo: "owner/repo",
    prNumber: "5",
    ...h,
  });
  assert.equal(result.preserved, "uat: complete");
  assert.deepEqual(result.removed, []);
  assert.equal(result.added, null);
});

test('PR with no uat labels: adds "uat: requested" only', () => {
  const h = harness(["type: bug", "priority: P1"]);
  const result = transition({
    repo: "owner/repo",
    prNumber: "6",
    ...h,
  });
  assert.deepEqual(result.removed, []);
  assert.equal(result.added, "uat: requested");
});

test('idempotent: PR already at "uat: requested" → no writes', () => {
  const h = harness(["uat: requested", "type: feature"]);
  const result = transition({
    repo: "owner/repo",
    prNumber: "7",
    ...h,
  });
  assert.deepEqual(result.removed, []);
  assert.equal(result.added, null);
  assert.deepEqual(h.calls.removed, []);
  assert.deepEqual(h.calls.added, []);
});

test('"uat: skip" takes precedence even if requested+skip coexist', () => {
  // Real-world: a maintainer might set skip after a previous requested.
  // Skip wins — we don't fight the maintainer.
  const h = harness(["uat: skip", "uat: requested"]);
  const result = transition({
    repo: "owner/repo",
    prNumber: "8",
    ...h,
  });
  assert.equal(result.skipped, true);
  assert.deepEqual(h.calls.removed, []);
  assert.deepEqual(h.calls.added, []);
});

test("dry-run flag is plumbed through to the writer hooks", () => {
  const seen = { dryRun: null };
  const result = transition({
    repo: "owner/repo",
    prNumber: "9",
    dryRun: true,
    getLabelsFn: () => ["uat: unable"],
    removeLabelFn: (_r, _pr, _label, dryRun) => {
      seen.dryRun = dryRun;
    },
    addLabelFn: (_r, _pr, _label, dryRun) => {
      seen.dryRun = dryRun;
    },
  });
  assert.equal(seen.dryRun, true);
  assert.equal(result.dryRun, true);
});

test('skip policy adds "uat: skip" instead of "uat: requested"', () => {
  const h = harness(["type: docs"]);
  const result = transition({
    repo: "owner/repo",
    prNumber: "10",
    policy: { stackedPrUatDefault: "skip" },
    ...h,
  });
  assert.deepEqual(result.removed, []);
  assert.equal(result.added, "uat: skip");
  assert.deepEqual(h.calls.added, ["uat: skip"]);
});

test('skip policy removes existing "uat: requested" before adding "uat: skip"', () => {
  const h = harness(["uat: requested", "type: feature"]);
  const result = transition({
    repo: "owner/repo",
    prNumber: "11",
    policy: { stackedPrUatDefault: "skip" },
    ...h,
  });
  assert.deepEqual(result.removed, ["uat: requested"]);
  assert.equal(result.added, "uat: skip");
  assert.deepEqual(h.calls.removed, ["uat: requested"]);
  assert.deepEqual(h.calls.added, ["uat: skip"]);
});

test("loads stacked PR UAT default from policy file", () => {
  const dir = mkdtempSync(join(tmpdir(), "uat-policy-"));
  const path = join(dir, "policy.json");
  writeFileSync(path, JSON.stringify({ stackedPrUatDefault: "skip" }));
  assert.deepEqual(loadPolicy(path), { stackedPrUatDefault: "skip" });
});

test("rejects invalid stacked PR UAT default", () => {
  const dir = mkdtempSync(join(tmpdir(), "uat-policy-"));
  const path = join(dir, "policy.json");
  writeFileSync(path, JSON.stringify({ stackedPrUatDefault: "YOLO" }));
  assert.throws(() => loadPolicy(path), /Invalid stackedPrUatDefault "YOLO"/);
});
