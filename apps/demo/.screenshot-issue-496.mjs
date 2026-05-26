// One-off script for issue #496 PR screenshots. Captures cold-load
// (cleared localStorage) of the prod build against a non-localhost-style
// base path, both desktop and mobile, plus a "before" frame simulating
// a stale persisted localhost:8080 selection so reviewers can see what
// the UAT browser was hitting.
//
// Usage:
//   1. Build: VITE_BASE_PATH=/fhir-place/staging/ VITE_USE_MOCK=false \
//        pnpm --filter @fhir-place/demo build
//   2. Serve: pnpm exec vite preview --port 5174 --host 127.0.0.1
//   3. Run:   node apps/demo/.screenshot-issue-496.mjs

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const OUT_DIR = "screenshots/pr-issue-496-hosted-demo-default-server";
const BASE = "http://127.0.0.1:5174/fhir-place/staging/";

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 375, height: 812 },
];

const SCENARIOS = [
  {
    name: "before-localhost-persisted",
    description:
      "User had previously added a custom Local HAPI (Docker) server " +
      "and selected it (the UAT walker situation). Per acceptance criteria " +
      "an explicit selection is preserved, so the picker still shows " +
      "localhost:8080.",
    seed: async (page) => {
      await page.evaluate(() => {
        localStorage.setItem(
          "fhir-place:servers",
          JSON.stringify([
            {
              id: "custom-localhost-hapi",
              label: "Local HAPI (Docker)",
              baseUrl: "http://localhost:8080/fhir",
              authMode: "none",
            },
          ]),
        );
        localStorage.setItem(
          "fhir-place:active-server",
          "custom-localhost-hapi",
        );
      });
    },
  },
  {
    name: "after-cleared-localstorage",
    description:
      "Brand-new visitor on the hosted Pages origin: cold-load with no " +
      "localStorage. After the fix, this lands on SMART Health IT (R4) " +
      "instead of the first builtin by array index — pinned by id.",
    seed: async (page) => {
      await page.evaluate(() => {
        localStorage.clear();
      });
    },
  },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      for (const scenario of SCENARIOS) {
        const ctx = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
        });
        const page = await ctx.newPage();
        page.on("pageerror", (err) =>
          // eslint-disable-next-line no-console
          console.error(`[${scenario.name}/${viewport.name}] pageerror:`, err.message),
        );
        page.on("console", (msg) => {
          if (msg.type() === "error") {
            // eslint-disable-next-line no-console
            console.error(
              `[${scenario.name}/${viewport.name}] console.error:`,
              msg.text(),
            );
          }
        });
        // Visit once so localStorage is bound to this origin, seed, reload.
        await page.goto(BASE, { waitUntil: "domcontentloaded" });
        await scenario.seed(page);
        await page.goto(BASE, { waitUntil: "domcontentloaded" }).catch(() => {});
        await page
          .getByTestId("server-picker")
          .waitFor({ state: "visible", timeout: 15_000 })
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.error(
              `[${scenario.name}/${viewport.name}] picker not visible:`,
              err.message,
            );
          });
        // Small settle delay so transient loading states don't flash in.
        await page.waitForTimeout(500);
        const file = `${OUT_DIR}/${scenario.name}-${viewport.name}.png`;
        await page.screenshot({ path: file, fullPage: false });
        // eslint-disable-next-line no-console
        console.log(`wrote ${file}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
