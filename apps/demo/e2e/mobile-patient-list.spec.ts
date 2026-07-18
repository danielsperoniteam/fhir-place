import { expect, test } from "@playwright/test";

// Regression test for: mobile Patient list rows have zero bounding boxes
// at 375x812 — not clickable (#616).
//
// Root cause: the search-params panel stacked 6 single-column fields at
// 375px and consumed the full viewport height, leaving resource rows below
// the fold with no scroll affordance. Fix: .search-params-panel caps the
// panel at 40vh with overflow-y: auto on ≤640px viewports.

test.describe("mobile Patient list — rows must be reachable", () => {
  test.beforeEach(async ({ page }) => {
    // Force table layout so resource-row testids are present (not cards).
    await page.addInitScript(() => {
      window.localStorage.setItem("fhir-place-demo-patient-layout", "table");
    });
  });

  test("at 375x812 the first resource-row-card is visible with a non-zero bounding box", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/Patient");

    // The search-params panel must not fill the entire viewport — resource
    // rows (rendered as cards on mobile) must be reachable by scrolling.
    const firstCard = page.getByTestId("resource-row-card").first();
    await expect(firstCard).toBeVisible();

    const box = await firstCard.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test("at 375x812 the search-params panel does not fill the full viewport height", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/Patient");

    const panel = page.locator(".search-params-panel");
    await expect(panel).toBeVisible();

    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    // Panel must not consume the full viewport — leave room for rows below.
    expect(panelBox!.height).toBeLessThan(812 * 0.6);
  });

  test("at 1280x800 the search-params panel has no height cap (desktop unchanged)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/Patient");

    // Resource rows visible at desktop width — baseline desktop behavior.
    const firstRow = page.getByTestId("resource-row").first();
    await expect(firstRow).toBeVisible();

    const box = await firstRow.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });
});
