import { expect, test } from "@playwright/test";

// #253: the References pane shows incoming references ("Referenced by")
// grouped by [type, searchParam], with upfront count badges and
// lazy-fetched section contents.
test.describe("Reverse-references panel", () => {
  test("Patient detail shows grouped incoming references with counts", async ({
    page,
  }) => {
    await page.goto("/fhir-ui/Patient/ada");
    await expect(page.getByTestId("resource-view")).toBeVisible();

    await page.getByRole("button", { name: "References" }).click();
    const panel = page.getByTestId("reverse-references");
    await expect(panel).toBeVisible();

    // The mock's ada has observations; the count badge loads without
    // expanding the section.
    const section = page.getByTestId("revref-section-Observation-patient");
    const badge = page.getByTestId("revref-count-Observation-patient");
    await expect(badge).not.toHaveText("…");
    const count = Number(await badge.innerText());
    expect(count).toBeGreaterThan(0);

    // Expanding lazily fetches and renders clickable chips + the inline query.
    await section.locator("summary").click();
    await expect(section.locator("code")).toContainText(
      "Observation?patient=Patient/ada",
    );
    const chips = section.getByRole("link");
    await expect(chips.first()).toBeVisible();
    await expect(chips.first()).toHaveAttribute(
      "href",
      /\/fhir-ui\/Observation\//,
    );
  });

  test("resource types without configured includes show an empty state", async ({
    page,
  }) => {
    // Condition has no revIncludes registry entry, so its References pane
    // should show the configured-lookups empty state.
    await page.goto("/fhir-ui/Condition");
    const row = page
      .getByTestId(/^resource-row(-card)?$/)
      .filter({ visible: true })
      .first();
    await row.waitFor();
    await row.click();
    await expect(page.getByTestId("resource-view")).toBeVisible();
    await page.getByRole("button", { name: "References" }).click();
    await expect(page.getByTestId("reverse-references-empty")).toBeVisible();
  });
});
