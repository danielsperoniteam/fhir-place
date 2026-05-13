import { expect, test } from "@playwright/test";

/**
 * Built-in FHIR server rows on the Settings page must not be silently
 * editable while still carrying the BUILT-IN badge. The badge is a trust
 * signal that says "this is the canonical entry shipped with the app" —
 * if the label or base URL can be silently retargeted (e.g. by an
 * extension writing to localStorage, or by an older build that allowed
 * the edit), users can't rely on what the badge claims.
 *
 * The fix locks `label` and `baseUrl` to canonical for any row with
 * `builtin: true`, both in the UI (readOnly inputs + helper text) and
 * in the merge layer (`mergeWithBuiltins` ignores stored label/baseUrl
 * for built-in ids). This spec exercises both.
 *
 * See issue #503.
 */

const HAPI_ID = "builtin-hapi";
const HAPI_LABEL = "HAPI Public Test Server";
const HAPI_BASE_URL = "https://hapi.fhir.org/baseR4";

test.describe("Settings — built-in server rows are read-only", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/fhir-ui/settings");
    await page.evaluate(() => {
      try {
        window.localStorage.removeItem("fhir-place:servers");
        window.localStorage.removeItem("fhir-place:active-server");
      } catch {
        /* private mode */
      }
    });
    await page.reload();
    await expect(page.getByTestId("settings-page")).toBeVisible();
  });

  test("label and base URL inputs render readOnly for built-in rows", async ({
    page,
  }) => {
    const row = page.locator(`[data-testid="server-form"][data-server-id="${HAPI_ID}"]`);
    await expect(row).toHaveAttribute("data-builtin", "true");

    // Expand the row (built-in HAPI is not active by default — SMART is first).
    await row.getByRole("button", { name: /expand/i }).click();

    const labelInput = row.getByTestId("server-label-input");
    const baseUrlInput = row.getByTestId("server-base-url-input");

    await expect(labelInput).toHaveAttribute("readonly", "");
    await expect(baseUrlInput).toHaveAttribute("readonly", "");
    await expect(labelInput).toHaveValue(HAPI_LABEL);
    await expect(baseUrlInput).toHaveValue(HAPI_BASE_URL);

    // The helper copy explains the lock so users understand it isn't a bug.
    await expect(row.getByTestId("builtin-readonly-hint")).toContainText(
      /built-in/i,
    );
  });

  test("custom rows remain fully editable", async ({ page }) => {
    // Seed a custom row so it appears on next load.
    await page.evaluate(() => {
      window.localStorage.setItem(
        "fhir-place:servers",
        JSON.stringify([
          {
            id: "custom-uat",
            label: "My Lab Sandbox",
            baseUrl: "https://example.org/fhir",
            authMode: "none",
          },
        ]),
      );
    });
    await page.reload();

    const row = page.locator(
      `[data-testid="server-form"][data-server-id="custom-uat"]`,
    );
    await expect(row).toHaveAttribute("data-builtin", "false");
    await row.getByRole("button", { name: /expand/i }).click();

    const labelInput = row.getByTestId("server-label-input");
    const baseUrlInput = row.getByTestId("server-base-url-input");
    await expect(labelInput).not.toHaveAttribute("readonly", "");
    await expect(baseUrlInput).not.toHaveAttribute("readonly", "");

    // The built-in helper copy is scoped to built-in rows only.
    await expect(row.getByTestId("builtin-readonly-hint")).toHaveCount(0);
  });

  test("poisoned localStorage cannot retarget a built-in row across reload", async ({
    page,
  }) => {
    // Mimic the original defect: a write to fhir-place:servers retargets
    // builtin-hapi to a different URL with a renamed label. The merge layer
    // must scrub label/baseUrl back to canonical while keeping the badge.
    await page.evaluate(() => {
      window.localStorage.setItem(
        "fhir-place:servers",
        JSON.stringify([
          {
            id: "builtin-hapi",
            label: "Renamed Built-In",
            baseUrl: "https://evil.example.org/fhir",
            authMode: "none",
          },
        ]),
      );
    });
    await page.reload();

    const row = page.locator(
      `[data-testid="server-form"][data-server-id="${HAPI_ID}"]`,
    );
    await expect(row).toHaveAttribute("data-builtin", "true");
    await expect(row).toContainText(HAPI_LABEL);
    await expect(row).toContainText(HAPI_BASE_URL);
    await expect(row).not.toContainText("Renamed Built-In");
    await expect(row).not.toContainText("evil.example.org");

    // Expand and confirm the inputs themselves reflect canonical values.
    await row.getByRole("button", { name: /expand/i }).click();
    await expect(row.getByTestId("server-label-input")).toHaveValue(HAPI_LABEL);
    await expect(row.getByTestId("server-base-url-input")).toHaveValue(
      HAPI_BASE_URL,
    );
  });
});
