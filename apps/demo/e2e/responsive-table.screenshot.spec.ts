import { devices, expect, test } from "@playwright/test";

test.describe("ResourceTable — responsive layouts", () => {
  test.beforeEach(async ({ page }) => {
    // Force the table view so the responsive switch is exercised on the
    // Patient list (which is the easiest live-data surface for the test).
    await page.addInitScript(() => {
      window.localStorage.setItem("fhir-place-demo-patient-layout", "table");
    });
  });

  test("desktop viewport renders the <table> layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/Patient");
    await expect(page.getByTestId("resource-table-table")).toBeVisible();
    // Card layout is not in the DOM at this width — ResourceTable picks the
    // active tree from matchMedia rather than CSS-hiding the inactive one.
    await expect(page.getByTestId("resource-table-cards")).toBeHidden();
  });

  test("phone viewport renders the card-stack layout instead of a clipped table", async ({
    browser,
  }) => {
    const context = await browser.newContext({ ...devices["iPhone 14"] });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem("fhir-place-demo-patient-layout", "table");
    });
    await page.goto("/Patient");

    // Card layout is the visible one on phone. ResourceTable conditionally
    // renders only the active layout, so the table tree is absent from the
    // DOM here (toBeHidden passes for missing elements).
    const cards = page.getByTestId("resource-table-cards");
    await expect(cards).toBeVisible();
    await expect(page.getByTestId("resource-table-table")).toBeHidden();

    // At least one card with label/value pairs. Cards carry the same
    // `resource-row` testid as desktop rows — the e2e test asks "is there a
    // row" and the answer should be yes on either layout. Scope through the
    // cards container so this assertion ignores a desktop row that might leak
    // in during a viewport transition.
    const card = cards.getByTestId("resource-row").first();
    await expect(card).toBeVisible();
    // Column header labels render as field labels in the card.
    await expect(card.getByText(/Name/)).toBeVisible();
    await expect(card.getByText(/Gender/)).toBeVisible();

    // No body horizontal scroll: scrollWidth should equal clientWidth (or be close).
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(2);

    await page.screenshot({
      path: "../../screenshots/16-patient-table-mobile-cards.png",
      fullPage: true,
    });
    await context.close();
  });

  test("iphone patient list exposes a visible resource-row (regression: #509)", async ({
    browser,
  }) => {
    // Regression for issue #509 / #510 / #511. The live smoke suite
    // (`apps/demo/e2e-live/smoke.spec.ts`) does `getByTestId("resource-row")`
    // expecting the first match to be visible. Pre-fix the table tree
    // existed at iPhone widths with display:none, so the locator resolved
    // 21x but every match was hidden. After the fix only the cards render
    // on phone widths and each card carries the `resource-row` testid.
    const context = await browser.newContext({ ...devices["iPhone 14"] });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem("fhir-place-demo-patient-layout", "table");
    });
    await page.goto("/Patient");
    const rows = page.getByTestId("resource-row");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
    await context.close();
  });

  test("clicking a card navigates to the detail page (parity with table row click)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ ...devices["iPhone 14"] });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem("fhir-place-demo-patient-layout", "table");
    });
    await page.goto("/Patient");
    await page
      .getByTestId("resource-table-cards")
      .getByTestId("resource-row")
      .first()
      .click();
    await expect(page).toHaveURL(/\/Patient\/[^/]+$/);
    await expect(page.getByTestId("resource-view")).toBeVisible();
    await context.close();
  });
});
