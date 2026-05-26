import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

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

/**
 * `ResourceTable` renders a wide `resource-row` table layout above the `sm`
 * breakpoint (640px) and a `resource-row-card` card stack below it. Both
 * trees are always in the DOM — the breakpoint just `display:none`s the
 * other one. The iPhone project runs at 390px, so a hard-coded
 * `resource-row` locator resolves to the hidden table row and never becomes
 * visible. Filter to the visible variant so the suite works on either
 * viewport.
 */
function resourceRows(page: Page): Locator {
  return page.getByTestId(/^resource-row(-card)?$/).filter({ visible: true });
}

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
  const rows = resourceRows(page);
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  expect(await rows.count()).toBeGreaterThan(0);
});

test("Patient detail page renders without an error wall", async ({ page }) => {
  await page.goto("./#/Patient");
  const firstRow = resourceRows(page).first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });
  await firstRow.click();

  // Detail pages render a Patient resource view. Assert on the view's
  // testid, not a `/^Patient/i` text match — that text also appears in
  // hidden table headers / tab labels and a stray hidden match would
  // fail `toBeVisible()` on the iPhone viewport.
  await expect(page.getByTestId("resource-view")).toBeVisible({
    timeout: 30_000,
  });
  // No red error wall: assert "Failed to" / "Could not resolve" don't appear.
  const errorBanner = page.getByText(
    /failed to load|could not resolve structuredefinition|Cannot read properties of/i,
  );
  await expect(errorBanner).toHaveCount(0);
});

test("Patient detail shows compartment chips", async ({ page }) => {
  await page.goto("./#/Patient");
  // Wait for the row before clicking: a bare `.click()` auto-waits with the
  // unbounded default action timeout, which masks a slow list fetch as a
  // 60s test timeout instead of a clean 30s locator failure.
  const firstRow = resourceRows(page).first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });
  await firstRow.click();
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
