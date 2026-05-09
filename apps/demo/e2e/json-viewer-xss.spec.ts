import { expect, test } from "@playwright/test";

/**
 * Regression for issue #360 — stored XSS in the JSON viewer on every
 * resource detail page. `colorJson` used to feed FHIR data straight into
 * `dangerouslySetInnerHTML` without HTML-escaping. A Patient with a
 * crafted `text.div` (a required FHIR element on most resources) carrying
 * `<img src=x onerror=...>` would execute attacker JS in the viewer's
 * origin and could exfiltrate the bearer tokens / Anthropic API key we
 * cache in localStorage.
 *
 * The fix HTML-escapes each line before the highlighter runs, so the
 * payload renders as text. This test asserts:
 *   1. `window.__pwn` is never set (the onerror handler never fires).
 *   2. No `<img>` element materializes in the document.
 */
test.describe("JSON viewer XSS", () => {
  test("escapes attacker-supplied HTML in FHIR data", async ({ page }) => {
    // Inject a one-shot MSW handler that returns a poisoned Patient. The
    // dev SPA runs MSW in a service worker and exposes its handles via
    // `window.__msw` (see apps/demo/src/main.tsx) — same pattern as
    // delete-error.spec.ts.
    await page.goto("/fhir-ui/Patient");
    await page.waitForFunction(() => {
      return Boolean((window as unknown as { __msw?: unknown }).__msw);
    });
    await page.evaluate(() => {
      const m = (
        window as unknown as {
          __msw: {
            worker: { use: (...args: unknown[]) => void };
            http: { get: (path: string, h: () => unknown) => unknown };
            HttpResponse: { json: (body: unknown, init?: unknown) => unknown };
          };
        }
      ).__msw;
      m.worker.use(
        m.http.get("*/fhir/Patient/poc-xss", () =>
          m.HttpResponse.json({
            resourceType: "Patient",
            id: "poc-xss",
            text: {
              status: "generated",
              div: '<div xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror="window.__pwn=true"></div>',
            },
            name: [{ given: ["Pwn"], family: "Test" }],
          }),
        ),
      );
    });

    // Navigate within the SPA via the History API rather than `page.goto`,
    // which would do a full reload and tear down the MSW worker (along with
    // our one-shot handler).
    await page.evaluate(() => {
      window.history.pushState({}, "", "/fhir-ui/Patient/poc-xss");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByTestId("resource-json")).toBeVisible();

    // The onerror payload must never run. If `__pwn` is set, the viewer
    // parsed the FHIR-supplied HTML — that's the bug.
    expect(
      await page.evaluate(() => (window as unknown as { __pwn?: boolean }).__pwn),
    ).toBeUndefined();

    // And the payload must not have materialized as an actual <img> in
    // the document — neither inside the JSON pane nor anywhere else.
    await expect(page.locator("img[onerror]")).toHaveCount(0);

    // Sanity check: the escaped payload IS visible as text in the JSON
    // viewer, so the fix didn't accidentally drop the field.
    await expect(page.getByTestId("resource-json")).toContainText("onerror");
  });
});
