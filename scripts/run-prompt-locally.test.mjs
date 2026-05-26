// Tests for run-prompt-locally.sh provider dispatch.
//
// Run with:
//   node --test scripts/run-prompt-locally.test.mjs
//
// The tests stub `claude` and `codex`, so no LLM call is made.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "run-prompt-locally.sh",
);

function writeExecutable(path, body) {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function runGit(args, cwd) {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });
}

function makeHarness(promptName = "provider-smoke") {
  const root = mkdtempSync(join(tmpdir(), "run-prompt-local-"));
  const home = join(root, "home");
  const repo = join(root, "repo");
  const origin = join(root, "origin.git");
  const logs = join(root, "logs");
  const capture = join(root, "capture");
  const bin = join(home, ".local", "bin");

  mkdirSync(bin, { recursive: true });
  mkdirSync(logs, { recursive: true });
  mkdirSync(capture, { recursive: true });

  execFileSync("git", ["init", "--bare", origin], { stdio: "ignore" });
  mkdirSync(join(repo, "docs", "prompts"), { recursive: true });
  runGit(["init", "-b", "main"], repo);
  writeFileSync(
    join(repo, "docs", "prompts", `${promptName}.md`),
    `# ${promptName}\n\nRun the prompt.\n`,
  );
  runGit(["add", "."], repo);
  runGit(["commit", "-m", "seed"], repo);
  runGit(["remote", "add", "origin", origin], repo);
  runGit(["push", "-u", "origin", "main"], repo);

  writeExecutable(
    join(bin, "claude"),
    `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$STUB_CAPTURE/claude.args"
cat > "$STUB_CAPTURE/claude.stdin"
`,
  );
  writeExecutable(
    join(bin, "codex"),
    `#!/usr/bin/env bash
printf '%s\\n' "$@" > "$STUB_CAPTURE/codex.args"
cat > "$STUB_CAPTURE/codex.stdin"
`,
  );

  const env = {
    ...process.env,
    HOME: home,
    PATH: `${bin}:${process.env.PATH}`,
    REPO_ROOT: repo,
    LOG_DIR: logs,
    PAUSE_FILE: join(root, "pause"),
    GITHUB_TOKEN: "test-token",
    GH_TOKEN: "test-token",
    STUB_CAPTURE: capture,
  };

  return { root, repo, logs, capture, env, promptName };
}

function runHarness(harness, extraEnv = {}, args = []) {
  return spawnSync("bash", [SCRIPT_PATH, harness.promptName, ...args], {
    cwd: harness.repo,
    env: { ...harness.env, ...extraEnv },
    encoding: "utf8",
  });
}

test("defaults to Claude and preserves Claude-specific flags", () => {
  const h = makeHarness("default-claude");
  const result = runHarness(h, {}, [
    "--for",
    "PR #123",
    "--max-turns",
    "40",
    "--allowedTools",
    "Read,Grep",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(existsSync(join(h.capture, "codex.args")), false);

  const args = readFileSync(join(h.capture, "claude.args"), "utf8");
  assert.match(args, /--print/);
  assert.match(args, /--add-dir/);
  assert.match(args, /--dangerously-skip-permissions/);
  assert.match(args, /--max-turns\n40/);
  assert.match(args, /--allowedTools\nRead,Grep/);

  const stdin = readFileSync(join(h.capture, "claude.stdin"), "utf8");
  assert.match(stdin, /Execute the instructions in the prompt below for PR #123/);
  assert.match(stdin, /# default-claude/);
  assert.doesNotMatch(stdin, /Codex CLI/);
});

test("AGENT_PROVIDER=codex invokes codex exec with provider prologue", () => {
  const h = makeHarness("codex-provider");
  const result = runHarness(h, { AGENT_PROVIDER: "codex" }, [
    "--max-turns",
    "80",
    "--allowedTools",
    "Read,Edit",
    "--disallowedTools",
    "AskUserQuestion",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(existsSync(join(h.capture, "claude.args")), false);

  const args = readFileSync(join(h.capture, "codex.args"), "utf8");
  assert.match(args, /^exec\n/);
  const escapedRepo = h.repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(args, new RegExp(`-C\\n${escapedRepo}`));
  assert.match(args, /--sandbox\nworkspace-write/);
  assert.match(args, /approval_policy="never"/);
  assert.doesNotMatch(args, /--allowedTools/);
  assert.doesNotMatch(args, /--max-turns/);

  const stdin = readFileSync(join(h.capture, "codex.stdin"), "utf8");
  assert.match(stdin, /You are running this automation under Codex CLI/);
  assert.match(stdin, /Original allowed tool intent: Read,Edit/);
  assert.match(stdin, /Original disallowed tool intent: AskUserQuestion/);
  assert.match(stdin, /# codex-provider/);
});

test("prompt lock is shared across providers", () => {
  const promptName = `lock-${process.pid}`;
  const h = makeHarness(promptName);
  const lockDir = join("/tmp", `fhir-place-${promptName}.lock`);
  rmSync(lockDir, { force: true, recursive: true });
  mkdirSync(lockDir);
  writeFileSync(join(lockDir, "pid"), String(process.pid));

  try {
    const result = runHarness(h, { AGENT_PROVIDER: "codex" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /another run is in flight/);
    assert.equal(existsSync(join(h.capture, "codex.args")), false);
    assert.equal(existsSync(join(h.capture, "claude.args")), false);
  } finally {
    rmSync(lockDir, { force: true, recursive: true });
  }
});
