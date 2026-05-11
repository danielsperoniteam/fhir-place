import { expect, test } from "@playwright/test";

test.describe("Patient index pagination (#15)", () => {
  test("Load more appends the next page; button hides when exhausted", async ({
    page,
  }) => {
    await page.goto("/Patient");
    const rows = page.getByTestId("resource-row");
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

  test("Newly loaded rows are reachable by scrolling the main pane", async ({
    page,
  }) => {
    // Regression: the page used `height: 100%` + `flex: 1` on the results
    // pane, so its content overflowed visually but didn't grow `<main>`'s
    // scrollHeight. Rows past the first viewport were rendered but
    // unreachable — `<main>` could only scroll a few px, far short of the
    // last row.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/Patient");
    const rows = page.getByTestId("resource-row");
    await expect(rows).toHaveCount(20);

    await page.getByTestId("load-more").click();
    await expect(rows).toHaveCount(36);

    // Programmatically scroll <main> to the bottom (mirroring what a user's
    // mouse wheel would do) and check the last row is now in the viewport.
    const lastRowInView = await page.evaluate(() => {
      const main = document.querySelector("main") as HTMLElement;
      main.scrollTop = main.scrollHeight;
      const rows = document.querySelectorAll<HTMLElement>(
        '[data-testid="resource-row"]',
      );
      const last = rows[rows.length - 1];
      const rect = last.getBoundingClientRect();
      return rect.top < window.innerHeight && rect.bottom > 0;
    });
    expect(lastRowInView).toBe(true);
  });

  test("Search filter resets pagination", async ({ page }) => {
    await page.goto("/Patient");
    const search = page.getByTestId("resource-search");
    await search.getByRole("textbox", { name: "family" }).fill("Nguyen");
    await search.getByRole("button", { name: "Search" }).click();

    const rows = page.getByTestId("resource-row");
    // Filtered down below one-page threshold — no Load more.
    await expect(rows.first()).toBeVisible();
    await expect(page.getByTestId("load-more")).not.toBeVisible();
  });

  test("Larger page-size options (500, 1000) are available", async ({ page }) => {
    await page.goto("/Patient");
    await page.getByTestId("page-size-picker").click();
    await expect(page.getByTestId("page-size-option-500")).toBeVisible();
    await expect(page.getByTestId("page-size-option-1000")).toBeVisible();
  });
});
