import { expect, test } from "@playwright/test";

/**
 * Mobile-viewport regression for issue #510.
 *
 * The nightly live-site monitor's `iphone` project hit a hidden-element
 * failure: `ResourceTable` in `auto` layout renders BOTH a `<table>` (testid
 * `resource-row`) and a card stack (testid `resource-row-card`) and toggles
 * which is visible via Tailwind's `sm:` (640px) breakpoint. At iPhone-14
 * width (390px), the table rows are present in the DOM but `hidden`, so any
 * assertion on `resource-row` visibility stalls.
 *
 * This spec runs in the `iphone` Playwright project (configured in
 * `playwright.config.ts`, viewport 390x664) and asserts the patient-detail
 * flow works against the local dev server. Future iPhone-viewport
 * regressions in `ResourceTable`'s row-visibility contract will fail PR CI
 * here instead of waiting for the 2am nightly job.
 */
test.describe("Patient detail — iPhone viewport (issue #510)", () => {
  test("patient list shows a tappable card row on iPhone", async ({ page }) => {
    await page.goto("/Patient");
    await expect(
      page.getByRole("heading", { name: /patients/i }),
    ).toBeVisible();

    // The card stack is the visible row container below `sm:`.
    const card = page.getByTestId("resource-row-card").first();
    await expect(card).toBeVisible();
  });

  test("tapping a patient row navigates to the detail page without an error wall", async ({
    page,
  }) => {
    await page.goto("/Patient");

    const card = page.getByTestId("resource-row-card").first();
    await expect(card).toBeVisible();
    await card.click();

    // Detail view renders.
    await expect(page).toHaveURL(/\/Patient\/[^/]+$/);
    await expect(page.getByTestId("resource-view")).toBeVisible();

    // No red error wall (mirrors the live smoke contract at
    // `apps/demo/e2e-live/smoke.spec.ts:39`).
    const errorBanner = page.getByText(
      /failed to load|could not resolve structuredefinition|Cannot read properties of/i,
    );
    await expect(errorBanner).toHaveCount(0);
  });
});
