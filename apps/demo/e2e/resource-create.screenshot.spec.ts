import { expect, test } from "@playwright/test";

test.describe("Generic ResourceCreatePage", () => {
  test("creates a non-Patient resource via the generic page", async ({ page }) => {
    await page.goto("/fhir-ui/Procedure");
    await expect(page.getByRole("heading", { name: /procedures/i })).toBeVisible();

    // The "+ New procedure" button is rendered for any top-N type, not only
    // Patient. Test-id pattern: create-<resourceType lowercase>.
    await page.getByTestId("create-procedure").click();
    await expect(page).toHaveURL(/\/fhir-ui\/Procedure\/new$/);

    const editor = page.getByTestId("resource-editor");
    await expect(editor).toBeVisible();
    // ResourceEditor heading derives from the seeded `{ resourceType }`.
    await expect(editor.getByRole("heading", { name: /new procedure/i })).toBeVisible();

    // Pick a status from the spec-driven select. The mock SD encodes the
    // enumeration in `short` ("preparation | in-progress | …"), which the
    // CodeInput parses into select options.
    await editor.getByLabel("status").selectOption("completed");

    // The save button label uses the per-type singular noun.
    await editor.getByRole("button", { name: /create procedure/i }).click();

    // Lands on the new resource's detail page (id minted by the mock POST).
    await expect(page).toHaveURL(/\/fhir-ui\/Procedure\/procedure-\d+$/);
    await expect(page.getByTestId("resource-view")).toBeVisible();

    await page.screenshot({
      path: "../../screenshots/17-procedure-created.png",
      fullPage: true,
    });
  });

  test("back link returns to the resource index", async ({ page }) => {
    await page.goto("/fhir-ui/MedicationRequest/new");

    const backLink = page.getByTestId("resource-create-back-link");
    await expect(backLink).toHaveText("← All MedicationRequests");
    await expect(backLink).not.toContainText("medicationrequests");

    await backLink.click();
    await expect(page).toHaveURL(/\/fhir-ui\/MedicationRequest$/);
    await expect(page.getByRole("heading", { name: /^medication requests$/i })).toBeVisible();
  });

  test("cancel button returns to the resource index", async ({ page }) => {
    await page.goto("/fhir-ui/Encounter/new");
    await page
      .getByTestId("resource-editor")
      .getByRole("button", { name: /^cancel$/i })
      .click();
    await expect(page).toHaveURL(/\/fhir-ui\/Encounter$/);
  });

  test("falls back to the type name for unconfigured resource types", async ({ page }) => {
    // Goal isn't in the top-10 config, but the spec-driven editor still
    // renders against a minimal SD when one is served.
    await page.goto("/fhir-ui/Condition/new");
    // Heading still uses the resourceType for unconfigured types — here
    // Condition is configured, so it gets the friendly noun.
    await expect(
      page.getByTestId("resource-editor").getByRole("button", { name: /create condition/i }),
    ).toBeVisible();
  });

  test("Patient/new: Save is disabled when all identity fields are empty", async ({ page }) => {
    await page.goto("/fhir-ui/Patient/new");

    const editor = page.getByTestId("resource-editor");
    await expect(editor).toBeVisible();

    // With no name or identifier filled in, the Save button must be disabled.
    const saveButton = page.getByTestId("resource-editor-save");
    await expect(saveButton).toBeDisabled();

    await page.screenshot({
      path: "../../screenshots/pr-issue-588-patient-new-with-all-fields-empty-silently-creates/patient-new-save-disabled.png",
      fullPage: true,
    });
  });

  test("Patient/new: Save is enabled once a name field is filled", async ({ page }) => {
    await page.goto("/fhir-ui/Patient/new");

    const editor = page.getByTestId("resource-editor");
    await expect(editor).toBeVisible();

    // Add a name row, then type a given name — matches how the unit test
    // exercises this path in ResourceEditor.test.tsx. The HumanName inputs
    // are plain <input> elements without an explicit type attribute.
    await editor.getByRole("button", { name: /add name/i }).click();
    // The first textbox in the name block is "Given (comma-separated)".
    await editor.getByRole("textbox").first().fill("Jane");

    const saveButton = page.getByTestId("resource-editor-save");
    await expect(saveButton).not.toBeDisabled();

    await page.screenshot({
      path: "../../screenshots/pr-issue-588-patient-new-with-all-fields-empty-silently-creates/patient-new-save-enabled.png",
      fullPage: true,
    });
  });
});
