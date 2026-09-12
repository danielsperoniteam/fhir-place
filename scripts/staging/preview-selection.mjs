import { pathToFileURL } from 'node:url';

export function decidePreviewState(context) {
  const {
    eventName,
    eventAction = '',
    eventLabel = '',
    eventBase = '',
    eventPr = '',
    inputAction = '',
    inputPr = '',
    activePr = '',
    selectedPrs = [],
  } = context;

  const selected = selectedPrs.map(String);
  const active = String(activePr || '');
  const eventNumber = String(eventPr || '');
  const inputNumber = String(inputPr || '');
  const selectedAndActive = [...new Set([...selected, active].filter(Boolean))];

  if (eventName !== 'workflow_dispatch' && selected.length > 1) {
    return {
      operation: 'reset',
      prNumber: '',
      removePrs: [],
      selectionError: true,
    };
  }

  if (eventName === 'workflow_dispatch') {
    if (inputAction === 'reset') {
      return {
        operation: 'reset',
        prNumber: '',
        removePrs: selectedAndActive,
        selectionError: false,
      };
    }
    if (!/^\d+$/.test(inputNumber)) {
      throw new Error('A numeric pr_number is required for action=preview.');
    }
    return {
      operation: 'preview',
      prNumber: inputNumber,
      removePrs: selected.filter((number) => number !== inputNumber),
      selectionError: false,
    };
  }

  if (eventName === 'pull_request_target') {
    if (eventAction === 'labeled' && eventLabel === 'preview: staging') {
      if (selected.length === 1 && active === selected[0]) {
        return { operation: 'noop', prNumber: '', removePrs: [], selectionError: false };
      }
      return selected.length === 1
        ? { operation: 'preview', prNumber: selected[0], removePrs: [], selectionError: false }
        : { operation: 'noop', prNumber: '', removePrs: [], selectionError: false };
    }
    if (eventAction === 'unlabeled' && eventLabel === 'preview: staging') {
      if (selected.length === 1) {
        return { operation: 'preview', prNumber: selected[0], removePrs: [], selectionError: false };
      }
      if (active === eventNumber) {
        return { operation: 'reset', prNumber: '', removePrs: [], selectionError: false };
      }
    }
    if (eventAction === 'synchronize' && active === eventNumber && selected.includes(eventNumber)) {
      return { operation: 'preview', prNumber: eventNumber, removePrs: [], selectionError: false };
    }
    if (['ready_for_review', 'reopened'].includes(eventAction) && selected.includes(eventNumber)) {
      return { operation: 'preview', prNumber: eventNumber, removePrs: [], selectionError: false };
    }
    if (eventAction === 'edited' && eventBase !== 'main' &&
        (active === eventNumber || selected.includes(eventNumber))) {
      return {
        operation: 'reset',
        prNumber: '',
        removePrs: [eventNumber],
        selectionError: false,
      };
    }
    if (eventAction === 'edited' && eventBase === 'main' &&
        selected.includes(eventNumber) && active !== eventNumber) {
      return { operation: 'preview', prNumber: eventNumber, removePrs: [], selectionError: false };
    }
    if (eventAction === 'converted_to_draft' && selected.includes(eventNumber)) {
      return {
        operation: 'reset',
        prNumber: '',
        removePrs: [eventNumber],
        selectionError: false,
      };
    }
    if (eventAction === 'closed' && active === eventNumber) {
      return selected.length === 1
        ? { operation: 'preview', prNumber: selected[0], removePrs: [], selectionError: false }
        : { operation: 'reset', prNumber: '', removePrs: [], selectionError: false };
    }
    return { operation: 'noop', prNumber: '', removePrs: [], selectionError: false };
  }

  if (eventName === 'push') {
    return selected.length === 1
      ? { operation: 'preview', prNumber: selected[0], removePrs: [], selectionError: false }
      : { operation: 'reset', prNumber: '', removePrs: [], selectionError: false };
  }

  return { operation: 'noop', prNumber: '', removePrs: [], selectionError: false };
}

export function validatePreviewCandidate(pr, repoOwner, prNumber) {
  if (pr.state !== 'OPEN' || pr.isDraft !== false) {
    return { valid: false, reason: `PR #${prNumber} must be open and ready for review.` };
  }
  if (pr.baseRefName !== 'main') {
    return { valid: false, reason: `PR #${prNumber} targets ${pr.baseRefName}; previews require base main.` };
  }
  if (pr.headRepositoryOwner?.login !== repoOwner) {
    return { valid: false, reason: 'Fork PRs cannot run in the write-enabled shared preview workflow.' };
  }
  return { valid: true, reason: '' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.PREVIEW_PR) {
    const pr = JSON.parse(process.env.PREVIEW_PR);
    process.stdout.write(JSON.stringify(validatePreviewCandidate(
      pr,
      process.env.PREVIEW_REPO_OWNER,
      process.env.PREVIEW_PR_NUMBER,
    )));
  } else {
    const context = JSON.parse(process.env.PREVIEW_CONTEXT || '{}');
    process.stdout.write(JSON.stringify(decidePreviewState(context)));
  }
}
