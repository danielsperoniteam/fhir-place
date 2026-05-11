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

  test("list-page Clear empties a typed non-compartment search field", async ({
    page,
  }) => {
    await page.goto("/Patient");

    const given = page
      .getByTestId("resource-search")
      .getByRole("textbox", { name: "given" });
    await given.fill("Alan");
    await page.getByTestId("resource-list-clear").click();

    await expect(given).toHaveValue("");
    await expect(page).toHaveURL(/\/Patient$/);
  });

  test("list-page Clear preserves patient scope and removes other filters", async ({
    page,
  }) => {
    await page.goto("/Condition?patient=ada");

    const search = page.getByTestId("resource-search");
    const clinicalStatus = search.getByRole("textbox", {
      name: "clinical-status",
    });
    await clinicalStatus.fill("active");
    await search.getByRole("button", { name: /search/i }).click();
    await expect(page).toHaveURL(/patient=ada/);
    await expect(page).toHaveURL(/clinical-status=active/);

    await page.getByTestId("resource-list-clear").click();

    await expect(clinicalStatus).toHaveValue("");
    await expect(page).toHaveURL(/\/Condition\?patient=ada$/);
  });
});
