import { expect, test } from "@playwright/test";

/**
 * Confirms `useResourceCapabilities` gates the demo's `+ New` / Edit /
 * Delete buttons against the active server's `CapabilityStatement`.
 *
 * Positive path runs against the standard MSW mock (apps/demo/src/mocks/
 * handlers.ts) which advertises full CRUD for the seeded types.
 *
 * Negative path runs in a service-worker-blocked context and fulfills FHIR
 * calls via Playwright's `page.route` directly. The metadata response lists
 * `Observation` with read + search-type only; navigating to the
 * Observation list and detail pages must therefore not surface any write
 * button.
 */

test.describe("Capability-gated write buttons", () => {
  test("Patient list shows + New (server advertises create)", async ({ page }) => {
    await page.goto("/Patient");
    await expect(page.getByTestId("create-patient")).toBeVisible();
  });

  test("Patient detail shows Edit and Delete (server advertises update + delete)", async ({
    page,
  }) => {
    await page.goto("/Patient");
    await page.getByTestId("patient-row").first().click();
    await expect(page.getByTestId("edit-resource")).toBeVisible();
    await expect(page.getByTestId("delete-resource")).toBeVisible();
  });

  test.describe("read-only CapabilityStatement (no service worker)", () => {
    // Block the MSW service worker so `page.route` is the sole interceptor —
    // exactly the trick `missing-resource.spec.ts` uses for the 5xx case.
    test.use({ serviceWorkers: "block" });

    const readOnlyMetadata = {
      resourceType: "CapabilityStatement",
      status: "active",
      kind: "instance",
      fhirVersion: "4.0.1",
      format: ["json"],
      rest: [
        {
          mode: "server",
          resource: [
            {
              type: "Observation",
              interaction: [{ code: "read" }, { code: "search-type" }],
              searchParam: [
                { name: "_id", type: "token" },
                { name: "patient", type: "reference" },
                { name: "code", type: "token" },
                { name: "status", type: "token" },
              ],
            },
          ],
        },
      ],
    };

    const observationFixture = {
      resourceType: "Observation",
      id: "obs-readonly-1",
      status: "final",
      code: { text: "Heart rate" },
      subject: { reference: "Patient/anyone" },
      meta: { lastUpdated: "2024-01-01T00:00:00Z" },
    };

    const okJson = (body: unknown) => ({
      status: 200,
      contentType: "application/fhir+json",
      body: JSON.stringify(body),
    });

    const installRoutes = async (page: import("@playwright/test").Page) => {
      await page.route(/\/fhir\/metadata$/, async (route) => {
        await route.fulfill(okJson(readOnlyMetadata));
      });
      await page.route(/\/fhir\/StructureDefinition\/Observation$/, async (route) => {
        await route.fulfill(
          okJson({
            resourceType: "StructureDefinition",
            id: "Observation",
            url: "http://hl7.org/fhir/StructureDefinition/Observation",
            name: "Observation",
            status: "active",
            kind: "resource",
            abstract: false,
            type: "Observation",
            snapshot: { element: [] },
          }),
        );
      });
      await page.route(/\/fhir\/Observation(\?.*)?$/, async (route) => {
        await route.fulfill(
          okJson({
            resourceType: "Bundle",
            type: "searchset",
            total: 1,
            entry: [{ resource: observationFixture }],
          }),
        );
      });
      await page.route(/\/fhir\/Observation\/[^/?]+$/, async (route) => {
        await route.fulfill(okJson(observationFixture));
      });
    };

    test("Observation list hides + New", async ({ page }) => {
      await installRoutes(page);
      await page.goto("/Observation");
      await expect(page.locator("h1")).toContainText("Observation");
      await expect(page.getByTestId("create-observation")).toHaveCount(0);
    });

    test("Observation detail hides Edit and Delete", async ({ page }) => {
      await installRoutes(page);
      await page.goto("/Observation/obs-readonly-1");
      await expect(page.getByTestId("resource-view")).toBeVisible();
      await expect(page.getByTestId("edit-resource")).toHaveCount(0);
      await expect(page.getByTestId("delete-resource")).toHaveCount(0);
    });
  });
});
