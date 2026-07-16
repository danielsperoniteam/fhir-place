import { expect, test } from "@playwright/test";

// #254 PR A: save the current search as a labeled query in the sidebar's
// Pinned section (per-server localStorage), load it by clicking, delete it
// via the pin context menu.
test.describe("Saved queries", () => {
  // Each test runs in a fresh browser context, so localStorage starts empty.
  test.beforeEach(async ({ page }) => {
    await page.goto("/fhir-ui/Patient");
  });

  test("Save query is disabled until the URL carries search params", async ({
    page,
  }) => {
    const save = page.getByTestId("save-query");
    await expect(save).toBeVisible();
    await expect(save).toBeDisabled();

    const search = page.getByTestId("resource-search");
    await search.getByRole("textbox", { name: "given" }).fill("Alan");
    await search.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\?given=Alan/);
    await expect(save).toBeEnabled();
  });

  test("save, reload-persist, load, and delete a labeled query", async ({
    page,
  }) => {
    // Build and run a query.
    const search = page.getByTestId("resource-search");
    await search.getByRole("textbox", { name: "given" }).fill("Alan");
    await search.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\?given=Alan/);

    // Save it under a custom label.
    await page.getByTestId("save-query").click();
    await page.getByTestId("save-query-label").fill("Alans only");
    await page.getByTestId("save-query-confirm").click();

    const pinned = page.getByTestId("sidebar-pinned-section");
    await expect(pinned).toContainText("Alans only");

    // Navigate away, then load the saved query from the sidebar.
    await page.getByTestId("sidebar-link-Condition").click();
    await expect(page).toHaveURL(/\/fhir-ui\/Condition$/);
    await pinned.getByText("Alans only").click();
    await expect(page).toHaveURL(/\/fhir-ui\/Patient\?given=Alan$/);
    // The form hydrates from the loaded query.
    await expect(
      page.getByTestId("resource-search").getByRole("textbox", { name: "given" }),
    ).toHaveValue("Alan");

    // Survives a reload (localStorage).
    await page.reload();
    await expect(page.getByTestId("sidebar-pinned-section")).toContainText(
      "Alans only",
    );

    // Delete via the pin context menu (prompt-driven v1).
    page.on("dialog", (dialog) =>
      dialog.type() === "prompt" ? dialog.accept("remove") : dialog.accept(),
    );
    await page
      .getByTestId("sidebar-pinned-section")
      .getByText("Alans only")
      .click({ button: "right" });
    await expect(
      page.getByTestId("sidebar-pinned-section").getByText("Alans only"),
    ).toHaveCount(0);
  });

  test("wired Clear button drops the active filters from the URL", async ({
    page,
  }) => {
    const search = page.getByTestId("resource-search");
    await search.getByRole("textbox", { name: "given" }).fill("Alan");
    await search.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\?given=Alan/);

    await page.getByTestId("clear-filters").click();
    await expect(page).toHaveURL(/\/fhir-ui\/Patient$/);
    await expect(
      page.getByTestId("resource-search").getByRole("textbox", { name: "given" }),
    ).toHaveValue("");
  });
});
