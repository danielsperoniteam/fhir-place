import { expect, test } from "@playwright/test";

/**
 * #249 — AllergyIntolerance is the Tier 1 reference implementation for
 * <HintedDetail>. It must render the hero row + sectioned fields driven by
 * `getLayoutHint("AllergyIntolerance")` instead of the generic SD walker.
 */
test.describe("HintedDetail — AllergyIntolerance reference implementation", () => {
  test("renders hero + sections from the layout hint", async ({ page }) => {
    await page.goto("/fhir-ui/AllergyIntolerance/ai-pen-ada");

    await expect(page.getByTestId("resource-detail-back-link")).toHaveText(
      "← All AllergyIntolerances",
    );
    await expect(page.getByTestId("resource-detail-back-link")).not.toContainText(
      "allergyintolerances",
    );

    // The HintedDetail wrapper is present (i.e. we're not falling back to
    // ResourceView for this resource type).
    await expect(page.getByTestId("hinted-detail")).toBeVisible();
    await expect(page.getByTestId("hinted-detail-hero")).toBeVisible();

    // Subject section renders because the fixture has a `patient` field.
    await expect(page.getByTestId("hinted-detail-section-subject")).toBeVisible();

    // The fixture includes a `reaction` array → Reactions section renders.
    await expect(page.getByTestId("hinted-detail-section-reactions")).toBeVisible();
  });
});
