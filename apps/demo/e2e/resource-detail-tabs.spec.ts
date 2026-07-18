import { expect, test } from "@playwright/test";

/**
 * Regression for #653: the resource detail right-pane had two tabs —
 * "View" and "JSON" — that both rendered identical JSON content. The
 * "View" tab was removed; only "JSON" and "References" remain.
 */
test.describe("resource detail right-pane tabs (#653)", () => {
  test("only JSON and References tabs are present, View tab is gone", async ({
    page,
  }) => {
    await page.goto("/fhir-ui/Patient/ada");

    // Wait for the detail page to fully load.
    await expect(page.getByTestId("resource-view")).toBeVisible();

    // JSON tab must be present and active by default.
    const jsonTab = page.getByRole("button", { name: "JSON" });
    await expect(jsonTab).toBeVisible();

    // References tab must be present.
    const refsTab = page.getByRole("button", { name: "References" });
    await expect(refsTab).toBeVisible();

    // The "View" tab must not exist.
    await expect(page.getByRole("button", { name: "View", exact: true })).toHaveCount(0);

    // JSON content is shown by default (JSON tab is active).
    await expect(page.getByTestId("resource-json")).toBeVisible();

    // Switching to References hides the JSON pane.
    await refsTab.click();
    await expect(page.getByTestId("resource-json")).toHaveCount(0);

    // Switching back to JSON restores the JSON pane.
    await jsonTab.click();
    await expect(page.getByTestId("resource-json")).toBeVisible();
  });

  test("aligns the generic detail title and top-level field labels", async ({ page }) => {
    await page.goto("/fhir-ui/Condition/cond-htn-ada");

    const view = page.getByTestId("resource-view");
    const title = view.getByTestId("resource-view-title");
    const labels = view.getByTestId("resource-view-label");
    await expect(view).toBeVisible();
    await expect(title).toBeVisible();

    const viewX = await view.evaluate((element) => element.getBoundingClientRect().x);
    const titleX = await title.evaluate((element) => element.getBoundingClientRect().x);
    const labelContentXs = await labels.evaluateAll((elements) =>
      elements.map(
        (element) =>
          element.getBoundingClientRect().x +
          Number.parseFloat(getComputedStyle(element).paddingLeft),
      ),
    );

    expect(labelContentXs.length).toBeGreaterThan(0);
    expect(titleX - viewX).toBeCloseTo(16, 0);
    for (const labelContentX of labelContentXs) {
      expect(labelContentX).toBeCloseTo(titleX, 0);
    }
  });
});
