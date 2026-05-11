import { expect, test } from "@playwright/test";

/**
 * Tests for the Safety Failure Gallery page.
 *
 * Verifies that all four safety-relevant cases render correctly:
 * no-allergy-data, missing-lab cannot-determine, prompt-injection-ignored,
 * and unauthorized-patient-denied.
 */

test.describe("Failure Gallery page", () => {
  test("page renders with heading and all four cases", async ({ page }) => {
    await page.goto("/fhir-ui/failure-gallery");

    const galleryPage = page.getByTestId("failure-gallery-page");
    await expect(galleryPage).toBeVisible();

    await expect(
      page.getByRole("heading", { name: /safety failure gallery/i }),
    ).toBeVisible();

    const casesList = page.getByTestId("failure-gallery-cases");
    await expect(casesList).toBeVisible();
  });

  test("no-allergy-data case renders with PARTIAL badge and response", async ({ page }) => {
    await page.goto("/fhir-ui/failure-gallery");

    const card = page.getByTestId("gallery-case-no-allergy-data");
    await expect(card).toBeVisible();

    const badge = page.getByTestId("gallery-badge-no-allergy-data");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("PARTIAL");

    const response = page.getByTestId("gallery-response-no-allergy-data");
    await expect(response).toBeVisible();

    const evidence = page.getByTestId("gallery-evidence-no-allergy-data");
    await expect(evidence).toBeVisible();
    await expect(evidence).toContainText("mocks/allergy-empty-bundle.json");
  });

  test("missing-lab case renders with CANNOT DETERMINE badge and response", async ({ page }) => {
    await page.goto("/fhir-ui/failure-gallery");

    const card = page.getByTestId("gallery-case-missing-lab-cannot-determine");
    await expect(card).toBeVisible();

    const badge = page.getByTestId("gallery-badge-missing-lab-cannot-determine");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("CANNOT DETERMINE");

    const response = page.getByTestId("gallery-response-missing-lab-cannot-determine");
    await expect(response).toBeVisible();
    await expect(response).toContainText("INDETERMINATE");
  });

  test("prompt-injection case renders with BLOCKED badge and response", async ({ page }) => {
    await page.goto("/fhir-ui/failure-gallery");

    const card = page.getByTestId("gallery-case-prompt-injection-ignored");
    await expect(card).toBeVisible();

    const badge = page.getByTestId("gallery-badge-prompt-injection-ignored");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("BLOCKED");

    const response = page.getByTestId("gallery-response-prompt-injection-ignored");
    await expect(response).toBeVisible();
    await expect(response).toContainText("No instruction override was performed");
  });

  test("unauthorized-patient case renders with DENIED badge and response", async ({ page }) => {
    await page.goto("/fhir-ui/failure-gallery");

    const card = page.getByTestId("gallery-case-unauthorized-patient-denied");
    await expect(card).toBeVisible();

    const badge = page.getByTestId("gallery-badge-unauthorized-patient-denied");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("DENIED");

    const response = page.getByTestId("gallery-response-unauthorized-patient-denied");
    await expect(response).toBeVisible();
    await expect(response).toContainText("HTTP 403 Forbidden");
  });

  test("sidebar nav button navigates to failure gallery", async ({ page }) => {
    await page.goto("/fhir-ui/Patient");

    const navBtn = page.getByTestId("failure-gallery-nav");
    await expect(navBtn).toBeVisible();
    await navBtn.click();

    await expect(page).toHaveURL(/\/fhir-ui\/failure-gallery/);
    await expect(page.getByTestId("failure-gallery-page")).toBeVisible();
  });
});
