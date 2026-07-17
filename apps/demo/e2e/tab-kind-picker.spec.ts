import { expect, test } from "@playwright/test";

/**
 * The tabs-row "+" button opens a kind-picker dropdown (issue #247).
 * Today only Browse and Settings are wired; the rest are visible-but-
 * disabled stubs so the menu reflects the Direction A spec.
 */
test.describe("tabs-row kind-picker", () => {
  test("clicking + opens the menu with primary + other sections", async ({ page }) => {
    await page.goto("/fhir-ui/Patient");

    await page.getByTestId("new-tab-button").click();
    const menu = page.getByTestId("tab-kind-menu");
    await expect(menu).toBeVisible();

    for (const id of ["browse", "read-by-id", "create", "update", "delete", "batch", "settings"]) {
      await expect(page.getByTestId(`tab-kind-menu-item-${id}`)).toBeVisible();
    }
  });

  test("Browse opens the resource-type picker (matches prior + behavior)", async ({ page }) => {
    await page.goto("/fhir-ui/Patient");

    await page.getByTestId("new-tab-button").click();
    await page.getByTestId("tab-kind-menu-item-browse").click();
    await expect(page.getByTestId("resource-type-picker-page")).toBeVisible();
  });

  test("ESC closes the menu", async ({ page }) => {
    await page.goto("/fhir-ui/Patient");

    await page.getByTestId("new-tab-button").click();
    await expect(page.getByTestId("tab-kind-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tab-kind-menu")).toHaveCount(0);
  });

  test("stub rows are present but disabled", async ({ page }) => {
    await page.goto("/fhir-ui/Patient");

    await page.getByTestId("new-tab-button").click();
    for (const id of ["read-by-id", "create", "update", "delete", "batch"]) {
      await expect(page.getByTestId(`tab-kind-menu-item-${id}`)).toBeDisabled();
    }
  });
});
