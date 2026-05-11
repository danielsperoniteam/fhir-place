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
});
