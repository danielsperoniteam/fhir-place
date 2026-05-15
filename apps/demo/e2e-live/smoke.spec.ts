import { expect, test } from "@playwright/test";

/**
 * Live-site smoke tests. Run nightly by `.github/workflows/live-site-monitor.yml`
 * against the deployed demo, hitting real HAPI. Failures auto-file GitHub
 * issues — keep test names short and stable so the dedupe logic
 * (`[demo] <test name>`) works.
 *
 * Tests should be data-shape tolerant — HAPI is a shared public server, the
 * specific patients there change. Assert structure and behavior, not literal
 * data values. Skip rather than fail if the prerequisite data isn't there.
 */

const consoleErrors: string[] = [];

test.beforeEach(async ({ page }, testInfo) => {
  consoleErrors.length = 0;
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  testInfo.annotations.push({ type: "live-url", description: testInfo.title });
});

test("home redirects to Patient list and renders", async ({ page }) => {
  const response = await page.goto("./");
  expect(response?.status(), "home should respond 2xx").toBeLessThan(400);
  await expect(page.getByRole("heading", { name: /patients/i })).toBeVisible();
});

test("Patient list shows at least one row", async ({ page }) => {
  await page.goto("./#/Patient");
  await expect(page.getByRole("heading", { name: /patients/i })).toBeVisible();
  const rows = page.getByTestId("resource-row");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  expect(await rows.count()).toBeGreaterThan(0);
});

test("Patient detail page renders without an error wall", async ({ page }) => {
  await page.goto("./#/Patient");
  // ResourceTable's `auto` layout renders a `<table>` (testid `resource-row`)
  // on `>=sm` viewports and a card stack (testid `resource-row-card`) below
  // `sm` (Tailwind's 640px breakpoint). Both DOM trees exist; the wrong one is
  // hidden by CSS. Pick whichever is visible at this viewport so the smoke
  // contract holds on both `chromium-desktop` and `iphone` projects.
  const viewport = page.viewportSize();
  const rowTestId =
    viewport && viewport.width < 640 ? "resource-row-card" : "resource-row";
  const firstRow = page.getByTestId(rowTestId).first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });
  await firstRow.click();

  // Detail pages render a Patient resource view + compartment chips. The
  // ResourceView's `<h2>Patient</h2>` is stable across desktop and mobile
  // layouts; the bare `getByText(/^Patient/i).first()` used previously
  // matched the topbar tab label, which is collapsed behind the hamburger
  // menu at `<sm` and tripped the iphone project.
  await expect(
    page.getByRole("heading", { level: 2, name: /^Patient$/i }),
  ).toBeVisible();
  // No red error wall: assert "Failed to" / "Could not resolve" don't appear.
  const errorBanner = page.getByText(
    /failed to load|could not resolve structuredefinition|Cannot read properties of/i,
  );
  await expect(errorBanner).toHaveCount(0);
});

test("Patient detail shows compartment chips", async ({ page }) => {
  await page.goto("./#/Patient");
  await page.getByTestId("resource-row").first().click();
  // The chip nav is rendered for every Patient detail page (counts may be 0).
  await expect(page.getByTestId("compartment-links")).toBeVisible({
    timeout: 30_000,
  });
});

test("ResourceSearch documentation is clipped (no Multiple Resources dump)", async ({
  page,
}) => {
  await page.goto("./#/Patient");
  // Open the search form (visible inline on the list).
  await expect(page.getByTestId("resource-search")).toBeVisible();
  // No field on this page should display the literal "Multiple Resources:"
  // dumped directly from SearchParameter.documentation.
  await expect(page.getByText(/^Multiple Resources:/)).toHaveCount(0);
});

test("no console errors on the Patient list", async ({ page }) => {
  await page.goto("./#/Patient");
  await expect(page.getByRole("heading", { name: /patients/i })).toBeVisible();
  // Wait for any async errors to surface.
  await page.waitForTimeout(2_000);
  // GitHub Pages 404 fallback rendering is OK; React/runtime errors are not.
  const fatal = consoleErrors.filter(
    (m) => !/favicon|net::ERR_BLOCKED_BY_CLIENT|MockServiceWorker/.test(m),
  );
  expect(fatal, fatal.join("\n")).toHaveLength(0);
});
