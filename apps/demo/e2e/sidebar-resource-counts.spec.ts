import { expect, test } from "@playwright/test";

test.describe("Sidebar resource counts", () => {
  test("each resource link shows a count and an All resources total", async ({
    page,
  }) => {
    await page.goto("/Patient");

    const sidebar = page.getByTestId("fhir-ui-sidebar");
    await expect(sidebar).toBeVisible();

    // Counts populate asynchronously per resource type. The exact numbers
    // depend on which FHIR backend the dev server is pointed at, so we
    // assert structure (count text is a non-empty number) rather than
    // specific totals.
    const numeric = /^[0-9,]+$/;
    await expect(page.getByTestId("sidebar-count-Patient")).toHaveText(numeric);
    await expect(page.getByTestId("sidebar-count-Observation")).toHaveText(numeric);

    // "All resources" sums every per-type count. With at least one type
    // resolving > 0, the total is non-zero and numeric.
    await expect(page.getByTestId("sidebar-count-all")).toHaveText(numeric);
  });
});
