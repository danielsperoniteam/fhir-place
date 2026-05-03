/**
 * Standalone runner for the LLM-agent harness.
 *
 *   tsx e2e-agent/runner.ts --task=find-allergies
 *
 * Boots a Chromium browser, points the deployed demo at the SMART Health IT
 * R4 server (via localStorage init), runs the agent loop, then writes a JSON
 * report + screenshots to `e2e-agent/results/<runId>/`.
 *
 * Phase-1 scope: no judge, no triage layer, no CI. Exit code is 0 if the
 * agent reported `success`, 1 otherwise.
 */

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent } from "./agent/driver.js";
import type { ToolContext } from "./agent/tools.js";
import type { RunReport } from "./agent/types.js";
import { ALL_TASKS, TASKS_BY_ID } from "./tasks/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SMART_FHIR_BASE = "https://r4.smarthealthit.org";
const DEFAULT_BASE_URL = "https://samsuffolksperoni.github.io/fhir-place/";

interface CliArgs {
  taskId: string;
  baseUrl: string;
  fhirBaseUrl: string;
  apiKey: string;
  model: string;
  costCeilingUsd: number;
  wallclockMs: number;
  maxSteps: number;
  headed: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const eq = args.find((a) => a.startsWith(`${flag}=`));
    if (eq) return eq.slice(flag.length + 1);
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set. Aborting.");
    process.exit(2);
  }

  return {
    taskId: get("--task") ?? "find-allergies",
    baseUrl: get("--base-url") ?? process.env.LIVE_SITE_BASE_URL ?? DEFAULT_BASE_URL,
    fhirBaseUrl: get("--fhir-base") ?? process.env.LIVE_FHIR_BASE_URL ?? SMART_FHIR_BASE,
    apiKey,
    model: get("--model") ?? process.env.AGENT_MODEL ?? "claude-sonnet-4-6",
    costCeilingUsd: Number(get("--cost-ceiling") ?? "0.25"),
    wallclockMs: Number(get("--wallclock-ms") ?? "90000"),
    maxSteps: Number(get("--max-steps") ?? "25"),
    headed: args.includes("--headed"),
  };
}

async function checkFhirReachable(baseUrl: string): Promise<boolean> {
  const skip = process.env.SKIP_IF_UNREACHABLE !== "0";
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5_000);
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/metadata`, {
      headers: { accept: "application/fhir+json" },
      signal: ac.signal,
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    if (!skip) throw new Error(`FHIR server unreachable: ${baseUrl}`);
    return false;
  }
}

async function main() {
  const cli = parseArgs();
  const task =
    cli.taskId === "random"
      ? ALL_TASKS[Math.floor(Math.random() * ALL_TASKS.length)]
      : TASKS_BY_ID[cli.taskId];
  if (!task) {
    console.error(
      `Unknown task: ${cli.taskId}. Known: random, ${Object.keys(TASKS_BY_ID).join(", ")}`,
    );
    process.exit(2);
  }

  const reachable = await checkFhirReachable(cli.fhirBaseUrl);
  if (!reachable) {
    console.warn(`SMART FHIR server unreachable at ${cli.fhirBaseUrl} — skipping run.`);
    process.exit(0);
  }

  const runId = `${task.id}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runDir = resolve(__dirname, "results", runId);
  const screenshotsDir = join(runDir, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({ headless: !cli.headed });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    baseURL: cli.baseUrl,
  });

  // Pin the SMART server before any app code runs.
  await context.addInitScript(
    ({ activeServerId }: { activeServerId: string }) => {
      try {
        window.localStorage.setItem("fhir-place:active-server", activeServerId);
      } catch {
        // localStorage unavailable; the app falls back to the first built-in.
      }
    },
    { activeServerId: "builtin-smart" },
  );

  const page = await context.newPage();

  const consoleErrors: string[] = [];
  const failedRequests: { url: string; status: number; method: string }[] = [];
  const visitedUrls: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on("response", (res) => {
    const status = res.status();
    if (status >= 500) {
      failedRequests.push({ url: res.url(), status, method: res.request().method() });
    }
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visitedUrls.push(frame.url());
  });

  let screenshotCounter = 0;
  const toolCtx: ToolContext = {
    page,
    screenshotsDir,
    takeScreenshot: async () => {
      const name = `step-${String(screenshotCounter++).padStart(3, "0")}.png`;
      const fullPath = join(screenshotsDir, name);
      await page.screenshot({ path: fullPath, fullPage: false });
      return name;
    },
  };

  // Land on the app root before the agent takes over so the localStorage
  // init script has run and the SMART server is active.
  await page.goto("./", { waitUntil: "domcontentloaded" });

  const startedAt = new Date();
  const result = await runAgent(task, toolCtx, {
    apiKey: cli.apiKey,
    model: cli.model,
    maxSteps: cli.maxSteps,
    wallclockMs: cli.wallclockMs,
    costCeilingUsd: cli.costCeilingUsd,
  });
  const finishedAt = new Date();

  await context.close();
  await browser.close();

  const report: RunReport = {
    taskId: task.id,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    baseUrl: cli.baseUrl,
    fhirBaseUrl: cli.fhirBaseUrl,
    agentOutcome: result.outcome,
    finalStatus: result.finalStatus,
    stopReason: result.stopReason,
    steps: result.steps,
    consoleErrors,
    failedRequests,
    visitedUrls,
    cost: result.cost,
    errorMessage: result.errorMessage,
  };

  const reportPath = join(runDir, "report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(
    `[${task.id}] ${result.finalStatus} (${result.stopReason}) — ${result.steps.length} steps, $${result.cost.estimatedUsd.toFixed(4)} → ${reportPath}`,
  );

  // Phase 1: pass = success. Anything else returns 1 so the caller can act.
  process.exit(result.finalStatus === "success" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
