import { expect, test } from "@playwright/test";

// Regression for #400. Communication is auto-derived (no static
// `tableColumns` config), so its columns are picked from the JSON shape
// of the rows. Before the fix, three different nested-reference paths
// (`basedOn.reference`, `partOf.reference`, `recipient.reference`) all
// labeled as plain "Reference" in the column picker, and
// `category.coding.system` labeled as bare "System". The fix walks past
// structural FHIR leaves so the column header reads like the parent
// element ("Based On", "Part Of", "Recipient", "Category").
test.describe("auto-derived columns — structural-leaf labels", () => {
  test("Communication column picker shows parent-named labels, no duplicate Reference", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    await page.goto("/fhir-ui/Communication");

    // Wait for the picker button to be wired up. The page renders even
    // when SDs 404, so we don't need to wait on row data — just the
    // picker contents derived from the row we mocked.
    const pickerButton = page.getByRole("button", { name: /columns/i });
    await expect(pickerButton).toBeVisible();
    await pickerButton.click();

    // Each of these is a previously-collapsed "Reference" or "System"
    // entry. They must now show up under the parent FHIR element name.
    await expect(page.getByRole("checkbox", { name: /^based on$/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^part of$/i })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^recipient$/i })).toBeVisible();

    // No two checkboxes in the picker share an identical "Reference"
    // label. `getByRole` returns every match, so a count > 1 would
    // reproduce the original bug.
    await expect(page.getByRole("checkbox", { name: /^reference$/i })).toHaveCount(0);

    // Category-coding-system must not be a bare "System" label.
    await expect(page.getByRole("checkbox", { name: /^system$/i })).toHaveCount(0);
  });
});
