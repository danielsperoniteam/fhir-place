import { expect, test } from "@playwright/test";

test.describe("mobile navigation", () => {
  test("375px viewport can open the primary sidebar navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/fhir-ui/Patient");

    const trigger = page.getByTestId("mobile-nav-trigger");
    await expect(trigger).toBeVisible();

    await trigger.click();

    const drawer = page.getByTestId("mobile-nav-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("server-picker-trigger")).toBeVisible();
    await expect(drawer.getByTestId("sidebar-link-Patient")).toBeVisible();
    await expect(drawer.getByTestId("sidebar-link-AllergyIntolerance")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("375px viewport shows the active server label in the topbar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/fhir-ui/Patient");

    // Without this pill, the breadcrumb collapses to "FHI... / P..." and
    // the user has no on-screen cue for which server they're querying.
    const pill = page.getByTestId("topbar-server-pill");
    await expect(pill).toBeVisible();
    await expect(pill).not.toBeEmpty();

    // Breadcrumb is dropped on phones to make room for the pill.
    await expect(page.locator(".topbar-breadcrumb")).toBeHidden();
  });

  test("375px viewport hides the desktop-only keyboard hint strip", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/fhir-ui/Patient");

    // The "← → navigate / ⏎ open" hints are pointer-only; on touch they
    // just eat vertical space.
    await expect(page.getByTestId("status-bar-hints")).toBeHidden();
    // The FHIR R4 indicator stays — it conveys server state, not a hint.
    const statusBar = page.getByTestId("status-bar");
    await expect(statusBar).toContainText("FHIR R4");
  });

  test("1280px viewport keeps the desktop breadcrumb and hides the server pill", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/fhir-ui/Patient");

    await expect(page.locator(".topbar-breadcrumb")).toBeVisible();
    await expect(page.getByTestId("topbar-server-pill")).toBeHidden();
    await expect(page.getByTestId("status-bar-hints")).toBeVisible();
    await expect(page.getByTestId("mobile-nav-trigger")).toBeHidden();
  });
});
