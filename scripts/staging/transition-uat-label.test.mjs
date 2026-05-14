// Unit tests for transition-uat-label.mjs. Uses node's built-in
// `node:test` runner so this has zero install footprint. Run with:
//
//   node --test scripts/staging/transition-uat-label.test.mjs
//
// The script under test takes its `gh` runner as a parameter, so we
// inject a stub that records argv lists and returns canned stdout. No
// network calls happen here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  pickResultingLabel,
  planTransition,
  transitionUatLabel,
} from './transition-uat-label.mjs';

/**
 * Builds a mock `gh` runner. `prLabels` is the array of label names that
 * `gh pr view` should report for the PR. Each call is logged into the
 * returned `calls` array.
 */
function makeGh(prLabels) {
  const calls = [];
  let labels = [...prLabels];
  const gh = (args) => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'view') {
      return JSON.stringify({ labels: labels.map((name) => ({ name })) });
    }
    if (args[0] === 'pr' && args[1] === 'edit') {
      // Reflect mutation so a follow-up `pr view` (if any) would see it.
      // Not strictly needed for the current script which only views once,
      // but it keeps the mock honest.
      const removeIdx = args.indexOf('--remove-label');
      const addIdx = args.indexOf('--add-label');
      if (removeIdx >= 0) {
        const target = args[removeIdx + 1];
        labels = labels.filter((l) => l !== target);
      }
      if (addIdx >= 0) {
        const target = args[addIdx + 1];
        if (!labels.includes(target)) labels.push(target);
      }
      return '';
    }
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  };
  return { gh, calls, getLabels: () => labels };
}

/** Filter recorded calls down to label-edit operations. */
function labelEdits(calls) {
  return calls
    .filter((args) => args[0] === 'pr' && args[1] === 'edit')
    .map((args) => {
      const removeIdx = args.indexOf('--remove-label');
      const addIdx = args.indexOf('--add-label');
      if (removeIdx >= 0) return { action: 'remove', label: args[removeIdx + 1] };
      if (addIdx >= 0) return { action: 'add', label: args[addIdx + 1] };
      return { action: 'unknown' };
    });
}

const REPO = 'danielsperoniteam/fhir-place';
const PR = 526;
const silent = () => {};

describe('pickResultingLabel', () => {
  it('returns null when no uat labels are present', () => {
    assert.equal(pickResultingLabel([]), null);
    assert.equal(pickResultingLabel(['bug', 'priority: P1']), null);
  });

  it('promotes uat: unable to uat: requested (it is no longer "unable" once stacked)', () => {
    assert.equal(pickResultingLabel(['uat: unable']), 'uat: requested');
  });

  it('keeps uat: requested', () => {
    assert.equal(pickResultingLabel(['uat: requested']), 'uat: requested');
  });

  it('keeps uat: complete', () => {
    assert.equal(pickResultingLabel(['uat: complete']), 'uat: complete');
  });

  it('keeps uat: needs-changes', () => {
    assert.equal(pickResultingLabel(['uat: needs-changes']), 'uat: needs-changes');
  });

  it('keeps uat: skip', () => {
    assert.equal(pickResultingLabel(['uat: skip']), 'uat: skip');
  });

  it('prefers the more-settled label when multiple are present', () => {
    // skip > complete > needs-changes > requested > unable
    assert.equal(
      pickResultingLabel(['uat: complete', 'uat: requested']),
      'uat: complete',
    );
    assert.equal(
      pickResultingLabel(['uat: needs-changes', 'uat: unable']),
      'uat: needs-changes',
    );
    assert.equal(
      pickResultingLabel(['uat: skip', 'uat: complete', 'uat: requested']),
      'uat: skip',
    );
  });
});

describe('planTransition', () => {
  it('adds uat: requested when no uat label is present', () => {
    const plan = planTransition(['bug']);
    assert.deepEqual(plan, [{ action: 'add', label: 'uat: requested' }]);
  });

  it('flips uat: unable → uat: requested', () => {
    const plan = planTransition(['uat: unable']);
    assert.deepEqual(plan, [
      { action: 'remove', label: 'uat: unable' },
      { action: 'add', label: 'uat: requested' },
    ]);
  });

  it('is a no-op when uat: requested is already set', () => {
    assert.deepEqual(planTransition(['uat: requested']), []);
  });

  it('is a no-op when uat: complete is already set (the bug fix)', () => {
    assert.deepEqual(planTransition(['uat: complete']), []);
  });

  it('is a no-op when uat: needs-changes is already set', () => {
    assert.deepEqual(planTransition(['uat: needs-changes']), []);
  });

  it('is a no-op when uat: skip is already set', () => {
    assert.deepEqual(planTransition(['uat: skip']), []);
  });

  it('cleans up stragglers when multiple uat labels are present, keeping the winner', () => {
    const plan = planTransition(['uat: complete', 'uat: requested', 'bug']);
    // Winner = uat: complete; the only edit needed is removing the loser.
    assert.deepEqual(plan, [{ action: 'remove', label: 'uat: requested' }]);
  });
});

describe('transitionUatLabel (integration with mock gh)', () => {
  it('first time stacking → adds uat: requested', async () => {
    const { gh, calls } = makeGh(['bug', 'priority: P1']);
    const result = await transitionUatLabel({ pr: PR, repo: REPO, gh, log: silent });
    assert.equal(result.changed, true);
    assert.deepEqual(labelEdits(calls), [
      { action: 'add', label: 'uat: requested' },
    ]);
  });

  it('uat: unable → flips to uat: requested', async () => {
    const { gh, calls } = makeGh(['uat: unable']);
    const result = await transitionUatLabel({ pr: PR, repo: REPO, gh, log: silent });
    assert.equal(result.changed, true);
    assert.deepEqual(labelEdits(calls), [
      { action: 'remove', label: 'uat: unable' },
      { action: 'add', label: 'uat: requested' },
    ]);
  });

  it('uat: requested → no API calls beyond the view', async () => {
    const { gh, calls } = makeGh(['uat: requested']);
    const result = await transitionUatLabel({ pr: PR, repo: REPO, gh, log: silent });
    assert.equal(result.changed, false);
    assert.deepEqual(labelEdits(calls), []);
    // Exactly one gh call total — the initial `pr view`.
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], 'view');
  });

  it('uat: complete is preserved (the clobber bug fix)', async () => {
    const { gh, calls } = makeGh(['uat: complete']);
    const result = await transitionUatLabel({ pr: PR, repo: REPO, gh, log: silent });
    assert.equal(result.changed, false);
    const edits = labelEdits(calls);
    // The whole point: nothing removes "uat: complete".
    assert.equal(
      edits.some((e) => e.action === 'remove' && e.label === 'uat: complete'),
      false,
      'uat: complete must not be removed by a stack rebuild',
    );
    assert.deepEqual(edits, []);
  });

  it('uat: needs-changes is preserved', async () => {
    const { gh, calls } = makeGh(['uat: needs-changes']);
    const result = await transitionUatLabel({ pr: PR, repo: REPO, gh, log: silent });
    assert.equal(result.changed, false);
    const edits = labelEdits(calls);
    assert.equal(
      edits.some((e) => e.action === 'remove' && e.label === 'uat: needs-changes'),
      false,
      'uat: needs-changes must not be removed by a stack rebuild',
    );
    assert.deepEqual(edits, []);
  });

  it('uat: skip is preserved', async () => {
    const { gh, calls } = makeGh(['uat: skip']);
    const result = await transitionUatLabel({ pr: PR, repo: REPO, gh, log: silent });
    assert.equal(result.changed, false);
    assert.deepEqual(labelEdits(calls), []);
  });

  it('non-uat labels are not touched', async () => {
    const { gh, calls } = makeGh([
      'bug',
      'priority: P1',
      'area: fhir-explorer',
      'uat: unable',
    ]);
    await transitionUatLabel({ pr: PR, repo: REPO, gh, log: silent });
    const touched = labelEdits(calls).map((e) => e.label);
    for (const label of touched) {
      assert.ok(
        label.startsWith('uat: '),
        `transition touched non-uat label "${label}"`,
      );
    }
  });

  it('converges to the most-settled label when a PR has multiple uat labels', async () => {
    // This shouldn't happen in practice, but the script must not panic
    // and must not demote a walker verdict to `uat: requested`.
    const { gh, calls } = makeGh(['uat: complete', 'uat: requested']);
    const result = await transitionUatLabel({ pr: PR, repo: REPO, gh, log: silent });
    assert.equal(result.changed, true);
    assert.deepEqual(labelEdits(calls), [
      { action: 'remove', label: 'uat: requested' },
    ]);
  });

  it('propagates gh failures (no error swallowing)', async () => {
    // Mock gh that fails on the second call (the label edit). We want a
    // 403 from "labels can't be edited" to fail the workflow loudly.
    let callCount = 0;
    const gh = (args) => {
      callCount++;
      if (callCount === 1) {
        return JSON.stringify({ labels: [{ name: 'uat: unable' }] });
      }
      throw new Error('gh: exit 1: HTTP 403: Resource not accessible by integration');
    };
    await assert.rejects(
      () => transitionUatLabel({ pr: PR, repo: REPO, gh, log: silent }),
      /403/,
    );
  });
});
