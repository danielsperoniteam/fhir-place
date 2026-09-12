import assert from 'node:assert/strict';
import test from 'node:test';

import { decidePreviewState, validatePreviewCandidate } from './preview-selection.mjs';

test('a main push with no selection resets staging', () => {
  assert.equal(decidePreviewState({ eventName: 'push', selectedPrs: [] }).operation, 'reset');
});

test('a main push preserves the one selected preview', () => {
  assert.deepEqual(decidePreviewState({ eventName: 'push', selectedPrs: [42] }), {
    operation: 'preview',
    prNumber: '42',
    removePrs: [],
    selectionError: false,
  });
});

test('multiple selected PRs fail closed to main', () => {
  assert.deepEqual(decidePreviewState({ eventName: 'push', selectedPrs: [42, 43] }), {
    operation: 'reset',
    prNumber: '',
    removePrs: [],
    selectionError: true,
  });
});

test('manual preview replaces an existing selection', () => {
  assert.deepEqual(decidePreviewState({
    eventName: 'workflow_dispatch',
    inputAction: 'preview',
    inputPr: '43',
    selectedPrs: [42],
  }), {
    operation: 'preview',
    prNumber: '43',
    removePrs: ['42'],
    selectionError: false,
  });
});

test('manual reset removes every selected and active preview label', () => {
  assert.deepEqual(decidePreviewState({
    eventName: 'workflow_dispatch',
    inputAction: 'reset',
    activePr: 42,
    selectedPrs: [42, 43],
  }), {
    operation: 'reset',
    prNumber: '',
    removePrs: ['42', '43'],
    selectionError: false,
  });
});

test('a queued label event does not redeploy the already active preview', () => {
  assert.equal(decidePreviewState({
    eventName: 'pull_request_target',
    eventAction: 'labeled',
    eventLabel: 'preview: staging',
    eventPr: 43,
    activePr: 43,
    selectedPrs: [43],
  }).operation, 'noop');
});

test('manual preview rejects a missing PR number', () => {
  assert.throws(
    () => decidePreviewState({ eventName: 'workflow_dispatch', inputAction: 'preview' }),
    /numeric pr_number/,
  );
});

test('closing the active preview resets staging', () => {
  assert.equal(decidePreviewState({
    eventName: 'pull_request_target',
    eventAction: 'closed',
    eventPr: 42,
    activePr: 42,
    selectedPrs: [],
  }).operation, 'reset');
});

test('closing the active preview deploys the one remaining selection', () => {
  assert.deepEqual(decidePreviewState({
    eventName: 'pull_request_target',
    eventAction: 'closed',
    eventPr: 42,
    activePr: 42,
    selectedPrs: [43],
  }), {
    operation: 'preview',
    prNumber: '43',
    removePrs: [],
    selectionError: false,
  });
});

test('synchronizing the active selected PR rebuilds its preview', () => {
  assert.deepEqual(decidePreviewState({
    eventName: 'pull_request_target',
    eventAction: 'synchronize',
    eventPr: 42,
    activePr: 42,
    selectedPrs: [42],
  }), {
    operation: 'preview',
    prNumber: '42',
    removePrs: [],
    selectionError: false,
  });
});

test('reopening a selected PR deploys its preview', () => {
  assert.equal(decidePreviewState({
    eventName: 'pull_request_target',
    eventAction: 'reopened',
    eventPr: 42,
    selectedPrs: [42],
  }).operation, 'preview');
});

test('converting a selected PR to draft removes the selection and resets staging', () => {
  assert.deepEqual(decidePreviewState({
    eventName: 'pull_request_target',
    eventAction: 'converted_to_draft',
    eventPr: 42,
    activePr: 42,
    selectedPrs: [42],
  }), {
    operation: 'reset',
    prNumber: '',
    removePrs: ['42'],
    selectionError: false,
  });
});

test('retargeting the active PR away from main removes it and resets staging', () => {
  assert.deepEqual(decidePreviewState({
    eventName: 'pull_request_target',
    eventAction: 'edited',
    eventBase: 'release',
    eventPr: 42,
    activePr: 42,
    selectedPrs: [42],
  }), {
    operation: 'reset',
    prNumber: '',
    removePrs: ['42'],
    selectionError: false,
  });
});

test('removing the active preview label resets staging', () => {
  assert.equal(decidePreviewState({
    eventName: 'pull_request_target',
    eventAction: 'unlabeled',
    eventLabel: 'preview: staging',
    eventPr: 42,
    activePr: 42,
  }).operation, 'reset');
});

test('removing the active label deploys the one remaining selection', () => {
  assert.deepEqual(decidePreviewState({
    eventName: 'pull_request_target',
    eventAction: 'unlabeled',
    eventLabel: 'preview: staging',
    eventPr: 42,
    activePr: 42,
    selectedPrs: [43],
  }), {
    operation: 'preview',
    prNumber: '43',
    removePrs: [],
    selectionError: false,
  });
});

test('candidate validation accepts an open ready same-repository PR to main', () => {
  assert.deepEqual(validatePreviewCandidate({
    state: 'OPEN',
    isDraft: false,
    baseRefName: 'main',
    headRepositoryOwner: { login: 'danielsperoniteam' },
  }, 'danielsperoniteam', 42), { valid: true, reason: '' });
});

test('candidate validation rejects closed, draft, non-main, and fork PRs', () => {
  const base = {
    state: 'OPEN',
    isDraft: false,
    baseRefName: 'main',
    headRepositoryOwner: { login: 'danielsperoniteam' },
  };
  assert.equal(validatePreviewCandidate({ ...base, state: 'CLOSED' }, 'danielsperoniteam', 42).valid, false);
  assert.equal(validatePreviewCandidate({ ...base, isDraft: true }, 'danielsperoniteam', 42).valid, false);
  assert.equal(validatePreviewCandidate({ ...base, baseRefName: 'staging' }, 'danielsperoniteam', 42).valid, false);
  assert.equal(validatePreviewCandidate({
    ...base,
    headRepositoryOwner: { login: 'someone-else' },
  }, 'danielsperoniteam', 42).valid, false);
});
