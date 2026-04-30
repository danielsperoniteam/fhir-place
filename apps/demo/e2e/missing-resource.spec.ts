import { expect, test } from "@playwright/test";

/**
 * Regression for the deployed Patient detail page hanging on "Loading…"
 * when the requested ID had been deleted upstream (or never existed).
 * The page must surface a not-found state — not stall behind a spinner —
 * and a `retry: 1` policy on 4xx errors must not delay the resolution.
 */
test.describe("Missing resource detail page", () => {
  test("Patient/<unknown id> shows a Not Found state, not a stuck spinner", async ({
    page,
  }) => {
    await page.goto("/Patient/this-id-does-not-exist");

    await expect(page.getByTestId("resource-not-found")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("resource-loading")).toHaveCount(0);
    await expect(
      page.getByTestId("resource-not-found").getByRole("link", { name: /all patients/i }),
    ).toBeVisible();
  });

  test("transient 5xx surfaces an error with a Retry button", async ({ page }) => {
    let attempts = 0;
    await page.route(/\/Patient\/p-flaky$/, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      attempts += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/fhir+json",
        body: JSON.stringify({
          resourceType: "OperationOutcome",
          issue: [{ severity: "error", code: "transient", diagnostics: "upstream down" }],
        }),
      });
    });

    await page.goto("/Patient/p-flaky");
    await expect(page.getByTestId("resource-error")).toBeVisible({ timeout: 10_000 });
    // 503 is retryable, so we expect at least the initial + one retry.
    expect(attempts).toBeGreaterThanOrEqual(2);
    await expect(
      page.getByTestId("resource-error").getByRole("button", { name: /retry/i }),
    ).toBeVisible();
  });
});
