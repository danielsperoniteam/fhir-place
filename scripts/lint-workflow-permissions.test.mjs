// Self-tests for lint-workflow-permissions.mjs. Run via:
//   node --test scripts/lint-workflow-permissions.test.mjs
//
// Each case writes a tiny synthetic workflow to a temp file, runs the
// linter as a child process, and asserts on the JSON-ish exit code +
// stdout contents. Synthetic inputs make the test independent of the
// real workflow set under .github/workflows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, 'lint-workflow-permissions.mjs');

function runOn(yaml) {
  const dir = mkdtempSync(join(tmpdir(), 'lint-wf-'));
  const file = join(dir, 'wf.yml');
  writeFileSync(file, yaml);
  try {
    const res = spawnSync('node', [SCRIPT, file], { encoding: 'utf8' });
    return {
      status: res.status,
      stdout: res.stdout,
      stderr: res.stderr,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('GH-PR-WRITE fires when gh pr edit runs without pull-requests: write', () => {
  const wf = `name: t
on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: gh pr edit 1 --add-label foo
`;
  const r = runOn(wf);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-PR-WRITE/);
});

test('GH-PR-WRITE passes when pull-requests: write is granted at job scope', () => {
  const wf = `name: t
on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: gh pr edit 1 --add-label foo
`;
  const r = runOn(wf);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /GH-PR-WRITE/);
});

test('GH-ISSUE-WRITE fires when gh label create runs without issues: write', () => {
  const wf = `name: t
on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: gh label create new-label
`;
  const r = runOn(wf);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-ISSUE-WRITE/);
});

test('GIT-PUSH-WRITE fires when git push runs without contents: write', () => {
  const wf = `name: t
on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: git push --force-with-lease origin staging
`;
  const r = runOn(wf);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GIT-PUSH-WRITE/);
});

test('GH-TOKEN-ENV fires when gh is invoked without any GH_TOKEN-shaped env', () => {
  const wf = `name: t
on: push
permissions:
  contents: write
  pull-requests: write
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr edit 1 --add-label foo
`;
  const r = runOn(wf);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-TOKEN-ENV/);
});

test('GH-TOKEN-ENV accepts workflow-level env', () => {
  const wf = `name: t
on: push
permissions:
  pull-requests: write
env:
  GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr edit 1 --add-label foo
`;
  const r = runOn(wf);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('SILENT-ERROR warns but does not fail the run', () => {
  const wf = `name: t
on: push
permissions:
  contents: write
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: |
          rm dev.pid 2>/dev/null || true
`;
  const r = runOn(wf);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /warning: SILENT-ERROR/);
});

test('clean workflow yields zero findings and exit 0', () => {
  const wf = `name: t
on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo hello
`;
  const r = runOn(wf);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /error:/);
  assert.doesNotMatch(r.stdout, /warning:/);
});
