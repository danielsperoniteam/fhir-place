import { expect, test } from "@playwright/test";

// #254 PR B: type-filtered modifier menus and number/quantity prefixes in
// the search form, round-tripping through the page URL.
test.describe("Search modifiers and prefixes", () => {
  test("builds a modifier'd + date-prefixed query and round-trips it via the URL", async ({
    page,
  }) => {
    await page.goto("/fhir-ui/Patient");
    const search = page.getByTestId("resource-search");

    // given:exact=Alan
    await search.getByRole("textbox", { name: "given" }).fill("Alan");
    await search.getByLabel("given modifier").selectOption("exact");
    // birthdate=ge1912-06-23
    await search.getByLabel("birthdate prefix").selectOption("ge");
    await search.getByLabel("birthdate", { exact: true }).fill("1912-06-23");

    await search.getByRole("button", { name: /^search$/i }).click();
    await expect(page).toHaveURL(/given%3Aexact=Alan|given:exact=Alan/);
    await expect(page).toHaveURL(/birthdate=ge1912-06-23/);

    // The request preview mirrors the modifier'd key.
    await expect(page.getByTestId("request-preview-url")).toContainText(
      "given:exact=Alan",
    );

    // Reload: the form hydrates value + modifier + prefix from the URL.
    await page.reload();
    const rehydrated = page.getByTestId("resource-search");
    await expect(rehydrated.getByRole("textbox", { name: "given" })).toHaveValue(
      "Alan",
    );
    await expect(rehydrated.getByLabel("given modifier")).toHaveValue("exact");
    await expect(rehydrated.getByLabel("birthdate prefix")).toHaveValue("ge");
  });

  test("modifier menus narrow by type: string offers :exact, token does not", async ({
    page,
  }) => {
    await page.goto("/fhir-ui/Patient");
    const search = page.getByTestId("resource-search");

    // allTextContents does not auto-wait — anchor on visibility first.
    await expect(search.getByLabel("given modifier")).toBeVisible();
    const givenOptions = await search
      .getByLabel("given modifier")
      .locator("option")
      .allTextContents();
    expect(givenOptions.join(",")).toContain(":exact");

    const genderOptions = await search
      .getByLabel("gender modifier")
      .locator("option")
      .allTextContents();
    expect(genderOptions.join(",")).toContain(":not");
    expect(genderOptions.join(",")).not.toContain(":exact");
  });
});
