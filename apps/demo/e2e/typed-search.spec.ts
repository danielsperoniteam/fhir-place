import { expect, test } from "@playwright/test";

/**
 * Tests for the Typed Search Builder demo page at /typed-search.
 *
 * The page demonstrates `useTypedSearch` backed by the in-browser MSW mock,
 * so no live FHIR server is required.
 */

test.describe("Typed Search page", () => {
  test("page renders with heading and code snippets", async ({ page }) => {
    await page.goto("/typed-search");

    await expect(page.getByTestId("typed-search-page")).toBeVisible();

    await expect(
      page.getByRole("heading", { name: /typed search builder/i }),
    ).toBeVisible();

    // Both before and after code snippets must be visible.
    await expect(page.getByTestId("snippet-before")).toBeVisible();
    await expect(page.getByTestId("snippet-after")).toBeVisible();
  });

  test("before snippet shows untyped useSearch usage", async ({ page }) => {
    await page.goto("/typed-search");
    const before = page.getByTestId("snippet-before");
    await expect(before).toContainText("useSearch");
    await expect(before).toContainText("nmae");
  });

  test("after snippet shows useTypedSearch with chained builder", async ({ page }) => {
    await page.goto("/typed-search");
    const after = page.getByTestId("snippet-after");
    await expect(after).toContainText("useTypedSearch");
    await expect(after).toContainText("searchBuilder");
    await expect(after).toContainText(".where");
    await expect(after).toContainText(".include");
  });

  test("query preview shows the built search string", async ({ page }) => {
    await page.goto("/typed-search");

    const preview = page.getByTestId("query-preview");
    await expect(preview).toBeVisible();
    // The builder is: searchBuilder("Patient").where("name","Smith").include("Patient:general-practitioner")
    await expect(preview).toContainText("Patient");
    await expect(preview).toContainText("name=Smith");
  });

  test("live result section renders after data loads", async ({ page }) => {
    await page.goto("/typed-search");

    // Either results or the "no matching" message should appear — not an error.
    await expect(page.getByTestId("typed-search-error")).not.toBeVisible();
    const results = page.getByTestId("typed-search-results");
    await expect(results).toBeVisible();
  });
});
