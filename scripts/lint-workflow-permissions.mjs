#!/usr/bin/env node
// Lints .github/workflows/*.yml for permission and env declarations that
// match each step's actual shell content. Catches the silent-failure
// pattern that hit PR #545 (gh pr edit without pull-requests: write) and
// PR #517 (gh pr view/edit without GH_TOKEN in env). See PR body of the
// `bot/ci-lint-workflows` PR for the full incident summary.
//
// Hard rules (exit 1 on violation):
//   GH-PR-WRITE       gh pr edit/create/close/reopen/review/merge/ready
//                     → top-level or job permissions.pull-requests must be 'write'
//   GH-ISSUE-WRITE    gh issue edit/create/close/reopen/comment OR
//                     gh label create/edit/delete
//                     → permissions.issues must be 'write'
//   GIT-PUSH-WRITE    `git push` (any form, including --force, --force-with-lease)
//                     → permissions.contents must be 'write'
//   GH-TOKEN-ENV      step's run: invokes `gh` at all
//                     → effective env (workflow|job|step) must set GH_TOKEN
//
// Soft rules (warning only, exit 0):
//   SILENT-ERROR      a single shell statement contains both `2>/dev/null`
//                     and `|| true`. This is the pattern that swallowed the
//                     403 stderr + exit code on stack-approved-prs.yml.
//
// Usage:
//   node scripts/lint-workflow-permissions.mjs <dir>
//   node scripts/lint-workflow-permissions.mjs --help
//   node scripts/lint-workflow-permissions.mjs --list-rules
//
// Effective-scope rules:
//   permissions: step never sets these; the script merges workflow-level
//   with job-level (job wins for any key it sets). If the workflow has
//   permissions: write-all, every key is 'write'. If permissions: read-all
//   or {} or unset, only the default minimal token applies — and only
//   contents: read by default per GitHub's 2023 token policy.
//
//   env: union of workflow.env, job.env, step.env. Step wins for any key
//   it sets, then job, then workflow. We only care about presence, not
//   value precedence, except that an empty-string value still counts as
//   "set".
//
// Output: one line per finding,
//   <file>:<line>: <level>: <rule-id>: <message>
//
// No external API calls. No filesystem writes. Just parse + grep + report.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseDocument, isMap, isSeq, isScalar, LineCounter } from 'yaml';

const ARGS = process.argv.slice(2);

if (ARGS.includes('--help') || ARGS.length === 0) {
  printHelp();
  process.exit(ARGS.length === 0 ? 1 : 0);
}
if (ARGS.includes('--list-rules')) {
  printRules();
  process.exit(0);
}

const target = resolve(ARGS[0]);
const files = collectWorkflowFiles(target);
if (files.length === 0) {
  console.error(`no workflow files found under ${target}`);
  process.exit(1);
}

let errorCount = 0;
let warningCount = 0;

for (const file of files) {
  const findings = lintFile(file);
  for (const f of findings) {
    const rel = file.startsWith(process.cwd())
      ? file.slice(process.cwd().length + 1)
      : file;
    console.log(`${rel}:${f.line}: ${f.level}: ${f.ruleId}: ${f.message}`);
    if (f.level === 'error') errorCount++;
    else warningCount++;
  }
}

const summary = `${errorCount} error(s), ${warningCount} warning(s) across ${files.length} workflow file(s)`;
if (errorCount > 0) {
  console.error(`\n${summary}`);
  process.exit(1);
}
console.log(`\n${summary}`);
process.exit(0);

// ---------- helpers ----------

function printHelp() {
  console.log(`lint-workflow-permissions — assert workflow permissions/env match shell content

Usage:
  node scripts/lint-workflow-permissions.mjs <dir-or-file>
  node scripts/lint-workflow-permissions.mjs --list-rules
  node scripts/lint-workflow-permissions.mjs --help

Exits 1 on any error-level finding, 0 on warnings or clean runs.
See scripts/README-lint-workflow-permissions.md for the rule catalog.`);
}

function printRules() {
  const rules = [
    ['GH-PR-WRITE', 'error', 'gh pr <write-verb> needs permissions.pull-requests: write'],
    ['GH-ISSUE-WRITE', 'error', 'gh issue/label <write-verb> needs permissions.issues: write'],
    ['GIT-PUSH-WRITE', 'error', 'git push needs permissions.contents: write'],
    ['GH-TOKEN-ENV', 'error', 'any `gh` call needs GH_TOKEN in effective env'],
    ['SILENT-ERROR', 'warning', '`2>/dev/null` + `|| true` on the same statement swallows real errors'],
  ];
  for (const [id, level, msg] of rules) {
    console.log(`${id.padEnd(18)} ${level.padEnd(8)} ${msg}`);
  }
}

function collectWorkflowFiles(target) {
  const stat = statSync(target);
  if (stat.isFile()) return [target];
  const out = [];
  for (const entry of readdirSync(target)) {
    if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) continue;
    out.push(join(target, entry));
  }
  return out.sort();
}

function lintFile(file) {
  const src = readFileSync(file, 'utf8');
  const lineCounter = new LineCounter();
  const doc = parseDocument(src, { lineCounter });
  if (doc.errors.length > 0) {
    return [{
      line: doc.errors[0].linePos?.[0]?.line ?? 1,
      level: 'error',
      ruleId: 'YAML-PARSE',
      message: `YAML parse error: ${doc.errors[0].message}`,
    }];
  }

  const workflowPerms = getNode(doc.contents, 'permissions');
  const workflowEnv = getNode(doc.contents, 'env');
  const jobs = getNode(doc.contents, 'jobs');
  if (!isMap(jobs)) return [];

  const findings = [];
  for (const jobPair of jobs.items) {
    const jobName = scalarValue(jobPair.key);
    const job = jobPair.value;
    if (!isMap(job)) continue;
    const jobPerms = getNode(job, 'permissions');
    const jobEnv = getNode(job, 'env');
    const steps = getNode(job, 'steps');
    if (!isSeq(steps)) continue;

    for (const step of steps.items) {
      if (!isMap(step)) continue;
      const run = getNode(step, 'run');
      if (!isScalar(run) || typeof run.value !== 'string') continue;
      const runText = run.value;
      const stepEnv = getNode(step, 'env');
      const stepLine = lineOf(run, lineCounter)
        || lineOf(step, lineCounter)
        || 1;

      const effectivePerms = mergePermissions(workflowPerms, jobPerms);
      const effectiveEnvKeys = collectEnvKeys(workflowEnv, jobEnv, stepEnv);

      findings.push(...checkStep({
        file,
        jobName,
        stepLine,
        runText,
        effectivePerms,
        effectiveEnvKeys,
      }));
    }
  }
  return findings;
}

// Merge top-level and job-level `permissions:`. Returns an object with
// known keys mapped to 'read' | 'write' | 'none'. Three input shapes:
//   undefined            → {} (GitHub default — minimal token, contents: read)
//   'read-all'           → every key 'read'
//   'write-all'          → every key 'write'
//   { key: value, ... }  → exact mapping; unspecified keys default to 'none'
//
// Job-level permissions REPLACE the workflow-level set, per GitHub docs —
// they don't merge key-by-key. We follow that semantics.
function mergePermissions(workflowPerms, jobPerms) {
  const effective = normalizePermissions(jobPerms ?? workflowPerms);
  return effective;
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

function collectEnvKeys(...envNodes) {
  const keys = new Set();
  for (const node of envNodes) {
    if (!isMap(node)) continue;
    for (const pair of node.items) {
      const k = scalarValue(pair.key);
      if (typeof k === 'string') keys.add(k);
    }
  }
  return keys;
}

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
  // Resolve a 1-based line number for any yaml AST node. yaml's
  // LineCounter, populated by parseDocument, maps byte offsets to
  // 1-based {line, col}. The node's `range` is a [start, valueEnd,
  // nodeEnd] byte-offset triple — we use start.
  const range = node?.range;
  if (!range || !lineCounter) return 0;
  return lineCounter.linePos(range[0]).line;
}

// ---------- per-step rule checks ----------

function checkStep({ file, jobName, stepLine, runText, effectivePerms, effectiveEnvKeys }) {
  const findings = [];

  // Strip comment-only lines so we don't false-positive on `# git push ...`
  // explanations. Keep the original text for line-anchored reporting.
  const stripped = runText
    .split('\n')
    .map((l) => l.replace(/^\s*#.*$/, ''))
    .join('\n');

  // GH-PR-WRITE
  const ghPrWriteRe = /(?<![\w-])gh\s+pr\s+(edit|create|close|reopen|review|merge|ready)\b/;
  if (ghPrWriteRe.test(stripped)) {
    if (!permissionAtLeastWrite(effectivePerms, 'pull-requests')) {
      findings.push({
        line: stepLine,
        level: 'error',
        ruleId: 'GH-PR-WRITE',
        message: `job '${jobName}' calls 'gh pr <write-verb>' but effective permissions.pull-requests is not 'write'`,
      });
    }
  }

  // GH-ISSUE-WRITE
  const ghIssueWriteRe = /(?<![\w-])gh\s+issue\s+(edit|create|close|reopen|comment)\b/;
  const ghLabelWriteRe = /(?<![\w-])gh\s+label\s+(create|edit|delete)\b/;
  if (ghIssueWriteRe.test(stripped) || ghLabelWriteRe.test(stripped)) {
    if (!permissionAtLeastWrite(effectivePerms, 'issues')) {
      findings.push({
        line: stepLine,
        level: 'error',
        ruleId: 'GH-ISSUE-WRITE',
        message: `job '${jobName}' calls 'gh issue/label <write-verb>' but effective permissions.issues is not 'write'`,
      });
    }
  }

  // GIT-PUSH-WRITE
  const gitPushRe = /(?<![\w-])git\s+push\b/;
  if (gitPushRe.test(stripped)) {
    if (!permissionAtLeastWrite(effectivePerms, 'contents')) {
      findings.push({
        line: stepLine,
        level: 'error',
        ruleId: 'GIT-PUSH-WRITE',
        message: `job '${jobName}' runs 'git push' but effective permissions.contents is not 'write'`,
      });
    }
  }

  // GH-TOKEN-ENV — any `gh` invocation needs GH_TOKEN in scope.
  const anyGhRe = /(?<![\w-])gh\s+(pr|issue|label|api|run|workflow|release|repo|auth|search|secret|variable|cache|gist|browse|status|extension|attestation)\b/;
  if (anyGhRe.test(stripped)) {
    if (!effectiveEnvKeys.has('GH_TOKEN') && !effectiveEnvKeys.has('GITHUB_TOKEN')) {
      // Accept GITHUB_TOKEN too — `gh` reads it as a fallback.
      findings.push({
        line: stepLine,
        level: 'error',
        ruleId: 'GH-TOKEN-ENV',
        message: `job '${jobName}' invokes 'gh' but no GH_TOKEN (or GITHUB_TOKEN) is set in workflow/job/step env`,
      });
    }
  }

  // SILENT-ERROR (warning)
  for (const [idx, rawLine] of runText.split('\n').entries()) {
    if (/2>\/dev\/null/.test(rawLine) && /\|\|\s*true\b/.test(rawLine)) {
      findings.push({
        line: stepLine + idx,
        level: 'warning',
        ruleId: 'SILENT-ERROR',
        message: `job '${jobName}' uses '2>/dev/null' with '|| true' on the same line — swallows both stderr and exit code`,
      });
    }
  }

  return findings;
}
