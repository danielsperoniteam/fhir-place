#!/usr/bin/env node
// Transition a PR's `uat:` label after it has been stacked onto staging.
//
// Semantics:
//
//   1. If the PR carries `uat: skip` → no-op. The PR has no user-visible
//      change and doesn't need UAT walking; leave any state as-is.
//   2. If the PR carries `uat: complete` or `uat: needs-changes` → no-op.
//      These are durable UAT outcomes and staging rebuilds must not clobber
//      them back to requested.
//   3. Otherwise follow scripts/staging/uat-policy.json:
//      - "request": remove `uat: unable`, then add `uat: requested`.
//      - "skip": remove `uat: unable` / `uat: requested`, then add `uat: skip`.
//
// The script is idempotent: running it twice on the same PR with the same
// label state produces the same result and no extra API writes.
//
// Runtime-agnostic. Works under:
//   - GitHub Actions (where the workflow used to inline this)
//   - Local launchd / tmux drivers
//   - A cloud webhook receiver
//   - Codex or Claude as the invoking agent runtime
//
// Hard rules to keep that promise:
//   - No `@actions/*` imports. No `actions/github-script`.
//   - No GHA workflow-command escape codes (`::group::`, `::warning::`).
//   - All GitHub API access goes through the `gh` CLI, which authenticates
//     from `GH_TOKEN` or `GITHUB_TOKEN` (equivalent) or a logged-in user.
//   - No reliance on `GITHUB_WORKSPACE`, `GITHUB_ACTIONS`, or runner paths.
//
// Usage:
//
//   node scripts/staging/transition-uat-label.mjs <pr-number> [--repo owner/name] [--policy path] [--dry-run]
//
// Required:
//   <pr-number>             positional, integer PR number
//
// Optional:
//   --repo owner/name       defaults to $GITHUB_REPOSITORY
//   --policy path           defaults to scripts/staging/uat-policy.json
//   --dry-run               log intended changes without writing
//
// Env (any one is enough for gh auth):
//   GH_TOKEN | GITHUB_TOKEN    token with `pull-requests: write` scope
//   GITHUB_REPOSITORY          fallback for --repo
//   UAT_POLICY_PATH            fallback for --policy
//
// Exit codes:
//   0  success (including no-op skip cases)
//   1  bad arguments / missing repo
//   2  gh CLI failure (network, auth, PR not found, label edit failed)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SKIP_LABEL = "uat: skip";
const REQUESTED_LABEL = "uat: requested";
const COMPLETE_LABEL = "uat: complete";
const NEEDS_CHANGES_LABEL = "uat: needs-changes";
const UNABLE_LABEL = "uat: unable";
const DEFAULT_POLICY_URL = new URL("./uat-policy.json", import.meta.url);
const VALID_DEFAULTS = new Set(["request", "skip"]);

function parseArgs(argv) {
  const args = { prNumber: null, repo: null, policyPath: null, dryRun: false };
  const rest = [];
  const readValue = (flag, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") {
      args.repo = readValue(a, i);
      i++;
    } else if (a === "--policy") {
      args.policyPath = readValue(a, i);
      i++;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      rest.push(a);
    }
  }
  if (rest.length > 0) args.prNumber = rest[0];
  return args;
}

function usage() {
  return `Usage: transition-uat-label.mjs <pr-number> [--repo owner/name] [--policy path] [--dry-run]`;
}

export function loadPolicy(policyPath = null) {
  const source =
    policyPath || process.env.UAT_POLICY_PATH || DEFAULT_POLICY_URL;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(source, "utf8"));
  } catch (err) {
    const msg = `Failed to read UAT policy from ${source}: ${err.message}`;
    const wrapped = new Error(msg);
    wrapped.exitCode = 1;
    throw wrapped;
  }

  const stackedPrUatDefault = parsed.stackedPrUatDefault || "request";
  if (!VALID_DEFAULTS.has(stackedPrUatDefault)) {
    const wrapped = new Error(
      `Invalid stackedPrUatDefault "${stackedPrUatDefault}". Expected "request" or "skip".`
    );
    wrapped.exitCode = 1;
    throw wrapped;
  }

  return { stackedPrUatDefault };
}

function gh(args, { capture = true } = {}) {
  // Always go through `gh`. It authenticates equally from GH_TOKEN,
  // GITHUB_TOKEN, or a user login — that's why we use it instead of raw
  // fetch with a hand-rolled bearer.
  try {
    const out = execFileSync("gh", args, {
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    return capture ? out : "";
  } catch (err) {
    // execFileSync throws an Error with .stderr / .status when gh exits non-zero
    const stderr = err.stderr ? err.stderr.toString() : "";
    const code = err.status ?? "unknown";
    const cmd = ["gh", ...args].join(" ");
    const msg = `gh failed (exit ${code}): ${cmd}\n${stderr.trim()}`;
    const wrapped = new Error(msg);
    wrapped.exitCode = 2;
    throw wrapped;
  }
}

function getLabels(repo, prNumber) {
  const raw = gh([
    "pr",
    "view",
    String(prNumber),
    "--repo",
    repo,
    "--json",
    "labels",
    "--jq",
    "[.labels[].name]",
  ]);
  return JSON.parse(raw.trim() || "[]");
}

function removeLabel(repo, prNumber, label, dryRun) {
  if (dryRun) {
    console.log(`dry-run: would remove "${label}" from PR #${prNumber}`);
    return;
  }
  gh(["pr", "edit", String(prNumber), "--repo", repo, "--remove-label", label]);
  console.log(`removed "${label}" from PR #${prNumber}`);
}

function addLabel(repo, prNumber, label, dryRun) {
  if (dryRun) {
    console.log(`dry-run: would add "${label}" to PR #${prNumber}`);
    return;
  }
  gh(["pr", "edit", String(prNumber), "--repo", repo, "--add-label", label]);
  console.log(`added "${label}" to PR #${prNumber}`);
}

export function transition({
  repo,
  prNumber,
  policy = { stackedPrUatDefault: "request" },
  dryRun = false,
  getLabelsFn = getLabels,
  removeLabelFn = removeLabel,
  addLabelFn = addLabel,
}) {
  // Returned for callers (e.g. tests) and printed at the end for humans.
  const result = {
    repo,
    prNumber,
    policy,
    dryRun,
    skipped: false,
    preserved: null,
    removed: [],
    added: null,
  };

  const labels = getLabelsFn(repo, prNumber);

  if (labels.includes(SKIP_LABEL)) {
    result.skipped = true;
    console.log(`PR #${prNumber} has "${SKIP_LABEL}" — no transition needed`);
    return result;
  }

  const durable = [COMPLETE_LABEL, NEEDS_CHANGES_LABEL].find((label) =>
    labels.includes(label)
  );
  if (durable) {
    result.preserved = durable;
    console.log(`PR #${prNumber} has "${durable}" — no transition needed`);
    return result;
  }

  if (policy.stackedPrUatDefault === "skip") {
    for (const stale of [UNABLE_LABEL, REQUESTED_LABEL]) {
      if (labels.includes(stale)) {
        removeLabelFn(repo, prNumber, stale, dryRun);
        result.removed.push(stale);
      }
    }
    addLabelFn(repo, prNumber, SKIP_LABEL, dryRun);
    result.added = SKIP_LABEL;
    return result;
  }

  if (labels.includes(UNABLE_LABEL)) {
    removeLabelFn(repo, prNumber, UNABLE_LABEL, dryRun);
    result.removed.push(UNABLE_LABEL);
  }

  if (!labels.includes(REQUESTED_LABEL)) {
    addLabelFn(repo, prNumber, REQUESTED_LABEL, dryRun);
    result.added = REQUESTED_LABEL;
  } else {
    console.log(`PR #${prNumber} already has "${REQUESTED_LABEL}"`);
  }

  return result;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(usage());
    process.exit(1);
  }

  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  if (!args.prNumber || !/^\d+$/.test(args.prNumber)) {
    console.error("Missing or invalid <pr-number>");
    console.error(usage());
    process.exit(1);
  }

  const repo = args.repo || process.env.GITHUB_REPOSITORY;
  if (!repo) {
    console.error(
      "Repo not specified. Pass --repo owner/name or set GITHUB_REPOSITORY."
    );
    process.exit(1);
  }

  try {
    const policy = loadPolicy(args.policyPath);
    transition({
      repo,
      prNumber: args.prNumber,
      policy,
      dryRun: args.dryRun,
    });
  } catch (err) {
    console.error(err.message);
    process.exit(err.exitCode ?? 2);
  }
}

// Run main() when invoked as a script; allow import for tests.
const isDirectInvocation = import.meta.url === `file://${process.argv[1]}`;
if (isDirectInvocation) {
  main();
}
