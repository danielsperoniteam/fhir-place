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
});
