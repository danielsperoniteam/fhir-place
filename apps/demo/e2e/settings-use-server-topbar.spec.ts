import { expect, test } from "@playwright/test";

/**
 * Regression for issue #557 (updated for the env-override safety fix).
 *
 * Original bug: clicking `Use` on a non-active server row left the sidebar's
 * active-server label stuck on the previous value until a manual page reload.
 * The sidebar rendered `ACTIVE_SERVER_CONFIG.label` directly — a module-load
 * snapshot resolved once at boot — so the only way the label could refresh
 * was a full reload that rebuilt the module graph.
 *
 * The #557 fix made the sidebar derive its label from `loadActiveServerId()`
 * and `loadServers()` on each render.
 *
 * Follow-up safety fix: when the app runs in mock mode or with an env-pinned
 * `VITE_FHIR_BASE_URL`, `SETTINGS_ENABLED` is false. In that case the client
 * is bound to `ACTIVE_SERVER_CONFIG` at build time and no server switch is
 * possible. The sidebar now reads `ACTIVE_SERVER_CONFIG.id` directly instead
 * of localStorage, so the displayed server always matches the one actually
 * receiving requests — preventing a user-visible mismatch in production/staging
 * where env overrides are used.
 *
 * In the E2E environment, `USE_MOCK` is true (DEV mode), so `SETTINGS_ENABLED`
 * is false. After clicking `Use`, the sidebar must continue to reflect the
 * real active server (`ACTIVE_SERVER_CONFIG`), not the label saved to
 * localStorage by the Use action.
 */
test.describe("Settings: Use action refreshes the sidebar label", () => {
  test("sidebar reflects ACTIVE_SERVER_CONFIG when client is env-pinned (mock mode)", async ({ page }) => {
    await page.goto("/fhir-ui/settings");
    await expect(page.getByTestId("settings-page")).toBeVisible();
    // Clear any prior test's persisted server config and reload once so the
    // app starts in the no-active-server state.
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem("fhir-place:active-server");
        window.localStorage.removeItem("fhir-place:servers");
      } catch {
        /* private mode / quota — test will still drive the UI directly */
      }
    });
    await page.reload();
    await expect(page.getByTestId("settings-page")).toBeVisible();

    // Sidebar's server-picker section — the source of truth for what the
    // sidebar claims the active server is.
    const sidebarPicker = page.getByTestId("server-picker-trigger");
    await expect(sidebarPicker).toBeVisible();
    const initialPickerText = (await sidebarPicker.textContent())?.trim();
    expect(initialPickerText).toBeTruthy();

    // Pick a built-in server row whose label is not already shown in the
    // sidebar and click its Use button.
    const useButtons = page.getByTestId("use-server");
    const useCount = await useButtons.count();
    expect(useCount).toBeGreaterThan(0);

    let targetLabel: string | undefined;
    for (let i = 0; i < useCount; i++) {
      const card = page.getByTestId("server-form").nth(i);
      const labelText = (
        await card.locator("h3").first().textContent()
      )?.trim();
      if (labelText && !initialPickerText?.includes(labelText)) {
        targetLabel = labelText;
        await card.getByTestId("use-server").click();
        break;
      }
    }
    expect(targetLabel).toBeTruthy();

    // In mock mode (SETTINGS_ENABLED = false), the sidebar always reflects
    // ACTIVE_SERVER_CONFIG regardless of what Use wrote to localStorage.
    // The picker must still show the original active server — not the label
    // that was just picked — because the client is not actually switching.
    await expect(sidebarPicker).toContainText(initialPickerText as string);
  });
});
