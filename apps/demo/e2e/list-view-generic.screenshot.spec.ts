import { expect, test } from "@playwright/test";

// List view used to be hidden for resource types that lacked a hand-tuned
// `RESOURCE_LIST_CONFIG` entry. After the generic-fallback change in this PR
// it is offered everywhere, with formatPrimary/formatMeta probing common
// FHIR fields (name / code / status / dates) so the row reads naturally
// even on unconfigured types.

async function resetLayoutPrefs(page: import("@playwright/test").Page, rt: string) {
  await page.goto("/");
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, `fhir-place-demo-${rt.toLowerCase()}-layout`);
}

test.describe("list view — generic fallback for all resource types", () => {
  test("List toggle is enabled for a configured resource type (AllergyIntolerance)", async ({
    page,
  }) => {
    await resetLayoutPrefs(page, "AllergyIntolerance");
    await page.goto("/AllergyIntolerance");
    const listBtn = page.getByTestId("layout-list");
    await expect(listBtn).toBeVisible();
    await expect(listBtn).toBeEnabled();
    await listBtn.click();
    await expect(listBtn).toHaveAttribute("aria-pressed", "true");
    // ColumnPicker is only relevant in Table layout.
    await expect(page.getByRole("button", { name: /columns/i })).toHaveCount(0);
  });

  test("List toggle is enabled for a previously-unconfigured resource type (Bundle)", async ({
    page,
  }) => {
    await resetLayoutPrefs(page, "Bundle");
    await page.goto("/Bundle");
    const listBtn = page.getByTestId("layout-list");
    await expect(listBtn).toBeVisible();
    await expect(listBtn).toBeEnabled();
    await listBtn.click();
    await expect(listBtn).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /columns/i })).toHaveCount(0);
  });

  test("Larger page-size options (500, 1000) are available", async ({ page }) => {
    await page.goto("/Patient");
    await page.getByTestId("page-size-picker").click();
    await expect(page.getByTestId("page-size-option-500")).toBeVisible();
    await expect(page.getByTestId("page-size-option-1000")).toBeVisible();
  });
});
