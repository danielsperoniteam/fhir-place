import { expect, test } from "@playwright/test";

test.describe("Patient list — URL sync", () => {
  test.beforeEach(async ({ page }) => {
    // Reset the layout/columns localStorage so the table view is the
    // default and tests are deterministic.
    await page.addInitScript(() => {
      window.localStorage.removeItem("fhir-place-demo-patient-layout");
      window.localStorage.removeItem("fhir-place-demo-patient-columns");
    });
  });

  test("submitting the search form writes filters into the URL", async ({ page }) => {
    await page.goto("/Patient");
    const search = page.getByTestId("resource-search");
    await search.getByRole("textbox", { name: "given" }).fill("Alan");
    await search.getByRole("button", { name: /search/i }).click();
    await expect(page).toHaveURL(/\?given=Alan/);
    // Filter applied — exactly one synthetic match.
    await expect(page.getByTestId("resource-row")).toHaveCount(1);
  });

  test("loading a URL with filters pre-fills the form and applies the filter", async ({
    page,
  }) => {
    await page.goto("/Patient?given=Alan");
    await expect(page.getByTestId("resource-row")).toHaveCount(1);
    await expect(
      page.getByTestId("resource-search").getByRole("textbox", { name: "given" }),
    ).toHaveValue("Alan");
  });

  test("`_count` is not added to the URL", async ({ page }) => {
    await page.goto("/Patient");
    await page
      .getByTestId("resource-search")
      .getByRole("textbox", { name: "given" })
      .fill("Alan");
    await page
      .getByTestId("resource-search")
      .getByRole("button", { name: /search/i })
      .click();
    await expect(page).toHaveURL(/\?given=Alan/);
    await expect(page).not.toHaveURL(/_count=/);
  });

  test("saved-query action is present and gated on an active query", async ({ page }) => {
    // #355 removed a dead Save-query button; #254 PR A shipped the real one.
    // Disabled on a bare list URL, enabled once params are in the URL —
    // full save/load/delete coverage lives in saved-queries.spec.ts.
    await page.goto("/Patient");

    const toolbar = page.getByTestId("search-params-toolbar");
    await expect(toolbar.getByTestId("save-query")).toBeDisabled();
  });
});
