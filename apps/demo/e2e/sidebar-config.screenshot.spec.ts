import { expect, type Page, test } from "@playwright/test";

const cases = [
  {
    type: "Condition",
    heading: "Conditions",
    columns: ["Status", "Condition", "Onset"],
    params: ["patient", "code", "category", "clinical-status", "onset-date"],
    rowText: "Essential hypertension",
  },
  {
    type: "DiagnosticReport",
    heading: "Diagnostic reports",
    columns: ["Status", "Report", "Reported"],
    params: ["patient", "code", "category", "status", "date"],
    rowText: "Lipid panel",
  },
  {
    type: "CarePlan",
    heading: "Care plans",
    columns: ["Status", "Title", "Started"],
    params: ["patient", "category", "status", "intent", "date"],
    rowText: "Cardiovascular risk reduction",
  },
];

async function openSidebarResource(page: Page, resourceType: string, heading: string) {
  await page.getByTestId(`sidebar-link-${resourceType}`).click();
  await expect(page).toHaveURL(new RegExp(`/fhir-ui/${resourceType}$`));
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await page.getByTestId("layout-table").click();
  await expect(page.getByTestId("resource-table")).toBeVisible();
}

test.describe("sidebar resource config", () => {
  test("curated resource pages expose configured columns and search params", async ({
    page,
  }) => {
    await page.goto("/fhir-ui/Patient");
    await expect(page.getByTestId("fhir-ui-sidebar")).toBeVisible();

    for (const entry of cases) {
      await openSidebarResource(page, entry.type, entry.heading);

      const search = page.getByTestId("resource-search");
      for (const param of entry.params) {
        await expect(search.getByLabel(param, { exact: true })).toBeVisible();
      }

      const table = page.getByTestId("resource-table-table");
      for (const column of entry.columns) {
        await expect(
          table.getByRole("columnheader", { name: new RegExp(`^${column}$`, "i") }),
        ).toBeVisible();
      }
      await expect(table.getByText(entry.rowText)).toBeVisible();
    }

    await page.screenshot({
      path: "../../screenshots/18-sidebar-resource-config.png",
      fullPage: true,
    });
  });
});
