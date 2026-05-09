/**
 * Standalone runner for the LLM-agent harness.
 *
 *   tsx e2e-agent/runner.ts --task=find-allergies
 *
 * Boots a Chromium browser, points the deployed demo at the FHIR server
 * resolved from --fhir-base / LIVE_FHIR_BASE_URL (defaults to SMART Health
 * IT R4) via a localStorage init script, runs the agent loop, then writes a
 * JSON report + screenshots to `e2e-agent/results/<runId>/`.
 *
 * Phase-1 scope: no judge, no triage layer, no CI. Exit codes:
 *   0  agent reported success
 *   1  agent reported anything else (failure / blocked / error)
 *   2  bad CLI args or missing API key
 *  75  FHIR server unreachable (EX_TEMPFAIL) — distinguishes infra blip
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

/**
 * Mirror of `apps/demo/src/config.ts` BUILTIN_SERVERS, kept inline so the
 * runner can map --fhir-base to the right `activeServerId` without importing
 * Vite-flavored app code. Keep in sync if the app gains new built-ins.
 */
const BUILTIN_SERVER_IDS_BY_BASE_URL: Readonly<Record<string, string>> = {
  "https://r4.smarthealthit.org": "builtin-smart",
  "https://hapi.fhir.org/baseR4": "builtin-hapi",
  "https://server.fire.ly": "builtin-firely",
  "https://test.fhir.org/r4": "builtin-fhir-test",
};

const AGENT_CUSTOM_SERVER_ID = "agent-custom";

const normalizeBaseUrl = (url: string): string =>
  url.trim().replace(/\/+$/, "").toLowerCase();

interface ServerSeed {
  activeServerId: string;
  customServer: {
    id: string;
    label: string;
    baseUrl: string;
    authMode: "none";
    builtin: false;
  } | null;
}

function buildServerSeed(fhirBaseUrl: string): ServerSeed {
  const normalized = normalizeBaseUrl(fhirBaseUrl);
  for (const [url, id] of Object.entries(BUILTIN_SERVER_IDS_BY_BASE_URL)) {
    if (normalizeBaseUrl(url) === normalized) {
      return { activeServerId: id, customServer: null };
    }
  }
  let host = fhirBaseUrl;
  try {
    host = new URL(fhirBaseUrl).host;
  } catch {
    // Use raw URL as label fallback.
  }
  return {
    activeServerId: AGENT_CUSTOM_SERVER_ID,
    customServer: {
      id: AGENT_CUSTOM_SERVER_ID,
      label: `Agent override (${host})`,
      baseUrl: fhirBaseUrl,
      authMode: "none",
      builtin: false,
    },
  };
}

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
    // Use exit code 75 (EX_TEMPFAIL) so callers can tell an infra-side outage
    // apart from an agent verdict (success=0, failure=1, bad-args=2).
    console.warn(`FHIR server unreachable at ${cli.fhirBaseUrl} — skipping run.`);
    process.exit(75);
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

  // Pin the active FHIR server before any app code runs. If --fhir-base
  // points at a known built-in, just select it; otherwise seed a custom
  // entry in the servers list and select that.
  const seed = buildServerSeed(cli.fhirBaseUrl);
  await context.addInitScript(
    ({ activeServerId, customServer }) => {
      try {
        window.localStorage.setItem("fhir-place:active-server", activeServerId);
        if (customServer) {
          const raw = window.localStorage.getItem("fhir-place:servers");
          let servers: unknown[] = [];
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) servers = parsed;
            } catch {
              servers = [];
            }
          }
          const others = servers.filter(
            (s) =>
              !s ||
              typeof s !== "object" ||
              (s as { id?: unknown }).id !== customServer.id,
          );
          window.localStorage.setItem(
            "fhir-place:servers",
            JSON.stringify([...others, customServer]),
          );
        }
      } catch {
        // localStorage unavailable; the app falls back to the first built-in.
      }
    },
    { activeServerId: seed.activeServerId, customServer: seed.customServer },
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
  // init script has run and the configured FHIR server is active.
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
