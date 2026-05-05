import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the live-site monitor: hits the deployed
 * GitHub Pages demo (no local dev server). Used by the
 * `.github/workflows/live-site-monitor.yml` cron job which then opens GitHub
 * issues for any failing tests.
 *
 * Override the target URL with `LIVE_SITE_BASE_URL` if you ever move the
 * demo (e.g. to a custom domain).
 */
const baseURL =
  process.env.LIVE_SITE_BASE_URL ??
  "https://danielsperoniteam.github.io/fhir-place/";

export default defineConfig({
  testDir: "./e2e-live",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // One worker — live HAPI is a shared public server; don't hammer it.
  workers: 1,
  fullyParallel: false,
  retries: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/live-results.json" }],
    ["html", { outputFolder: "playwright-report-live", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "iphone",
      use: { ...devices["iPhone 14"] },
    },
  ],
});
