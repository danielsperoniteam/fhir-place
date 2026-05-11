import { expect, test } from "@playwright/test";

// Helper: clear persisted layout / column localStorage keys after the
// page has loaded once. Using `addInitScript` would clear on every
// page load (including `page.reload()`), which silently breaks the
// persistence test below.
async function resetLayoutPrefs(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.removeItem("fhir-place-demo-patient-layout");
    localStorage.removeItem("fhir-place-demo-patient-columns");
  });
}

test.describe("patient list — table view + column picker", () => {
  test("toggling to table view renders ResourceTable and ColumnPicker hides a column", async ({
    page,
  }) => {
    await resetLayoutPrefs(page);
    await page.goto("/Patient");
    await page.getByTestId("layout-table").click();

    const table = page.getByTestId("resource-table");
    await expect(table).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /^name$/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /gender/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /resources/i })).toBeVisible();
    await expect(page.getByTestId("patient-row-counts").first()).toBeVisible();

    await page.screenshot({
      path: "../../screenshots/12-patient-table.png",
      fullPage: true,
    });

    // Open the column picker and toggle off Gender. Two elements have
    // the label "Gender" on the page (the search input and this
    // checkbox), so target the checkbox role explicitly.
    await page.getByRole("button", { name: /columns/i }).click();
    await page.getByRole("checkbox", { name: /^gender$/i }).click();
    await expect(page.getByRole("columnheader", { name: /gender/i })).toHaveCount(0);

    await page.screenshot({
      path: "../../screenshots/13-patient-table-column-picker.png",
      fullPage: true,
    });
  });

  test("layout choice persists across reload via localStorage", async ({ page }) => {
    await resetLayoutPrefs(page);
    await page.goto("/Patient");
    await page.getByTestId("layout-table").click();
    await expect(page.getByTestId("resource-table")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("resource-table")).toBeVisible();
  });

  // Regression for the "missing columns" bug: SPA-navigating from one
  // resource type's table view to another's would leak the previous type's
  // column selection into the picker, leaving only the common `id` column
  // visible. After a layout toggle the picker re-mounted with the new
  // type's defaults checked while the parent still rendered just `id` —
  // a visible state divergence between picker UI and the table.
  test("SPA-navigating between resource types resets columns to the new type's defaults", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("fhir-place-demo-patient-layout", "table");
      localStorage.setItem("fhir-place-demo-allergyintolerance-layout", "table");
    });

    await page.goto("/fhir-ui/Patient");
    await expect(page.getByTestId("resource-table")).toBeVisible();

    // SPA nav (no full reload) to AllergyIntolerance.
    await page.evaluate(() => {
      window.history.pushState({}, "", "/fhir-ui/AllergyIntolerance");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await expect(page.getByRole("columnheader", { name: /^status$/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /^code$/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /^reaction$/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /^id$/i })).toHaveCount(0);

    // The picker UI must agree with what the table renders.
    await page.getByRole("button", { name: /columns/i }).click();
    await expect(page.getByRole("checkbox", { name: /^status$/i })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /^code$/i })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /^reaction$/i })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /^id$/i })).not.toBeChecked();
  });
});
