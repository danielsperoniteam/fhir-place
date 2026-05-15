import { devices, expect, test } from "@playwright/test";

test.describe("fhir-place demo", () => {
  test("patient list renders and filters by name", async ({ page }) => {
    await page.goto("/Patient");
    await expect(page.getByRole("heading", { name: /patients/i })).toBeVisible();
    const rows = page.getByTestId("resource-row");
    // With fixture pagination: first page shows 20 of 36 synthetic patients.
    await expect(rows).toHaveCount(20);
    await expect(rows).toContainText(["Ada Lovelace", "Alan Mathison Turing"]);

    await page.screenshot({
      path: "../../screenshots/01-patient-list.png",
      fullPage: true,
    });

    const search = page.getByTestId("resource-search");
    await search.getByRole("textbox", { name: "name" }).fill("hop");
    await search.getByRole("button", { name: "Search" }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Grace Hopper");

    await page.screenshot({
      path: "../../screenshots/02-patient-list-filtered.png",
      fullPage: true,
    });
  });

  test("clicking a patient navigates to the spec-driven detail view", async ({
    page,
  }) => {
    await page.goto("/Patient");
    await page
      .getByTestId("resource-row")
      .filter({ hasText: /ada lovelace/i })
      .click();

    await expect(page).toHaveURL(/\/Patient\/ada/);
    const view = page.getByTestId("resource-view");
    await expect(view).toBeVisible();

    // Spec-driven rendering: labels come from the StructureDefinition short text.
    await expect(view).toContainText("Ada Lovelace");
    // Date renderer humanises the value; the raw ISO stays on <time dateTime>.
    await expect(view).toContainText("Dec 10, 1815");
    await expect(view).toContainText("ada@example.com");
    await expect(view).toContainText("1 Workhouse Lane");
    // Narrative (sanitised via DOMPurify) is shown.
    await expect(view).toContainText(/Synthetic test patient ada/);

    await page.screenshot({
      path: "../../screenshots/03-patient-detail.png",
      fullPage: true,
    });
  });

  test("mobile viewport renders the detail view stacked", async ({ browser }) => {
    const context = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await context.newPage();
    await page.goto("/Patient/ada");
    await expect(page.getByTestId("resource-view")).toBeVisible();
    await expect(page.getByText("Ada Lovelace")).toBeVisible();
    await page.screenshot({
      path: "../../screenshots/04-patient-detail-mobile.png",
      fullPage: true,
    });
    await context.close();
  });
});
