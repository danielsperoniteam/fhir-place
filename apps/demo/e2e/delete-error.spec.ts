import { expect, test } from "@playwright/test";

test.describe("Delete failure handling", () => {
  test("server-side delete failure surfaces inline in the confirm panel", async ({
    page,
  }) => {
    // The dev SPA runs MSW in a service worker, which catches FHIR
    // calls before Playwright's `page.route` ever sees them. Override
    // the DELETE handler at runtime via `window.__msw` (exposed by
    // `main.tsx` in dev) so this test gets a 409 OperationOutcome —
    // mirrors what HAPI returns when a resource has referencing
    // children that block deletion. The list/read handlers are left
    // alone so we can still navigate to a real fixture patient.
    await page.goto("/Patient");
    await page.waitForFunction(() => {
      return Boolean((window as unknown as { __msw?: unknown }).__msw);
    });
    await page.evaluate(() => {
      const m = (
        window as unknown as {
          __msw: {
            worker: { use: (...args: unknown[]) => void };
            http: { delete: (path: string, h: () => unknown) => unknown };
            HttpResponse: { json: (body: unknown, init: unknown) => unknown };
          };
        }
      ).__msw;
      m.worker.use(
        m.http.delete("*/fhir/Patient/:id", () =>
          m.HttpResponse.json(
            {
              resourceType: "OperationOutcome",
              issue: [
                {
                  severity: "error",
                  code: "conflict",
                  diagnostics: "Patient is referenced by other resources",
                },
              ],
            },
            { status: 409 },
          ),
        ),
      );
    });

    await page.getByTestId("resource-row").first().click();
    await page.getByTestId("delete-resource").click();
    await expect(page.getByTestId("delete-confirm")).toBeVisible();
    await page.getByTestId("delete-confirm-button").click();

    // Inline error appears, the confirm panel stays open, and the user is
    // not navigated away.
    await expect(page.getByTestId("delete-error")).toBeVisible();
    await expect(page.getByTestId("delete-confirm")).toBeVisible();
    await expect(page).toHaveURL(/\/Patient\/[^/]+$/);
  });
});
