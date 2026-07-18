import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Mobile specs are scoped to the `iphone` project; without this
      // ignore, default `pnpm e2e` would also try them at desktop width,
      // where `resource-row-card` is hidden by the `sm:` breakpoint.
      testIgnore: /.*\.mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "screenshots",
      testMatch: /.*\.screenshot\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      // Mirror the live-site-monitor's `iphone` project so phone-viewport
      // regressions surface on PR CI, not just nightly. Scoped to specs
      // tagged `.mobile.spec.ts` so other tests stay desktop-only.
      name: "iphone",
      testMatch: /.*\.mobile\.spec\.ts/,
      use: { ...devices["iPhone 14"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
