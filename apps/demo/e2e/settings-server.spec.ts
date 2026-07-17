import { expect, test, type Page, type Route } from "@playwright/test";

const happyBaseUrl = "https://byo.example.test/fhir";
const badBaseUrl = "https://bad.example.test/fhir";

const capabilityStatement = {
  resourceType: "CapabilityStatement",
  status: "active",
  date: "2026-01-01",
  kind: "instance",
  fhirVersion: "4.0.1",
  software: { name: "BYO Test Server" },
  format: ["json"],
};

const emptyBundle = {
  resourceType: "Bundle",
  type: "searchset",
  total: 0,
  entry: [],
};

async function installFhirRoutes(
  page: Page,
  options: { abortBadMetadata?: boolean; onHappyMetadata?: (route: Route) => void } = {},
) {
  await page.route("**/fhir/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.hostname === "bad.example.test" && url.pathname.endsWith("/metadata")) {
      if (options.abortBadMetadata) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({ status: 404, body: "not found" });
      return;
    }

    if (url.hostname === "byo.example.test" && url.pathname.endsWith("/metadata")) {
      options.onHappyMetadata?.(route);
      await route.fulfill({
        status: 200,
        contentType: "application/fhir+json",
        body: JSON.stringify(capabilityStatement),
      });
      return;
    }

    if (url.pathname.endsWith("/metadata")) {
      await route.fulfill({
        status: 200,
        contentType: "application/fhir+json",
        body: JSON.stringify(capabilityStatement),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/fhir+json",
      body: JSON.stringify(emptyBundle),
    });
  });
}

test.describe("FHIR server settings", () => {
  test.use({ serviceWorkers: "block" });

  test("persists a custom endpoint and bearer token, then uses it", async ({
    page,
  }) => {
    let sawHappyMetadata = false;
    await installFhirRoutes(page, {
      onHappyMetadata: (route) => {
        sawHappyMetadata = true;
        expect(route.request().headers().authorization).toBe("Bearer demo-token");
      },
    });

    await page.goto("/fhir-ui/settings");
    await page.getByTestId("add-server").click();

    const form = page.getByTestId("server-form").last();
    await form.getByTestId("server-card-toggle").click();
    await form.getByTestId("server-label-input").fill("BYO Test");
    await form.getByTestId("server-base-url-input").fill(happyBaseUrl);
    await form.getByTestId("server-auth-mode").selectOption("bearer");
    await form.getByTestId("server-bearer-token-input").fill("demo-token");
    await form.getByTestId("test-connection").click();

    await expect(form.getByTestId("test-ok")).toContainText("Connected");
    expect(sawHappyMetadata).toBe(true);

    const stored = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem("fhir-place:servers") ?? "[]"),
    );
    expect(stored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "BYO Test",
          baseUrl: happyBaseUrl,
          authMode: "bearer",
          bearerToken: "demo-token",
        }),
      ]),
    );

    await form.getByTestId("use-server").click();
    // After the reload triggered by Use, the sidebar must reflect the new server
    // (regression: topbar/sidebar stayed stale until manual reload — issue #557).
    await expect(page.getByTestId("base-url")).toContainText(happyBaseUrl);
    await expect(page.getByTestId("active-server-label")).toContainText("BYO Test");
  });

  test("topbar server pill reflects new active server after Use on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await installFhirRoutes(page);

    await page.goto("/fhir-ui/settings");
    await page.getByTestId("add-server").click();

    const form = page.getByTestId("server-form").last();
    await form.getByTestId("server-card-toggle").click();
    await form.getByTestId("server-label-input").fill("Mobile BYO");
    await form.getByTestId("server-base-url-input").fill(happyBaseUrl);
    await form.getByTestId("use-server").click();

    // After reload the topbar pill (mobile-only) must show the new server label.
    const pill = page.getByTestId("topbar-server-pill");
    await expect(pill).toBeVisible();
    await expect(pill).toContainText("Mobile BYO");
  });

  test("reports an error when the metadata URL cannot be reached", async ({
    page,
  }) => {
    await installFhirRoutes(page, { abortBadMetadata: true });

    await page.goto("/fhir-ui/settings");
    await page.getByTestId("add-server").click();

    const form = page.getByTestId("server-form").last();
    await form.getByTestId("server-card-toggle").click();
    await form.getByTestId("server-label-input").fill("Broken Server");
    await form.getByTestId("server-base-url-input").fill(badBaseUrl);
    await form.getByTestId("test-connection").click();

    await expect(form.getByTestId("test-error")).toContainText(
      /Failed to fetch|CORS|network|ERR_FAILED/i,
    );
  });
});
