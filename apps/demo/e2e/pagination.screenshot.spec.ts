import { expect, test } from "@playwright/test";

test.describe("Patient index pagination (#15)", () => {
  test("Load more appends the next page; button hides when exhausted", async ({
    page,
  }) => {
    await page.goto("/Patient");
    const rows = page.getByTestId("patient-row");
    await expect(rows).toHaveCount(20); // first page: _count=20 of 36

    const loadMore = page.getByTestId("load-more");
    await expect(loadMore).toBeVisible();
    await expect(loadMore).toContainText("Load more");

    await page.screenshot({
      path: "../../screenshots/10-pagination-first-page.png",
      fullPage: true,
    });

    await loadMore.click();
    await expect(rows).toHaveCount(36);
    await expect(loadMore).not.toBeVisible();

    await page.screenshot({
      path: "../../screenshots/11-pagination-loaded-all.png",
      fullPage: true,
    });
  });

  test("Newly loaded rows are reachable (not clipped)", async ({ page }) => {
    // Regression: list/table wrappers used `flex: 1` with `overflow: hidden`,
    // which clipped rows past the flex-allocated height — so rows from a
    // second page were invisible and the inner area couldn't scroll.
    await page.goto("/Patient");
    const rows = page.getByTestId("patient-row");
    await expect(rows).toHaveCount(20);

    await page.getByTestId("load-more").click();
    await expect(rows).toHaveCount(36);

    // The last row must be reachable — scrollIntoView would throw if the
    // element were detached, and isVisible asserts it's actually rendered
    // (not hidden behind an overflow: hidden ancestor).
    const last = rows.last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeVisible();
  });

  test("Search filter resets pagination", async ({ page }) => {
    await page.goto("/Patient");
    const search = page.getByTestId("resource-search");
    await search.getByRole("textbox", { name: "family" }).fill("Nguyen");
    await search.getByRole("button", { name: "Search" }).click();

    const rows = page.getByTestId("patient-row");
    // Filtered down below one-page threshold — no Load more.
    await expect(rows.first()).toBeVisible();
    await expect(page.getByTestId("load-more")).not.toBeVisible();
  });
});
