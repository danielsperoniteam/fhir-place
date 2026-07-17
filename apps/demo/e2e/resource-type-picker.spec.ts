import { expect, test } from "@playwright/test";

/**
 * The "+" tab opens a picker over every R4 resource type the bundle ships
 * SDs for, including ones that are not in the curated sidebar list. This
 * gives users a path to less-common types like AdverseEvent, NutritionOrder,
 * etc. without typing URLs.
 */
test.describe("resource-type picker", () => {
  test("+ tab opens the picker, filter narrows, click navigates to list", async ({
    page,
  }) => {
    await page.goto("/fhir-ui/Patient");

    await page.getByTestId("new-tab-button").click();
    await page.getByTestId("tab-kind-menu-item-browse").click();
    await expect(page.getByTestId("resource-type-picker-page")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /choose a resource type/i }),
    ).toBeVisible();

    // Curated section visible by default.
    await expect(
      page.getByTestId("resource-type-picker-section-common"),
    ).toBeVisible();

    // Reaches a non-top type.
    await expect(
      page.getByTestId("resource-type-picker-item-AdverseEvent"),
    ).toBeVisible();

    // Filter narrows.
    await page.getByTestId("resource-type-picker-filter").fill("adverse");
    await expect(
      page.getByTestId("resource-type-picker-item-AdverseEvent"),
    ).toBeVisible();
    await expect(
      page.getByTestId("resource-type-picker-item-Patient"),
    ).toHaveCount(0);

    // Clicking the item navigates to the list page for that type.
    await page.getByTestId("resource-type-picker-item-AdverseEvent").click();
    await expect(page).toHaveURL(/\/fhir-ui\/AdverseEvent$/);
  });
});
