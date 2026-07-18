import { expect, test } from "@playwright/test";

// #254 PR B: type-filtered modifier menus and number/quantity prefixes in
// the search form, round-tripping through the page URL. Uses data-testid
// selectors per the repo's e2e convention.
test.describe("Search modifiers and prefixes", () => {
  test("builds a modifier'd + date-prefixed query and round-trips it via the URL", async ({
    page,
  }) => {
    // Does a full page reload to prove URL→form rehydration; give it extra
    // budget since the reload re-runs the app's font/module loading.
    test.slow();
    await page.goto("/fhir-ui/Patient");
    const search = page.getByTestId("resource-search");

    // given:exact=Alan
    await search.getByTestId("search-value-given").fill("Alan");
    await search.getByTestId("search-modifier-given").selectOption("exact");
    // birthdate=ge1912-06-23
    await search.getByTestId("search-prefix-birthdate").selectOption("ge");
    await search.getByTestId("search-value-birthdate").fill("1912-06-23");

    await search.getByTestId("search-submit").click();
    await expect(page).toHaveURL(/given%3Aexact=Alan|given:exact=Alan/);
    await expect(page).toHaveURL(/birthdate=ge1912-06-23/);

    // The request preview mirrors the modifier'd key.
    await expect(page.getByTestId("request-preview-url")).toContainText(
      "given:exact=Alan",
    );

    // Reload: the form hydrates value + modifier + prefix from the URL.
    await page.reload();
    const rehydrated = page.getByTestId("resource-search");
    await expect(rehydrated.getByTestId("search-value-given")).toHaveValue("Alan");
    await expect(rehydrated.getByTestId("search-modifier-given")).toHaveValue(
      "exact",
    );
    await expect(rehydrated.getByTestId("search-prefix-birthdate")).toHaveValue(
      "ge",
    );
  });

  test("modifier menus narrow by type: string offers :exact, token does not", async ({
    page,
  }) => {
    await page.goto("/fhir-ui/Patient");
    const search = page.getByTestId("resource-search");

    // allTextContents does not auto-wait — anchor on visibility first.
    await expect(search.getByTestId("search-modifier-given")).toBeVisible();
    const givenOptions = await search
      .getByTestId("search-modifier-given")
      .locator("option")
      .allTextContents();
    expect(givenOptions.join(",")).toContain(":exact");

    const genderOptions = await search
      .getByTestId("search-modifier-gender")
      .locator("option")
      .allTextContents();
    expect(genderOptions.join(",")).toContain(":not");
    expect(genderOptions.join(",")).not.toContain(":exact");
  });
});
