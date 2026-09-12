import { expect, test } from "@playwright/test";

/**
 * Regression for the broken staging Communication list (screenshot bug):
 * a failed search rendered the red error banner AND, directly below it, the
 * "No <resource> records match." empty state — telling the user the search
 * both failed and succeeded-with-zero-results at once.
 *
 * The list page must show exactly one of: results, the empty state, or the
 * error banner. The error banner also needs a Retry affordance.
 */
test.describe("Resource list error state", () => {
  test("a failed search shows an error with Retry and no 'no records' message", async ({
    page,
  }) => {
    // First (mocked) search succeeds — one Communication row renders.
    await page.goto("/fhir-ui/Communication");
    await expect(page.getByRole("heading", { name: "Communication" })).toBeVisible();
    await expect(page.getByTestId("resource-row").first()).toBeVisible();

    // Swap the Communication search handler for a 500 so the *next* fetch
    // fails. The dev SPA runs MSW in a service worker; override it at
    // runtime via window.__msw (exposed by main.tsx in dev).
    await page.waitForFunction(() =>
      Boolean((window as unknown as { __msw?: unknown }).__msw),
    );
    type Msw = {
      worker: { use: (...args: unknown[]) => void };
      http: { get: (path: string, h: () => unknown) => unknown };
      HttpResponse: { json: (body: unknown, init?: unknown) => unknown };
    };
    await page.evaluate(() => {
      const m = (window as unknown as { __msw: Msw }).__msw;
      m.worker.use(
        m.http.get("*/fhir/Communication", () =>
          m.HttpResponse.json(
            {
              resourceType: "OperationOutcome",
              issue: [
                { severity: "error", code: "exception", diagnostics: "upstream down" },
              ],
            },
            { status: 500 },
          ),
        ),
      );
    });

    // Changing the page size issues a fresh search under a new query key,
    // which now hits the 500 handler.
    await page.getByTestId("page-size-picker").click();
    await page.getByTestId("page-size-option-50").click();

    // Error banner appears, with a Retry button...
    const banner = page.getByTestId("resource-list-error");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner.getByRole("button", { name: /retry/i })).toBeVisible();
    // ...and the contradictory empty state is NOT shown alongside it.
    await expect(page.getByText(/no communication records match/i)).toHaveCount(0);

    // Retry recovers once the server is healthy again.
    await page.evaluate(() => {
      const m = (window as unknown as { __msw: Msw }).__msw;
      m.worker.use(
        m.http.get("*/fhir/Communication", () =>
          m.HttpResponse.json({
            resourceType: "Bundle",
            type: "searchset",
            total: 1,
            entry: [
              {
                resource: {
                  resourceType: "Communication",
                  id: "comm-recovered",
                  status: "completed",
                  subject: { reference: "Patient/ada" },
                },
              },
            ],
          }),
        ),
      );
    });
    await banner.getByRole("button", { name: /retry/i }).click();

    await expect(page.getByTestId("resource-row").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("resource-list-error")).toHaveCount(0);
  });
});
