import { expect, test } from "@playwright/test";

test.describe("Patient list row counts", () => {
  test("each row shows compartment counts for that patient", async ({ page }) => {
    await page.goto("/Patient");
    await expect(page.getByRole("heading", { name: /patients/i })).toBeVisible();

    // Ada Lovelace's row has the fixture-populated compartment. Expected
    // counts per fixtures.ts: Conditions 2, MedicationRequests 3,
    // AllergyIntolerance 1, Observations 3, Procedures 2, Encounters 2,
    // Immunizations 1.
    const adaRow = page.getByTestId("resource-row").filter({ hasText: "Ada Lovelace" });
    const counts = adaRow.getByTestId("patient-row-counts");
    await expect(counts).toBeVisible();
    await expect(counts).toContainText(/Cond\s+2/);
    await expect(counts).toContainText(/Meds\s+3/);
    await expect(counts).toContainText(/Allg\s+1/);
    await expect(counts).toContainText(/Obs\s+3/);
    await expect(counts).toContainText(/Proc\s+2/);
    await expect(counts).toContainText(/Enc\s+2/);
    await expect(counts).toContainText(/Imm\s+1/);

    await page.screenshot({
      path: "../../screenshots/15-patient-list-row-counts.png",
      fullPage: true,
    });
  });
});
