import { expect, test } from "@playwright/test";

test.describe("Docs page", () => {
  test("/docs redirects to default doc and renders TOC + content", async ({ page }) => {
    await page.goto("/docs");

    await expect(page).toHaveURL(/\/docs\/overview$/);

    const docsPage = page.getByTestId("docs-page");
    await expect(docsPage).toBeVisible();

    const toc = page.getByTestId("docs-toc");
    await expect(toc).toBeVisible();

    const content = page.getByTestId("docs-content");
    await expect(content).toBeVisible();

    await expect(page.getByTestId("docs-toc-link-overview")).toBeVisible();
    await expect(page.getByTestId("docs-toc-link-fhir-server-setup")).toBeVisible();
    await expect(page.getByTestId("docs-toc-link-adr-0003-agent-safety-rules")).toBeVisible();
  });

  test("clicking a TOC entry deep-links to /docs/:slug", async ({ page }) => {
    await page.goto("/docs/overview");

    await page.getByTestId("docs-toc-link-fhir-server-setup").click();

    await expect(page).toHaveURL(/\/docs\/fhir-server-setup$/);

    const sourcePath = page.getByTestId("docs-source-path");
    await expect(sourcePath).toHaveText("docs/fhir-server-setup.md");

    const heading = page.getByTestId("docs-h1").first();
    await expect(heading).toBeVisible();
  });

  test("unknown slug shows a not-found state with link back", async ({ page }) => {
    await page.goto("/docs/this-doc-does-not-exist");

    const notFound = page.getByTestId("docs-not-found");
    await expect(notFound).toBeVisible();
    await expect(notFound).toContainText("this-doc-does-not-exist");
  });

  test("Docs button in the app sidebar navigates to /docs", async ({ page }) => {
    await page.goto("/fhir-ui/Patient");

    await page.getByTestId("docs-nav").click();

    await expect(page).toHaveURL(/\/docs\/overview$/);
    await expect(page.getByTestId("docs-page")).toBeVisible();
  });
});
