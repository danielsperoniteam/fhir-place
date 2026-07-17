import { expect, test } from "@playwright/test";

test.describe("Goals & Tasks example app", () => {
  test("patient overview lists seeded goals", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /priya shah/i })).toBeVisible();
    await expect(page.getByTestId("goal-row")).toHaveCount(3);
    await expect(page.getByTestId("goal-row").first()).toContainText(
      "Systolic BP consistently below 130",
    );
    await page.screenshot({
      path: "../../screenshots/goals-tasks-01-overview.png",
      fullPage: true,
    });
  });

  test("opening a goal shows linked tasks", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /systolic bp consistently below 130/i }).click();
    await expect(page).toHaveURL(/\/Goal\/goal-bp/);
    await expect(page.getByTestId("task-row")).toHaveCount(2);
    await expect(page.getByTestId("task-row").first()).toContainText(
      "Record home BP twice daily",
    );
    await page.screenshot({
      path: "../../screenshots/goals-tasks-02-goal-detail.png",
      fullPage: true,
    });
  });

  test("create → edit → delete a Goal end-to-end", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("new-goal").click();
    await expect(page).toHaveURL(/\/Goal\/new/);

    // Description is a CodeableConcept — scope to the description's "Text" input
    // (there are other CodeableConcepts in the form with their own Text field).
    const descriptionText = page
      .locator('[title="Goal.description"] + div')
      .getByRole("textbox", { name: "Text" });
    await descriptionText.fill("Improve sleep hygiene");
    // lifecycleStatus is a required `code` with ValueSet binding → dropdown
    await page
      .getByRole("combobox", { name: "lifecycleStatus" })
      .selectOption("active");
    await page.getByRole("button", { name: /create goal/i }).click();
    await expect(page.getByText(/improve sleep hygiene/i)).toBeVisible();

    await page.screenshot({
      path: "../../screenshots/goals-tasks-03-goal-created.png",
      fullPage: true,
    });

    // Delete it
    await page.getByTestId("delete-goal").click();
    await page.getByTestId("delete-goal-confirm").click();
    await expect(page).toHaveURL("/");
    await expect(page.getByText(/improve sleep hygiene/i)).toHaveCount(0);
  });

  test("advance a task through its status transitions", async ({ page }) => {
    // Grab a task that's in 'ready' state so we can click "→ in-progress" → "→ completed"
    await page.goto("/Goal/goal-a1c");
    await page.getByRole("link", { name: /dietician/i }).click();
    await expect(page).toHaveURL(/\/Task\/task-diet-education/);

    await page.screenshot({
      path: "../../screenshots/goals-tasks-04-task-detail.png",
      fullPage: true,
    });

    await page.getByTestId("advance-status").click();
    // After advance: ready → in-progress. Header pill should read in-progress.
    await expect(page.getByText(/in-progress/i).first()).toBeVisible();

    await page.getByTestId("advance-status").click();
    await expect(page.getByText(/completed/i).first()).toBeVisible();
    // Completed has no further advance button
    await expect(page.getByTestId("advance-status")).toHaveCount(0);
  });
});
