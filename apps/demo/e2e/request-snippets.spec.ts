import { expect, test } from "@playwright/test";

// #146: the request-preview panel can copy the search as a URL, a curl
// command, or a fetch() snippet. Clipboard access needs explicit grants.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.describe("Search request copy-as-snippet", () => {
  test("copies the request as curl and fetch with FHIR headers", async ({
    page,
  }) => {
    await page.goto("/fhir-ui/Patient");

    const preview = page.getByTestId("request-preview");
    await preview.locator("summary").click();

    // Default format copies the bare URL.
    await page.getByTestId("copy-snippet").click();
    // The URL may be absolute (live servers) or relative (the MSW mock's
    // /fhir base) — assert the resource path, not the origin.
    const url = await page.evaluate(() => navigator.clipboard.readText());
    expect(url).toMatch(/\/Patient(\?|$)/);
    expect(url).not.toContain("curl");

    // curl: runnable command with the Accept header and quoted URL.
    await page.getByTestId("copy-format-curl").click();
    await expect(page.getByTestId("copy-snippet")).toHaveText(/copy curl/i);
    await page.getByTestId("copy-snippet").click();
    const curl = await page.evaluate(() => navigator.clipboard.readText());
    expect(curl).toMatch(/^curl -H 'Accept: application\/fhir\+json'/);
    expect(curl).toContain(`'${url}'`);

    // fetch: valid JS with a headers object.
    await page.getByTestId("copy-format-fetch").click();
    await page.getByTestId("copy-snippet").click();
    const fetchSnippet = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(fetchSnippet).toContain(`await fetch('${url}', {`);
    expect(fetchSnippet).toContain(`'Accept': 'application/fhir+json',`);
  });
});
