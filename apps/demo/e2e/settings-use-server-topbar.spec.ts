import { expect, test } from "@playwright/test";

/**
 * Regression for issue #557.
 *
 * Original bug: clicking `Use` on a non-active server row left the sidebar's
 * active-server label stuck on the previous value until a manual page reload.
 * The sidebar rendered `ACTIVE_SERVER_CONFIG.label` directly — a module-load
 * snapshot resolved once at boot — so the only way the label could refresh
 * was a full reload that rebuilt the module graph.
 *
 * The fix made the sidebar derive its displayed server from the active-server
 * config on every render and dispatch a `fhir-place:active-server-changed`
 * event so the label tracks the user's choice even when `window.location`
 * `.reload()` is swallowed (e.g. iframed staging contexts).
 *
 * In the E2E environment `USE_MOCK` is true (DEV mode). On a cold load with no
 * persisted server the client resolves to the mock server; once `Use` writes a
 * server id to localStorage and the page reloads, the client resolves to that
 * server instead — so the sidebar label must follow to the newly selected
 * server.
 */
test.describe("Settings: Use action refreshes the sidebar label", () => {
  test("clicking Use updates the sidebar active-server label", async ({ page }) => {
    await page.goto("/fhir-ui/settings");
    await expect(page.getByTestId("settings-page")).toBeVisible();

    // Start from a clean, no-active-server state so the cold-load label is the
    // mock server and any built-in row differs from it.
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

    // Sidebar's server-picker label — the source of truth for what the sidebar
    // claims the active server is.
    const sidebarPicker = page.getByTestId("server-picker-trigger");
    await expect(sidebarPicker).toBeVisible();
    const initialPickerText = (await sidebarPicker.textContent())?.trim();
    expect(initialPickerText).toBeTruthy();

    // Pick a server row whose label is not already shown in the sidebar and
    // click its Use button.
    const cards = page.getByTestId("server-form");
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    let targetLabel: string | undefined;
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      const labelText = (await card.getByTestId("server-name").textContent())?.trim();
      if (labelText && !initialPickerText?.includes(labelText)) {
        targetLabel = labelText;
        await card.getByTestId("use-server").click();
        break;
      }
    }
    expect(targetLabel).toBeTruthy();

    // After Use, the sidebar's active-server label reflects the newly selected
    // server — no manual page reload by the user required.
    await expect(page.getByTestId("active-server-label")).toHaveText(
      targetLabel as string,
    );
  });
});
