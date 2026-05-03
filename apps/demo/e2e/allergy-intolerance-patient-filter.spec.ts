import { expect, test } from "@playwright/test";

/**
 * AllergyIntolerance.patient is a `Reference` search parameter. The filter
 * UI exposes both the raw `Type/id` text input and a name-search picker.
 * These cover the two paths a user can take to populate the same field.
 */
test.describe("AllergyIntolerance patient filter", () => {
  test("name-search pick fills the Type/id text input and applies the filter", async ({
    page,
  }) => {
    await page.goto("/fhir-ui/AllergyIntolerance");

    const search = page.getByTestId("resource-search");
    const text = search.getByRole("textbox", { name: "patient", exact: true });
    const picker = search.getByRole("searchbox", { name: /search patient/i });

    // Both inputs are present and the text input starts empty.
    await expect(text).toBeVisible();
    await expect(picker).toBeVisible();
    await expect(text).toHaveValue("");

    // Type a name fragment, wait for the suggestion, click it.
    await picker.fill("Ada");
    const option = page.getByRole("option", { name: /Ada Lovelace/ });
    await expect(option).toBeVisible();
    await option.click();

    // The pick populates the always-visible Type/id text input.
    await expect(text).toHaveValue("Patient/ada");

    // Submit the search → URL gains `patient=Patient/ada` and the filtered
    // result (the Penicillin allergy fixture) shows up.
    await search.getByRole("button", { name: /search/i }).click();
    await expect(page).toHaveURL(/patient=Patient(\/|%2F)ada/);
    await expect(page.getByRole("cell", { name: /Penicillin/ })).toBeVisible();
  });

  test("manually typed Type/id is what gets submitted", async ({ page }) => {
    await page.goto("/fhir-ui/AllergyIntolerance");

    const search = page.getByTestId("resource-search");
    const text = search.getByRole("textbox", { name: "patient", exact: true });

    await text.fill("Patient/ada");
    await search.getByRole("button", { name: /search/i }).click();

    await expect(page).toHaveURL(/patient=Patient(\/|%2F)ada/);
    await expect(page.getByRole("cell", { name: /Penicillin/ })).toBeVisible();
  });
});
