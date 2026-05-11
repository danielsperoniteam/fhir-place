import { expect, test } from "@playwright/test";

/**
 * Pinned sidebar section + topbar pin action.
 *
 * The pinned state is per-server in localStorage, so tests clear
 * `fhir-place:pinned` before each run to avoid contamination across the
 * suite.
 */

test.describe("Sidebar Pinned section", () => {
  // Wipe persisted pins once at the start of each test, then let subsequent
  // navigations (including reload) read whatever the test wrote during the
  // run. A `beforeEach` using `addInitScript` would also fire on reload and
  // erase the very pin we're trying to verify survives.
  test.beforeEach(async ({ page }) => {
    await page.goto("/fhir-ui/Patient");
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem("fhir-place:pinned");
      } catch {
        /* private mode */
      }
    });
    await page.reload();
    await expect(page).toHaveURL(/\/fhir-ui\/Patient$/);
  });

  test("renders an empty state with helper copy when no pins exist", async ({
    page,
  }) => {
    const section = page.getByTestId("sidebar-pinned-section");
    await expect(section).toBeVisible();
    await expect(section).toContainText(/pinned/i);

    const empty = page.getByTestId("pinned-empty-state");
    await expect(empty).toBeVisible();
    await expect(empty).toContainText(
      /click the pin icon in the topbar/i,
    );
  });

  test("topbar pin adds a row that survives a reload and toggles off", async ({
    page,
  }) => {
    // No pins yet — empty state visible.
    await expect(page.getByTestId("pinned-empty-state")).toBeVisible();

    // Pin the current route.
    await page.getByTestId("topbar-pin").click();

    // Empty state goes away; a pin row appears with label "Patient".
    await expect(page.getByTestId("pinned-empty-state")).toHaveCount(0);
    const section = page.getByTestId("sidebar-pinned-section");
    await expect(section).toContainText("Patient");

    // Reload and confirm persistence.
    await page.reload();
    await expect(page.getByTestId("sidebar-pinned-section")).toContainText(
      "Patient",
    );
    await expect(page.getByTestId("pinned-empty-state")).toHaveCount(0);

    // Toggle off — pressing pin again on the same route removes it.
    await page.getByTestId("topbar-pin").click();
    await expect(page.getByTestId("pinned-empty-state")).toBeVisible();
  });

  test("clicking a pinned row navigates to its route", async ({ page }) => {
    await page.goto("/fhir-ui/Observation");
    await page.getByTestId("topbar-pin").click();

    // Move to a different route, then click the pin to come back.
    await page.goto("/fhir-ui/Patient");
    const section = page.getByTestId("sidebar-pinned-section");
    await expect(section).toContainText("Observation");

    // The row is keyed by a generated id, so locate it by its label text
    // inside the pinned section instead of guessing the id.
    await section.getByText("Observation", { exact: true }).click();
    await expect(page).toHaveURL(/\/fhir-ui\/Observation$/);
  });

  test("pinned rows are keyboard-focusable links", async ({ page }) => {
    await page.goto("/fhir-ui/Observation");
    await page.getByTestId("topbar-pin").click();

    await page.goto("/fhir-ui/Patient");
    const pinnedRow = page.getByTestId(/^pinned-row-/);
    await expect(pinnedRow).toContainText("Observation");
    await expect(pinnedRow).toHaveAttribute("href", /\/fhir-ui\/Observation$/);

    await pinnedRow.focus();
    await expect(pinnedRow).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fhir-ui\/Observation$/);
  });
});
