import { expect, test } from "@playwright/test";

// #145: paste a FHIR search URL below the request preview to populate the
// search form (same type) or navigate to the right index page (other type).
test.describe("Paste a FHIR search URL", () => {
  test("same-type paste updates the URL bar and fills the form", async ({
    page,
  }) => {
    await page.goto("/fhir-ui/Patient");

    const paste = page.getByTestId("search-url-paste");
    await paste.getByTestId("search-url-paste-input").fill("/Patient?gender=female");
    await paste.getByTestId("search-url-paste-load").click();

    await expect(page).toHaveURL(/\/fhir-ui\/Patient\?gender=female$/);
    // The list page hydrates its form from the page URL.
    const search = page.getByTestId("resource-search");
    await expect(search.getByRole("textbox", { name: "gender" })).toHaveValue(
      "female",
    );
  });

  test("cross-type paste navigates to that resource's index", async ({
    page,
  }) => {
    await page.goto("/fhir-ui/Patient");

    const paste = page.getByTestId("search-url-paste");
    await paste
      .getByTestId("search-url-paste-input")
      .fill("https://hapi.fhir.org/baseR4/Condition?clinical-status=active");
    await paste.getByTestId("search-url-paste-load").click();

    await expect(page).toHaveURL(
      /\/fhir-ui\/Condition\?clinical-status=active$/,
    );
    await expect(
      page.getByRole("heading", { name: /conditions/i }),
    ).toBeVisible();
  });

  test("invalid input shows an inline error instead of crashing", async ({
    page,
  }) => {
    await page.goto("/fhir-ui/Patient");

    const paste = page.getByTestId("search-url-paste");
    await paste.getByTestId("search-url-paste-input").fill("?name=smith");
    await paste.getByTestId("search-url-paste-load").click();

    await expect(page.getByTestId("search-url-paste-error")).toContainText(
      /resource type/i,
    );
    await expect(page).toHaveURL(/\/fhir-ui\/Patient$/);
  });
});
