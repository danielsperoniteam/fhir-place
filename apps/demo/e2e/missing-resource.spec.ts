import { expect, test } from "@playwright/test";
import { patientStructureDefinition } from "../src/mocks/fixtures.js";

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

  // #482 — when the resource fetch resolves to a 404, the topbar
  // resource-action buttons (Fields ▾, Edit, Delete) must not render.
  // Otherwise Edit on a ghost resource routes to `<Type>/<id>/edit`
  // and Delete confirms a delete that can only ever 404.
  test("Patient/<unknown id> hides Fields/Edit/Delete in the topbar", async ({
    page,
  }) => {
    await page.goto("/Patient/this-id-does-not-exist");

    await expect(page.getByTestId("resource-not-found")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("resource-actions")).toHaveCount(0);
    await expect(page.getByTestId("edit-resource")).toHaveCount(0);
    await expect(page.getByTestId("delete-resource")).toHaveCount(0);
  });

  // The 5xx test runs in a context with service workers blocked so
  // `page.route` intercepts FHIR API calls directly. With MSW running,
  // the in-app service worker would catch the request first and return
  // its seeded 404 for `Patient/p-flaky`, which is not what we're
  // testing here. The SPA's bootstrap is tolerant of `worker.start()`
  // rejecting under blocked service workers.
  test.describe("transient 5xx (no service worker)", () => {
    test.use({ serviceWorkers: "block" });

    test("surfaces an error with a Retry button", async ({ page }) => {
      let attempts = 0;
      // Match only the FHIR API URL — `/\/Patient\/p-flaky$/` would also
      // intercept the SPA navigation `page.goto("/Patient/p-flaky")` and
      // hand the browser an OperationOutcome JSON body in place of
      // index.html, so the React app never loads.
      await page.route(/\/fhir\/Patient\/p-flaky$/, async (route) => {
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
});

test.describe("Missing resource edit page", () => {
  test("Patient/<unknown id>/edit shows a Not Found state, not a blank pane", async ({
    page,
  }) => {
    await page.goto("/Patient/this-id-does-not-exist/edit");

    await expect(page.getByTestId("resource-not-found")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId("resource-loading")).toHaveCount(0);
    await expect(
      page.getByTestId("resource-not-found").getByRole("link", { name: /all patients/i }),
    ).toBeVisible();
  });

  test.describe("transient 5xx (no service worker)", () => {
    test.use({ serviceWorkers: "block" });

    test("surfaces an error with Retry and then renders the editor", async ({ page }) => {
      let attempts = 0;
      let allowSuccess = false;
      await page.route(/\/fhir\/Patient\/p-edit-flaky$/, async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        attempts += 1;
        if (!allowSuccess) {
          await route.fulfill({
            status: 503,
            contentType: "application/fhir+json",
            body: JSON.stringify({
              resourceType: "OperationOutcome",
              issue: [{ severity: "error", code: "transient", diagnostics: "upstream down" }],
            }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/fhir+json",
          body: JSON.stringify({
            resourceType: "Patient",
            id: "p-edit-flaky",
            name: [{ family: "Retry", given: ["Pat"] }],
          }),
        });
      });
      await page.route(/\/fhir\/StructureDefinition\/Patient$/, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/fhir+json",
          body: JSON.stringify(patientStructureDefinition),
        });
      });

      await page.goto("/Patient/p-edit-flaky/edit");
      await expect(page.getByTestId("resource-error")).toBeVisible({ timeout: 10_000 });
      allowSuccess = true;
      await page.getByTestId("resource-error").getByRole("button", { name: /retry/i }).click();

      await expect(page.getByTestId("resource-editor")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("resource-error")).toHaveCount(0);
      expect(attempts).toBeGreaterThanOrEqual(3);
    });
  });
});
