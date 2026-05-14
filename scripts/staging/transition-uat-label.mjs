#!/usr/bin/env node
// Transitions a single PR's `uat:` label after it has been successfully
// stacked onto `staging` by `.github/workflows/stack-approved-prs.yml`.
//
// Why this exists as a separate script:
//
// The stacking workflow rebuilds `staging` from main every time approvals
// change, and for every PR re-stacked it used to unconditionally remove
// `uat: complete` / `uat: needs-changes` and re-add `uat: requested`. That
// clobbered the walker's verdicts: a PR would settle on `uat: complete`,
// then the very next staging rebuild (triggered by some other PR's
// approval) would knock it back to `uat: requested`. PRs could never
// stabilize at `uat: complete` long enough to merge.
//
// State machine — what we set after a successful stack:
//
//   (none)            → uat: requested      (first time onto staging)
//   uat: unable       → uat: requested      (was off-staging, now on)
//   uat: requested    → uat: requested      (no-op)
//   uat: complete     → uat: complete       (preserve — walker's verdict)
//   uat: needs-changes→ uat: needs-changes  (preserve — walker's verdict)
//   uat: skip         → uat: skip           (preserve — opt-out)
//
// The walker (`docs/prompts/hourly-uat-validation.md`) owns the transition
// out of `uat: requested` and is the only thing allowed to set `complete`
// or `needs-changes`. This script never sets either of those.
//
// Defensive rule: if a PR somehow ends up with multiple `uat:` labels,
// pick the most "settled" by preference order
//   uat: skip > uat: complete > uat: needs-changes > uat: requested > uat: unable
// and remove the rest. Settled wins so we never demote a walker verdict.
//
// Required env:
//   GH_TOKEN              token with `pull-requests: write` (workflow token)
//   GITHUB_REPOSITORY     "owner/repo"
//
// Argv:
//   PR number (positional). Also accepted as PR_NUMBER env.
//
// Exit codes:
//   0  success (including idempotent no-op)
//   1  bad input / config
//   2  gh CLI call failed (the workflow log will show the underlying error)

import { spawnSync } from 'node:child_process';

const UAT_LABELS = [
  'uat: skip',
  'uat: complete',
  'uat: needs-changes',
  'uat: requested',
  'uat: unable',
];

// Highest preference (index 0) wins when a PR somehow has multiple.
const PREFERENCE = UAT_LABELS;

// Labels we'll PRESERVE without trying to "fix" them on a stack rebuild.
// `requested` is included because re-asserting it on every rebuild is a
// pointless API call (and used to be the bug surface).
const PRESERVE = new Set([
  'uat: skip',
  'uat: complete',
  'uat: needs-changes',
  'uat: requested',
]);

/**
 * Run a `gh` command. Default implementation shells out; tests inject
 * their own to avoid hitting the real API.
 *
 * Throws on non-zero exit so the caller surfaces failures loudly — we
 * do NOT swallow errors here. A 403 from a permission misconfig should
 * fail the workflow run, not silently drop labels.
 */
export function defaultGhRunner(args) {
  const res = spawnSync('gh', args, { encoding: 'utf8' });
  if (res.error) {
    throw new Error(`gh ${args.join(' ')} failed to launch: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const stderr = (res.stderr || '').trim();
    throw new Error(`gh ${args.join(' ')} exited ${res.status}: ${stderr}`);
  }
  return res.stdout;
}

/**
 * Pure: given the current label set, decide which label should be the
 * single resulting `uat:` label after a successful stack.
 *
 * Returns `null` when the PR has no `uat:` labels at all — the caller
 * should add `uat: requested`.
 */
export function pickResultingLabel(currentLabels) {
  const uat = currentLabels.filter((l) => UAT_LABELS.includes(l));
  if (uat.length === 0) return null;
  // Sort by preference index, lowest (most preferred) first.
  uat.sort((a, b) => PREFERENCE.indexOf(a) - PREFERENCE.indexOf(b));
  const winner = uat[0];
  // `uat: unable` is not a stable state after stacking — by definition
  // the PR is now on staging, so it must transition to `requested`.
  if (winner === 'uat: unable') return 'uat: requested';
  return winner;
}

/**
 * Compute the minimal set of label-edit actions needed to transition
 * the PR. Returns an array of { action: 'remove'|'add', label } in the
 * order they should be applied. Empty array means no work needed.
 */
export function planTransition(currentLabels) {
  const target = pickResultingLabel(currentLabels) ?? 'uat: requested';
  const currentUat = currentLabels.filter((l) => UAT_LABELS.includes(l));
  const actions = [];

  // Remove every `uat:` label that isn't the target. If the target is a
  // PRESERVE label (skip/complete/needs-changes/requested), we leave it
  // in place and only clean up stragglers. If the target is `requested`
  // and it's not currently set, we'll add it below.
  for (const label of currentUat) {
    if (label !== target) {
      actions.push({ action: 'remove', label });
    }
  }

  if (!currentUat.includes(target)) {
    actions.push({ action: 'add', label: target });
  }

  return actions;
}

async function fetchLabels({ pr, repo, gh }) {
  const out = gh(['pr', 'view', String(pr), '--repo', repo, '--json', 'labels']);
  const parsed = JSON.parse(out);
  if (!Array.isArray(parsed.labels)) {
    throw new Error(`gh pr view returned unexpected shape: ${out.slice(0, 200)}`);
  }
  return parsed.labels.map((l) => l.name);
}

function applyAction({ pr, repo, gh, action, label }) {
  const flag = action === 'remove' ? '--remove-label' : '--add-label';
  gh(['pr', 'edit', String(pr), '--repo', repo, flag, label]);
}

/**
 * Main entry point. Exported so tests can call it with an injected gh.
 */
export async function transitionUatLabel({ pr, repo, gh = defaultGhRunner, log = console.log }) {
  if (!pr) throw new Error('PR number is required');
  if (!repo) throw new Error('GITHUB_REPOSITORY env var is required');

  const labels = await fetchLabels({ pr, repo, gh });
  const uat = labels.filter((l) => UAT_LABELS.includes(l));
  log(`PR #${pr}: current uat labels = [${uat.join(', ') || '(none)'}]`);

  const plan = planTransition(labels);

  if (plan.length === 0) {
    log(`PR #${pr}: no label change needed`);
    return { changed: false, actions: [] };
  }

  for (const step of plan) {
    log(`PR #${pr}: ${step.action} "${step.label}"`);
    applyAction({ pr, repo, gh, action: step.action, label: step.label });
  }

  return { changed: true, actions: plan };
}

// Allow `import` for tests without auto-running main().
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  const pr = process.argv[2] || process.env.PR_NUMBER;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!process.env.GH_TOKEN) {
    console.error('GH_TOKEN is required');
    process.exit(1);
  }
  if (!pr) {
    console.error('Usage: transition-uat-label.mjs <pr-number>   (or set PR_NUMBER)');
    process.exit(1);
  }
  if (!repo) {
    console.error('GITHUB_REPOSITORY is required');
    process.exit(1);
  }
  transitionUatLabel({ pr, repo }).catch((err) => {
    console.error(err.message || err);
    process.exit(2);
  });
}
