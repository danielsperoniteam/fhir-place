// Tests for scripts/sdlc/lint-workflows.mjs
//
// Run with:
//   node --test scripts/sdlc/lint-workflows.test.mjs
//
// Three regression cases (at the bottom) mirror bugs from ADR 0007:
//   - Bug #1: gh pr edit --add-label without pull-requests: write
//   - Bug #2: gh issue edit without issues: write
//   - ADR 0007 label-edit suppression: 2>/dev/null || true on gh pr edit

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, 'lint-workflows.mjs');

function runOn(yaml) {
  const dir = mkdtempSync(join(tmpdir(), 'lint-sdlc-wf-'));
  const file = join(dir, 'wf.yml');
  writeFileSync(file, yaml);
  try {
    const r = spawnSync('node', [SCRIPT, file], { encoding: 'utf8' });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Minimal valid workflow with explicit permissions granted.
function wf({ perms = 'contents: read', extra = '' } = {}) {
  return `name: t
on: push
permissions:
  ${perms}
jobs:
  a:
    runs-on: ubuntu-latest
    steps:${extra}
`;
}

// ---------------------------------------------------------------------------
// GH-STDERR-SUPPRESS
// ---------------------------------------------------------------------------

test('GH-STDERR-SUPPRESS fires on gh call with 2>/dev/null', () => {
  const r = runOn(wf({
    perms: 'issues: write',
    extra: `
      - run: |
          set -euo pipefail
          gh issue comment 1 --body hi 2>/dev/null`,
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-STDERR-SUPPRESS/);
});

test('GH-STDERR-SUPPRESS: no fire when gh has no 2>/dev/null', () => {
  const r = runOn(wf({
    perms: 'issues: write',
    extra: `
      - run: |
          set -euo pipefail
          gh issue comment 1 --body hi`,
  }));
  assert.doesNotMatch(r.stdout, /GH-STDERR-SUPPRESS/);
});

test('GH-STDERR-SUPPRESS: no fire when 2>/dev/null is on a non-gh line', () => {
  const r = runOn(wf({
    extra: `
      - run: |
          set -euo pipefail
          rm dev.pid 2>/dev/null || true`,
  }));
  assert.doesNotMatch(r.stdout, /GH-STDERR-SUPPRESS/);
});

test('GH-STDERR-SUPPRESS: suppressed by inline waiver', () => {
  const r = runOn(wf({
    perms: 'issues: write',
    extra: `
      - run: |
          set -euo pipefail
          # lint-workflows: allow GH-STDERR-SUPPRESS
          gh issue comment 1 --body hi 2>/dev/null`,
  }));
  assert.doesNotMatch(r.stdout, /GH-STDERR-SUPPRESS/);
});

// ---------------------------------------------------------------------------
// GH-SILENT-OR-TRUE
// ---------------------------------------------------------------------------

test('GH-SILENT-OR-TRUE fires on gh pr edit ... || true', () => {
  const r = runOn(wf({
    perms: 'pull-requests: write',
    extra: `
      - run: |
          set -euo pipefail
          gh pr edit 1 --add-label foo || true`,
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-SILENT-OR-TRUE/);
});

test('GH-SILENT-OR-TRUE fires on gh issue edit ... || true', () => {
  const r = runOn(wf({
    perms: 'issues: write',
    extra: `
      - run: |
          set -euo pipefail
          gh issue edit 1 --add-label foo || true`,
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-SILENT-OR-TRUE/);
});

test('GH-SILENT-OR-TRUE fires on gh api ... || true', () => {
  const r = runOn(wf({
    extra: `
      - run: |
          set -euo pipefail
          gh api repos/org/repo/issues --method POST -f title=x || true`,
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-SILENT-OR-TRUE/);
});

test('GH-SILENT-OR-TRUE: no fire on gh pr list ... || true (read-only)', () => {
  const r = runOn(wf({
    perms: 'pull-requests: write',
    extra: `
      - run: |
          set -euo pipefail
          gh pr list --state open || true`,
  }));
  assert.doesNotMatch(r.stdout, /GH-SILENT-OR-TRUE/);
});

test('GH-SILENT-OR-TRUE: no fire when || true is on an unrelated line', () => {
  const r = runOn(wf({
    perms: 'issues: write',
    extra: `
      - run: |
          set -euo pipefail
          gh issue edit 1 --add-label foo
          some-cmd || true`,
  }));
  assert.doesNotMatch(r.stdout, /GH-SILENT-OR-TRUE/);
});

test('GH-SILENT-OR-TRUE: suppressed by inline waiver', () => {
  const r = runOn(wf({
    perms: 'pull-requests: write',
    extra: `
      - run: |
          set -euo pipefail
          # lint-workflows: allow GH-SILENT-OR-TRUE
          gh pr edit 1 --add-label foo || true`,
  }));
  assert.doesNotMatch(r.stdout, /GH-SILENT-OR-TRUE/);
});

// ---------------------------------------------------------------------------
// MISSING-PIPEFAIL
// ---------------------------------------------------------------------------

test('MISSING-PIPEFAIL fires on multi-line run without set -euo pipefail', () => {
  const r = runOn(wf({
    extra: `
      - run: |
          echo step 1
          echo step 2`,
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /MISSING-PIPEFAIL/);
});

test('MISSING-PIPEFAIL: no fire on single-line run', () => {
  const r = runOn(wf({ extra: `\n      - run: echo hello` }));
  assert.doesNotMatch(r.stdout, /MISSING-PIPEFAIL/);
});

test('MISSING-PIPEFAIL: no fire when set -euo pipefail is present', () => {
  const r = runOn(wf({
    extra: `
      - run: |
          set -euo pipefail
          echo step 1
          echo step 2`,
  }));
  assert.doesNotMatch(r.stdout, /MISSING-PIPEFAIL/);
});

test('MISSING-PIPEFAIL: no fire when set -e is present', () => {
  const r = runOn(wf({
    extra: `
      - run: |
          set -e
          echo step 1
          echo step 2`,
  }));
  assert.doesNotMatch(r.stdout, /MISSING-PIPEFAIL/);
});

test('MISSING-PIPEFAIL: suppressed by inline waiver above run:', () => {
  const r = runOn(wf({
    extra: `
        # lint-workflows: allow MISSING-PIPEFAIL
      - run: |
          echo step 1
          echo step 2`,
  }));
  assert.doesNotMatch(r.stdout, /MISSING-PIPEFAIL/);
});

// ---------------------------------------------------------------------------
// GH-PR-LABEL-WRITE
// ---------------------------------------------------------------------------

test('GH-PR-LABEL-WRITE fires on --add-label without pull-requests: write', () => {
  const r = runOn(wf({
    extra: `
      - run: |
          set -euo pipefail
          gh pr edit 1 --add-label foo`,
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-PR-LABEL-WRITE/);
});

test('GH-PR-LABEL-WRITE fires on --remove-label without pull-requests: write', () => {
  const r = runOn(wf({
    extra: `
      - run: |
          set -euo pipefail
          gh pr edit 1 --remove-label bar`,
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-PR-LABEL-WRITE/);
});

test('GH-PR-LABEL-WRITE: no fire when pull-requests: write at workflow scope', () => {
  const r = runOn(wf({
    perms: 'pull-requests: write',
    extra: `
      - run: |
          set -euo pipefail
          gh pr edit 1 --add-label foo`,
  }));
  assert.doesNotMatch(r.stdout, /GH-PR-LABEL-WRITE/);
});

test('GH-PR-LABEL-WRITE: no fire when pull-requests: write at job scope', () => {
  const yaml = `name: t
on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - run: |
          set -euo pipefail
          gh pr edit 1 --add-label foo
`;
  const r = runOn(yaml);
  assert.doesNotMatch(r.stdout, /GH-PR-LABEL-WRITE/);
});

test('GH-PR-LABEL-WRITE: no fire when permissions is write-all', () => {
  const yaml = `name: t
on: push
permissions: write-all
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: |
          set -euo pipefail
          gh pr edit 1 --add-label foo
`;
  const r = runOn(yaml);
  assert.doesNotMatch(r.stdout, /GH-PR-LABEL-WRITE/);
});

test('GH-PR-LABEL-WRITE: suppressed by inline waiver', () => {
  const r = runOn(wf({
    extra: `
      - run: |
          set -euo pipefail
          # lint-workflows: allow GH-PR-LABEL-WRITE
          gh pr edit 1 --add-label foo`,
  }));
  assert.doesNotMatch(r.stdout, /GH-PR-LABEL-WRITE/);
});

// ---------------------------------------------------------------------------
// GH-ISSUE-WRITE
// ---------------------------------------------------------------------------

test('GH-ISSUE-WRITE fires on gh issue create without issues: write', () => {
  const r = runOn(wf({
    extra: `
      - run: |
          set -euo pipefail
          gh issue create --title bug --body oops`,
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-ISSUE-WRITE/);
});

test('GH-ISSUE-WRITE fires on gh issue edit without issues: write', () => {
  const r = runOn(wf({
    extra: `
      - run: |
          set -euo pipefail
          gh issue edit 42 --add-label triage`,
  }));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-ISSUE-WRITE/);
});

test('GH-ISSUE-WRITE: no fire when issues: write is present', () => {
  const r = runOn(wf({
    perms: 'issues: write',
    extra: `
      - run: |
          set -euo pipefail
          gh issue create --title bug --body oops`,
  }));
  assert.doesNotMatch(r.stdout, /GH-ISSUE-WRITE/);
});

test('GH-ISSUE-WRITE: suppressed by inline waiver', () => {
  const r = runOn(wf({
    extra: `
      - run: |
          set -euo pipefail
          # lint-workflows: allow GH-ISSUE-WRITE
          gh issue create --title bug --body oops`,
  }));
  assert.doesNotMatch(r.stdout, /GH-ISSUE-WRITE/);
});

// ---------------------------------------------------------------------------
// Clean workflow
// ---------------------------------------------------------------------------

test('clean workflow exits 0 with no findings', () => {
  const yaml = `name: t
on: push
permissions:
  pull-requests: write
  issues: write
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo single-line
      - run: |
          set -euo pipefail
          gh pr edit 1 --add-label foo
          gh issue create --title bug --body body
`;
  const r = runOn(yaml);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /GH-STDERR-SUPPRESS|GH-SILENT-OR-TRUE|MISSING-PIPEFAIL|GH-PR-LABEL-WRITE|GH-ISSUE-WRITE/);
});

// ---------------------------------------------------------------------------
// Regression: Bug #1 (ADR 0007)
// stack-approved-prs.yml had gh pr edit --add-label without pull-requests: write.
// Every call 403'd silently. Fixed in #545.
// ---------------------------------------------------------------------------

test('REGRESSION bug #1: gh pr edit --add-label without pull-requests: write', () => {
  const yaml = `name: stack-approved-prs
on:
  pull_request_review:
    types: [submitted]
permissions:
  contents: write
jobs:
  stack:
    runs-on: ubuntu-latest
    steps:
      - run: |
          set -euo pipefail
          gh pr edit "\$PR_NUM" --add-label "uat: requested"
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          PR_NUM: "1"
`;
  const r = runOn(yaml);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-PR-LABEL-WRITE/);
  assert.match(r.stdout, /pull-requests: write/i);
});

// ---------------------------------------------------------------------------
// Regression: Bug #2 (ADR 0007)
// A write call (gh issue edit) without issues: write — same silent-failure
// shape as bug #1 but for the issues scope.
// ---------------------------------------------------------------------------

test('REGRESSION bug #2: gh issue edit without issues: write', () => {
  const yaml = `name: on-failure-issue
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
permissions:
  contents: read
jobs:
  file-issue:
    runs-on: ubuntu-latest
    steps:
      - run: |
          set -euo pipefail
          gh issue edit "\$ISSUE_NUM" --add-label "ci-failure"
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          ISSUE_NUM: "10"
`;
  const r = runOn(yaml);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-ISSUE-WRITE/);
  assert.match(r.stdout, /issues: write/i);
});

// ---------------------------------------------------------------------------
// Regression: ADR 0007 label-edit suppression idiom
// gh pr edit with 2>/dev/null || true hides both stderr (403) and exit code.
// ---------------------------------------------------------------------------

test('REGRESSION label-edit suppression: gh pr edit 2>/dev/null || true', () => {
  const yaml = `name: stack-approved-prs
on: push
permissions:
  pull-requests: write
jobs:
  stack:
    runs-on: ubuntu-latest
    steps:
      - run: |
          set -euo pipefail
          gh pr edit "\$PR_NUM" --add-label "uat: requested" 2>/dev/null || true
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          PR_NUM: "1"
`;
  const r = runOn(yaml);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /GH-STDERR-SUPPRESS/);
  assert.match(r.stdout, /GH-SILENT-OR-TRUE/);
});
