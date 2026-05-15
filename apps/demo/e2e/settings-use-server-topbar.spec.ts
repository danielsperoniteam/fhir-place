import { expect, test } from "@playwright/test";

/**
 * Regression for issue #557.
 *
 * Clicking `Use` on a non-active server row used to leave the sidebar's
 * active-server label stuck on the previous value until a manual page reload.
 * The sidebar rendered `ACTIVE_SERVER_CONFIG.label` directly — a module-load
 * snapshot resolved once at boot — so the only way the label could refresh
 * was a full reload that rebuilt the module graph.
 *
 * The fix makes the sidebar derive its label from `loadActiveServerId()` and
 * `loadServers()` on each render (and re-render via a custom event), so the
 * displayed label tracks the user's choice even when the bound FHIR client
 * is forced to a build-time value (mock mode or env override).
 *
 * The test exercises the bug observable in dev/mock mode: after clicking
 * Use, the sidebar must show the picked server's label, not the previous
 * one. Before the fix the sidebar keeps reading the module snapshot
 * (`Mock (MSW)`) and the assertion fails.
 */
test.describe("Settings: Use action refreshes the sidebar label", () => {
  test("sidebar reflects the newly-selected server", async ({ page }) => {
    await page.goto("/fhir-ui/settings");
    await expect(page.getByTestId("settings-page")).toBeVisible();
    // Clear any prior test's persisted server config and reload once so the
    // app starts in the no-active-server state. Done here (not in
    // addInitScript) so the reload triggered by Use below doesn't re-clear
    // localStorage after the click.
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

    // Sidebar's server-picker section — read its full text (label + base URL)
    // as the source of truth for "what the topbar/sidebar is currently
    // claiming the active server is".
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

    // After Use, the sidebar's server-picker section must show the picked
    // server's label, derived from the persisted active-server id. Before
    // the #557 fix the sidebar kept reading the module-snapshot label
    // (e.g. "Mock (MSW)") and the new label never appeared in the picker.
    await expect(sidebarPicker).toContainText(targetLabel as string);
  });
});
