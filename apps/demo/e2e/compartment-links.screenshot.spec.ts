import { expect, test } from "@playwright/test";

test.describe("Patient compartment links + index pages", () => {
  test("chips show counts and link to scoped index pages", async ({ page }) => {
    await page.goto("/Patient/ada");
    const links = page.getByTestId("compartment-links");
    await expect(links).toBeVisible();

    // Every compartment type shows a chip. Fixture-populated counts:
    // Conditions 2, MedicationRequests 3, Allergies 1, Observations 3,
    // Procedures 2, Encounters 2, Immunizations 1.
    await expect(
      page.getByTestId("compartment-chip-Condition"),
    ).toContainText(/Conditions\s*\(2\)/);
    await expect(
      page.getByTestId("compartment-chip-MedicationRequest"),
    ).toContainText(/\(3\)/);
    await expect(
      page.getByTestId("compartment-chip-Observation"),
    ).toContainText(/\(3\)/);

    await page.screenshot({
      path: "../../screenshots/13-compartment-chips.png",
      fullPage: true,
    });

    // Click a chip → lands on the index page scoped to the patient.
    await page.getByTestId("compartment-chip-Condition").click();
    await expect(page).toHaveURL(/\/Condition\?patient=ada$/);
    await expect(
      page.getByRole("heading", { name: "Condition", exact: true }),
    ).toBeVisible();
    // New CC UI shows the patient scope as a back-link "← Back to Ada Lovelace".
    // The link renders the human-readable patient name once the Patient read
    // resolves, falling back to the raw UUID while the lookup is in flight.
    // The raw `Patient/<id>` stays accessible via the link's `title` tooltip.
    const backLink = page.getByRole("link", { name: /back to .*ada lovelace/i });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("title", "Patient/ada");
    // ResourceTable renders both desktop and mobile layouts in the DOM
    // at the same time, so scope to the desktop table to avoid
    // strict-mode duplicate matches.
    const desktopTable = page.getByTestId("resource-table-table");
    await expect(desktopTable.getByText("Essential hypertension")).toBeVisible();

    await page.screenshot({
      path: "../../screenshots/14-condition-index.png",
      fullPage: true,
    });

    // Row click → detail page for that condition.
    await desktopTable.getByText("Essential hypertension").click();
    await expect(page).toHaveURL(/\/Condition\/cond-htn-ada$/);
    const view = page.getByTestId("resource-view");
    await expect(view).toBeVisible();
    // Scope to the rendered view; the JSON `<details>` block also
    // contains "essential hypertension" verbatim.
    await expect(view.getByText(/essential hypertension/i)).toBeVisible();

    // Edit button goes to the generic edit page, which already supports Condition.
    await page.getByTestId("edit-resource").click();
    await expect(page).toHaveURL(/\/Condition\/cond-htn-ada\/edit$/);
    await expect(page.getByTestId("resource-editor")).toBeVisible();
  });

  test("Back to patient link from index page returns to the patient", async ({
    page,
  }) => {
    await page.goto("/Condition?patient=ada");
    // The back-link renders the patient's name once the read resolves; the
    // raw UUID lives in the `title` attribute for users who need it.
    await page
      .getByRole("link", { name: /back to .*ada lovelace/i })
      .click();
    await expect(page).toHaveURL(/\/Patient\/ada$/);
  });

  test("unscoped index page (no ?patient=) shows the sidebar and no compartment scope", async ({
    page,
  }) => {
    await page.goto("/Condition");
    // The FHIR UI sidebar provides cross-resource navigation in place of
    // the old per-page "Back to patients" affordance.
    await expect(page.getByTestId("fhir-ui-sidebar")).toBeVisible();
    await expect(page.getByTestId("sidebar-link-Patient")).toBeVisible();
    await expect(page.getByText(/scoped to/i)).not.toBeVisible();
  });
});
