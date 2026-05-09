import { expect, test } from "@playwright/test";

/**
 * Regression for #360: the resource detail page's JSON viewer used to
 * pass each line through a regex-replace `colorJson()` and inject the
 * result via `dangerouslySetInnerHTML` without escaping. A FHIR
 * resource whose JSON serialization contained `<` or `>` (any
 * `text.div` narrative — required on most resources) became a stored
 * XSS vector reachable from any FHIR server the user connected to.
 *
 * The fix HTML-escapes each line before token-coloring. This spec
 * stuffs an `<img onerror>` and a literal `<script>` payload into a
 * mocked Patient and confirms neither is parsed as markup, no script
 * runs, and `window.__pwn` stays untouched.
 */
test.describe("JSON viewer XSS regression (#360)", () => {
  // Block the MSW service worker so `page.route` intercepts the FHIR
  // API call directly. Same pattern as missing-resource.spec.ts.
  test.use({ serviceWorkers: "block" });

  test("FHIR-supplied HTML in the resource is rendered as text, not parsed", async ({
    page,
  }) => {
    const POC_ID = "poc-xss";
    const PAYLOAD_DIV =
      '<div xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror="window.__pwn=true"></div>';
    const PAYLOAD_GIVEN =
      "<script>window.__pwn_script=true</script>";

    await page.route(new RegExp(`/fhir/Patient/${POC_ID}$`), async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/fhir+json",
        body: JSON.stringify({
          resourceType: "Patient",
          id: POC_ID,
          text: {
            status: "generated",
            div: PAYLOAD_DIV,
          },
          name: [{ given: [PAYLOAD_GIVEN], family: "Pwn" }],
        }),
      });
    });

    // Surface any uncaught page errors so a script tag that *did*
    // execute would fail the run loudly rather than silently.
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    await page.goto(`/fhir-ui/Patient/${POC_ID}`);

    const jsonPane = page.getByTestId("resource-json");
    await jsonPane.waitFor({ timeout: 10_000 });

    // The script-style payload must not have been parsed into the DOM.
    await expect(page.locator("img[onerror]")).toHaveCount(0);
    await expect(jsonPane.locator("script")).toHaveCount(0);

    // Neither onerror nor inline script ran.
    const pwn = await page.evaluate(
      () => (window as unknown as { __pwn?: boolean }).__pwn,
    );
    const pwnScript = await page.evaluate(
      () => (window as unknown as { __pwn_script?: boolean }).__pwn_script,
    );
    expect(pwn).toBeUndefined();
    expect(pwnScript).toBeUndefined();

    // The payload should still be visible — as text — so the viewer
    // remains useful for debugging the resource that triggered it.
    const text = await jsonPane.innerText();
    expect(text).toContain("img src=x onerror");
    expect(text).toContain("<script>");

    expect(pageErrors).toHaveLength(0);
  });
});
