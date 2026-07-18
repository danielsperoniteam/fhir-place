#!/usr/bin/env node
// Lints .github/workflows/*.yml for silent-failure idioms that produced
// the outages described in ADR 0007 (docs/decisions/0007-testing-sdlc-
// infrastructure.md).
//
// Rules (all exit 1 on violation):
//
//   GH-STDERR-SUPPRESS   A line containing a `gh` invocation also contains
//                        `2>/dev/null`. Stderr suppression hides 403/404
//                        errors that signal a missing permission or token.
//                        (Regression: bug #1 — stack-approved-prs.yml
//                        swallowed `pull-requests: write` 403.)
//
//   GH-SILENT-OR-TRUE    A line calling `gh pr edit`, `gh issue edit`, or
//                        `gh api` also contains `|| true`. Combined with
//                        stderr suppression this swallows both exit code
//                        and stderr. (Regression: ADR 0007 label-edit
//                        suppression idiom.)
//
//   MISSING-PIPEFAIL     A multi-line `run:` block (more than one non-blank
//                        shell line) does not begin with `set -euo pipefail`
//                        (or `set -e`). Without it, a failing `gh` command
//                        mid-block continues silently.
//
//   GH-PR-LABEL-WRITE    A step calls `gh pr edit --add-label` or
//                        `gh pr edit --remove-label` but the effective
//                        permissions block does not grant
//                        `pull-requests: write`. (Regression: bug #1.)
//
//   GH-ISSUE-WRITE       A step calls `gh issue create` or `gh issue edit`
//                        but `issues: write` is missing. (Regression: bug
//                        #2 pattern — missing scope on a write call.)
//
// Inline waiver:
//   Place a comment `# lint-workflows: allow <rule-id>` on the line
//   immediately before the flagged shell line to suppress that one
//   finding. The comment must name the rule precisely.
//
//   Example:
//     # lint-workflows: allow GH-STDERR-SUPPRESS
//     kill "$(cat dev.pid)" 2>/dev/null || true
//
// Usage:
//   node scripts/sdlc/lint-workflows.mjs [<dir-or-file>]
//   node scripts/sdlc/lint-workflows.mjs --help
//   node scripts/sdlc/lint-workflows.mjs --list-rules
//
// Defaults to .github/workflows when no path is given.
//
// Output: one line per finding:
//   <file>:<line>: error: <rule-id>: <message>
//   Remediation: <hint>
//
// Exit 1 on any finding; exit 0 on a clean run.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseDocument, isMap, isSeq, isScalar, LineCounter } from 'yaml';

// ---------------------------------------------------------------------------
// Rule catalog — defined early; referenced by checkRunBlock and printRules.
// ---------------------------------------------------------------------------

const RULES = [
  {
    id: 'GH-STDERR-SUPPRESS',
    description: 'gh call with 2>/dev/null — stderr suppression hides 403/404 errors',
    remediation: 'Remove 2>/dev/null. Surface the error or handle it explicitly.',
  },
  {
    id: 'GH-SILENT-OR-TRUE',
    description: 'gh pr edit / gh issue edit / gh api with || true — swallows exit code on write calls',
    remediation: "Remove '|| true'. Let the step fail loudly on a non-zero exit.",
  },
  {
    id: 'MISSING-PIPEFAIL',
    description: 'Multi-line run: block missing set -euo pipefail (or set -e)',
    remediation: "Add 'set -euo pipefail' as the first line of the run: block.",
  },
  {
    id: 'GH-PR-LABEL-WRITE',
    description: 'gh pr edit --add-label/--remove-label without pull-requests: write',
    remediation: "Add 'pull-requests: write' to the job (or workflow) permissions block.",
  },
  {
    id: 'GH-ISSUE-WRITE',
    description: 'gh issue create/edit without issues: write',
    remediation: "Add 'issues: write' to the job (or workflow) permissions block.",
  },
];

/** @param {string} ruleId */
function remediation(ruleId) {
  return RULES.find((r) => r.id === ruleId)?.remediation ?? 'See the rule catalog.';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const ARGS = process.argv.slice(2);

if (ARGS.includes('--help')) {
  printHelp();
  process.exit(0);
}
if (ARGS.includes('--list-rules')) {
  printRules();
  process.exit(0);
}

// Default target: .github/workflows relative to cwd
const rawTarget = ARGS.find((a) => !a.startsWith('-')) ?? '.github/workflows';
const target = resolve(rawTarget);

const files = collectWorkflowFiles(target);
if (files.length === 0) {
  console.error(`lint-workflows: no workflow files found under ${target}`);
  process.exit(1);
}

let errorCount = 0;

for (const file of files) {
  const findings = lintFile(file);
  for (const f of findings) {
    const rel = file.startsWith(process.cwd() + '/')
      ? file.slice(process.cwd().length + 1)
      : file;
    console.log(`${rel}:${f.line}: error: ${f.ruleId}: ${f.message}`);
    console.log(`  Remediation: ${f.remediation}`);
    errorCount++;
  }
}

const summary = `${errorCount} violation(s) across ${files.length} workflow file(s)`;
if (errorCount > 0) {
  console.error(`\n${summary}`);
  process.exit(1);
}
console.log(`\n${summary}`);
process.exit(0);

// ---------------------------------------------------------------------------
// Help / rule catalog
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`lint-workflows — flag silent-failure idioms in GitHub Actions workflows

Usage:
  node scripts/sdlc/lint-workflows.mjs [<dir-or-file>]
  node scripts/sdlc/lint-workflows.mjs --list-rules
  node scripts/sdlc/lint-workflows.mjs --help

Defaults to .github/workflows when no path is given.
Exits 1 on any violation, 0 on a clean run.

Inline waiver:
  # lint-workflows: allow <rule-id>
  <flagged line>

See docs/decisions/0007-testing-sdlc-infrastructure.md for context.`);
}

function printRules() {
  for (const r of RULES) {
    console.log(`${r.id.padEnd(24)} ${r.description}`);
    console.log(`${''.padEnd(26)}Remediation: ${r.remediation}`);
    console.log();
  }
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

function collectWorkflowFiles(target) {
  let stat;
  try {
    stat = statSync(target);
  } catch {
    return [];
  }
  if (stat.isFile()) return [target];
  const out = [];
  for (const entry of readdirSync(target)) {
    if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) continue;
    out.push(join(target, entry));
  }
  return out.sort();
}

// ---------------------------------------------------------------------------
// Per-file lint
// ---------------------------------------------------------------------------

function lintFile(file) {
  const src = readFileSync(file, 'utf8');
  const lineCounter = new LineCounter();
  const doc = parseDocument(src, { lineCounter });
  if (doc.errors.length > 0) {
    return [
      {
        line: doc.errors[0].linePos?.[0]?.line ?? 1,
        ruleId: 'YAML-PARSE',
        message: `YAML parse error: ${doc.errors[0].message}`,
        remediation: 'Fix the YAML syntax error.',
      },
    ];
  }

  const workflowPerms = getNode(doc.contents, 'permissions');
  const jobs = getNode(doc.contents, 'jobs');
  if (!isMap(jobs)) return [];

  const findings = [];
  for (const jobPair of jobs.items) {
    const jobName = scalarValue(jobPair.key) ?? '(unknown)';
    const job = jobPair.value;
    if (!isMap(job)) continue;
    const jobPerms = getNode(job, 'permissions');
    const steps = getNode(job, 'steps');
    if (!isSeq(steps)) continue;

    const effectivePerms = mergePermissions(workflowPerms, jobPerms);

    for (const step of steps.items) {
      if (!isMap(step)) continue;
      const runNode = getNode(step, 'run');
      if (!isScalar(runNode) || typeof runNode.value !== 'string') continue;

      const runText = runNode.value;
      const stepStartLine = lineOf(runNode, lineCounter) || lineOf(step, lineCounter) || 1;

      findings.push(
        ...checkRunBlock({
          file,
          jobName,
          runText,
          stepStartLine,
          effectivePerms,
          src,
          lineCounter,
          runNode,
        })
      );
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Rule checks for a single run: block
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   file: string,
 *   jobName: string,
 *   runText: string,
 *   stepStartLine: number,
 *   effectivePerms: Record<string, string>,
 *   src: string,
 *   lineCounter: import('yaml').LineCounter,
 *   runNode: import('yaml').Scalar,
 * }} ctx
 */
function checkRunBlock({ file, jobName, runText, stepStartLine, effectivePerms, src }) {
  const findings = [];
  const lines = runText.split('\n');
  // The raw source lines (0-based) let us look for waivers on the preceding line.
  const srcLines = src.split('\n');

  // Compute the 1-based line number for each shell line in the block.
  const shellLineNums = resolveShellLineNumbers(runText, stepStartLine, src);

  // MISSING-PIPEFAIL: multi-line blocks need set -euo pipefail or set -e.
  const nonBlankLines = lines.filter((l) => l.trim() !== '');
  if (nonBlankLines.length > 1) {
    const firstNonBlank = nonBlankLines[0].trim();
    const hasPipefail = /^set\s+-[a-zA-Z]*e[a-zA-Z]*/.test(firstNonBlank);

    if (!hasPipefail) {
      const blockStartLine = shellLineNums[lines.findIndex((l) => l.trim() !== '')] ?? stepStartLine;
      // Accept waiver on the line before the first shell line OR before the
      // run: key itself (stepStartLine). The latter is the natural placement
      // when the run: block is multi-line and the comment goes above `- run:`.
      const waivedAtShell = isWaived(srcLines, blockStartLine, 'MISSING-PIPEFAIL');
      const waivedAtStep = isWaived(srcLines, stepStartLine, 'MISSING-PIPEFAIL');
      if (!waivedAtShell && !waivedAtStep) {
        findings.push({
          line: blockStartLine,
          ruleId: 'MISSING-PIPEFAIL',
          message: `job '${jobName}': multi-line run: block does not start with 'set -euo pipefail'`,
          remediation: remediation('MISSING-PIPEFAIL'),
        });
      }
    }
  }

  // Per-line rules.
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const shellLine = stripShellComment(rawLine);
    const lineNum = shellLineNums[i] ?? stepStartLine + i;

    // GH-STDERR-SUPPRESS: gh ... 2>/dev/null
    if (/(?<!\w)gh\s+\w/.test(shellLine) && /2>\/dev\/null/.test(shellLine)) {
      if (!isWaived(srcLines, lineNum, 'GH-STDERR-SUPPRESS')) {
        findings.push({
          line: lineNum,
          ruleId: 'GH-STDERR-SUPPRESS',
          message: `job '${jobName}': 'gh' invocation redirects stderr to /dev/null — errors will be invisible`,
          remediation: remediation('GH-STDERR-SUPPRESS'),
        });
      }
    }

    // GH-SILENT-OR-TRUE: gh pr edit / gh issue edit / gh api ... || true
    const ghWriteRe = /(?<!\w)gh\s+(pr\s+edit|issue\s+edit|api)\b/;
    if (ghWriteRe.test(shellLine) && /\|\|\s*true\b/.test(shellLine)) {
      if (!isWaived(srcLines, lineNum, 'GH-SILENT-OR-TRUE')) {
        findings.push({
          line: lineNum,
          ruleId: 'GH-SILENT-OR-TRUE',
          message: `job '${jobName}': write call to 'gh' followed by '|| true' — exit code is silently discarded`,
          remediation: remediation('GH-SILENT-OR-TRUE'),
        });
      }
    }

    // GH-PR-LABEL-WRITE: gh pr edit --add-label / --remove-label
    if (/(?<!\w)gh\s+pr\s+edit\b/.test(shellLine) && /--(add|remove)-label\b/.test(shellLine)) {
      if (!permissionAtLeastWrite(effectivePerms, 'pull-requests')) {
        if (!isWaived(srcLines, lineNum, 'GH-PR-LABEL-WRITE')) {
          findings.push({
            line: lineNum,
            ruleId: 'GH-PR-LABEL-WRITE',
            message: `job '${jobName}': 'gh pr edit --add-label/--remove-label' requires 'pull-requests: write' but it is not granted`,
            remediation: remediation('GH-PR-LABEL-WRITE'),
          });
        }
      }
    }

    // GH-ISSUE-WRITE: gh issue create / gh issue edit
    if (/(?<!\w)gh\s+issue\s+(create|edit)\b/.test(shellLine)) {
      if (!permissionAtLeastWrite(effectivePerms, 'issues')) {
        if (!isWaived(srcLines, lineNum, 'GH-ISSUE-WRITE')) {
          findings.push({
            line: lineNum,
            ruleId: 'GH-ISSUE-WRITE',
            message: `job '${jobName}': 'gh issue create/edit' requires 'issues: write' but it is not granted`,
            remediation: remediation('GH-ISSUE-WRITE'),
          });
        }
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Waiver check
// ---------------------------------------------------------------------------

/**
 * Returns true if srcLines[lineNum - 2] (the line immediately before lineNum
 * in 1-based terms) contains `# lint-workflows: allow <ruleId>`.
 *
 * @param {string[]} srcLines - 0-based array of source lines
 * @param {number} lineNum - 1-based line number of the flagged line
 * @param {string} ruleId
 */
function isWaived(srcLines, lineNum, ruleId) {
  if (lineNum < 2) return false;
  const prevLine = srcLines[lineNum - 2]; // lineNum is 1-based; prev is index lineNum-2
  if (!prevLine) return false;
  return prevLine.includes(`# lint-workflows: allow ${ruleId}`);
}

// ---------------------------------------------------------------------------
// Shell line number resolution
// ---------------------------------------------------------------------------

/**
 * Given the run: block text and the 1-based line where the YAML value starts,
 * return an array of 1-based line numbers, one per lines[] entry in runText.
 *
 * Strategy: find the first non-empty shell line in the source starting at or
 * after stepStartLine. Once anchored, subsequent lines are consecutive.
 */
function resolveShellLineNumbers(runText, stepStartLine, src) {
  const lines = runText.split('\n');
  const srcLines = src.split('\n'); // 0-based

  const firstNonEmptyIdx = lines.findIndex((l) => l.trim() !== '');
  if (firstNonEmptyIdx === -1) {
    return lines.map((_, i) => stepStartLine + i);
  }

  const firstContent = lines[firstNonEmptyIdx].trim();

  // Search the source starting from stepStartLine (convert to 0-based)
  let anchorLine = -1;
  for (let i = stepStartLine - 1; i < srcLines.length; i++) {
    if (srcLines[i].trim() === firstContent) {
      anchorLine = i + 1; // back to 1-based
      break;
    }
  }

  if (anchorLine === -1) {
    return lines.map((_, i) => stepStartLine + i);
  }

  // Map all lines relative to the anchor.
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    result.push(anchorLine + (i - firstNonEmptyIdx));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Permissions helpers
// ---------------------------------------------------------------------------

/**
 * Merge workflow-level and job-level permissions nodes.
 * Job-level replaces workflow-level (per GitHub docs).
 */
function mergePermissions(workflowPerms, jobPerms) {
  return normalizePermissions(jobPerms ?? workflowPerms);
}

function normalizePermissions(node) {
  if (node == null) return { __default: true };
  if (isScalar(node)) {
    const v = node.value;
    if (v === 'read-all') return { __all: 'read' };
    if (v === 'write-all') return { __all: 'write' };
    return { __default: true };
  }
  if (!isMap(node)) return { __default: true };
  const out = {};
  for (const pair of node.items) {
    const k = scalarValue(pair.key);
    const v = scalarValue(pair.value);
    if (typeof k === 'string' && typeof v === 'string') {
      out[k] = v;
    }
  }
  return out;
}

function permissionAtLeastWrite(perms, key) {
  if (perms.__all === 'write') return true;
  return perms[key] === 'write';
}

// ---------------------------------------------------------------------------
// YAML helpers
// ---------------------------------------------------------------------------

function getNode(map, key) {
  if (!isMap(map)) return undefined;
  for (const pair of map.items) {
    if (scalarValue(pair.key) === key) return pair.value;
  }
  return undefined;
}

function scalarValue(node) {
  if (node == null) return undefined;
  if (isScalar(node)) return node.value;
  return undefined;
}

function lineOf(node, lineCounter) {
  const range = node?.range;
  if (!range || !lineCounter) return 0;
  return lineCounter.linePos(range[0]).line;
}

// Strip shell comment suffixes so we don't false-positive on `# gh pr edit ...`
// explanations. Lines that ARE comments (start with #) return empty.
function stripShellComment(line) {
  if (/^\s*#/.test(line)) return '';
  // Strip trailing inline comments (heuristic: # preceded by whitespace)
  return line.replace(/\s+#.*$/, '');
}
