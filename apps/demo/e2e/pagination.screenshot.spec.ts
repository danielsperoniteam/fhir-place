import { expect, test, type Page } from "@playwright/test";

const SHOT_DIR =
  "../../screenshots/pr-issue-304-adaptive-pagination-ui-handle-servers-that-only";

// `<main>` is an internal scroll container, so a top-of-document fullPage
// screenshot misses the pagination buttons entirely — scroll them into view
// before capturing.
const shot = async (page: Page, name: string) => {
  await page.getByTestId("pagination-controls").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
};

// Fully-linked server (HAPI / Smile CDR shape): emits first / previous /
// next / last on Bundle.link. First/Prev disable on the first page;
// Next/Last disable on the last.
test.describe("Adaptive pagination — fully-linked server (#304)", () => {
  test("first page disables First/Prev, last page disables Next/Last", async ({ page }) => {
    await page.goto("/fhir-ui/Patient?_count=20");
    const rows = page.getByTestId("resource-row");
    await expect(rows).toHaveCount(20); // 36 total, 20 per page

    await expect(page.getByTestId("page-first")).toBeDisabled();
    await expect(page.getByTestId("page-prev")).toBeDisabled();
    await expect(page.getByTestId("page-next")).toBeEnabled();
    await expect(page.getByTestId("page-last")).toBeEnabled();
    await expect(page.getByTestId("results-showing")).toContainText("Showing 1–20 of 36");
    await shot(page, "01-fully-linked-first-page-desktop");

    await page.getByTestId("page-next").click();
    await expect(rows).toHaveCount(16);
    // 16 < 20 → page-size picker surfaces the actual count alongside the request.
    await expect(page.getByTestId("page-size-picker")).toContainText("16 of 20");
    await expect(page.getByTestId("page-first")).toBeEnabled();
    await expect(page.getByTestId("page-prev")).toBeEnabled();
    await expect(page.getByTestId("page-next")).toBeDisabled();
    await expect(page.getByTestId("page-last")).toBeDisabled();
    await expect(page.getByTestId("results-showing")).toContainText("Showing 21–36 of 36");
    await shot(page, "02-fully-linked-last-page-desktop");

    await page.getByTestId("page-first").click();
    await expect(rows).toHaveCount(20);
    await expect(page.getByTestId("page-first")).toBeDisabled();
  });

  test("accepts the `prev` spelling as well as `previous`", async ({ page }) => {
    // The mock emits "prev" instead of "previous" when _prev_spelling=prev.
    await page.goto("/fhir-ui/Patient?_count=20&_prev_spelling=prev");
    await page.getByTestId("page-next").click();
    await expect(page.getByTestId("resource-row").first()).toBeVisible();
    await expect(page.getByTestId("page-prev")).toBeEnabled();
    await page.getByTestId("page-prev").click();
    await expect(page.getByTestId("page-first")).toBeDisabled();
  });

  test("mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/fhir-ui/Patient?_count=20");
    await expect(page.getByTestId("pagination-controls")).toBeAttached();
    await shot(page, "03-fully-linked-first-page-mobile");
  });
});

// Forward-only server (Epic, parts of HealthLake): only `next` ever
// populated; `first`, `previous`, `last` are absent. UI must disable those
// three buttons even on a middle page.
test.describe("Adaptive pagination — forward-only server (#304)", () => {
  test("only Next is enabled; First/Prev/Last stay disabled across pages", async ({ page }) => {
    await page.goto("/fhir-ui/Patient?_count=20&_pagination=forward-only");
    await expect(page.getByTestId("resource-row")).toHaveCount(20);

    await expect(page.getByTestId("page-first")).toBeDisabled();
    await expect(page.getByTestId("page-prev")).toBeDisabled();
    await expect(page.getByTestId("page-last")).toBeDisabled();
    await expect(page.getByTestId("page-next")).toBeEnabled();
    await expect(page.getByTestId("results-showing")).toContainText("Showing 1–20 of 36");
    await shot(page, "04-forward-only-first-page-desktop");

    await page.getByTestId("page-next").click();
    await expect(page.getByTestId("resource-row")).toHaveCount(16);
    // After advancing, server *still* doesn't advertise previous/first/last.
    await expect(page.getByTestId("page-first")).toBeDisabled();
    await expect(page.getByTestId("page-prev")).toBeDisabled();
    await expect(page.getByTestId("page-next")).toBeDisabled();
    await expect(page.getByTestId("page-last")).toBeDisabled();
    await shot(page, "05-forward-only-second-page-desktop");
  });

  test("mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/fhir-ui/Patient?_count=20&_pagination=forward-only");
    await expect(page.getByTestId("pagination-controls")).toBeAttached();
    await shot(page, "06-forward-only-first-page-mobile");
  });
});
