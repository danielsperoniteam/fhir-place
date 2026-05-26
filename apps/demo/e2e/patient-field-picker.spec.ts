import { expect, test } from "@playwright/test";

const COLUMN_KEY = "fhir-place-demo-patient-columns";
const FIELDS_KEY = "fhir-place-demo-patient-detail-fields";

async function resetPrefs(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(
    ([colKey, fieldsKey]) => {
      localStorage.removeItem(colKey);
      localStorage.removeItem(fieldsKey);
      localStorage.removeItem("fhir-place-demo-patient-layout");
    },
    [COLUMN_KEY, FIELDS_KEY],
  );
}

test.describe("patient field-picker options", () => {
  test("Columns picker on the list page exposes additional Patient fields beyond the default six", async ({
    page,
  }) => {
    await resetPrefs(page);
    await page.goto("/Patient");
    await page.getByTestId("layout-table").click();
    await expect(page.getByTestId("resource-table")).toBeVisible();

    await page.getByRole("button", { name: /columns/i }).click();
    const panel = page.getByRole("group", { name: /choose visible columns/i });

    // Expanded option set: existing six plus identifier, telecom, deceased
    // variants, address sub-paths, marital status, etc. Spot-check a handful
    // that did not exist before this change.
    await expect(panel.getByRole("checkbox", { name: /^identifier$/i })).toBeVisible();
    await expect(panel.getByRole("checkbox", { name: /^telecom$/i })).toBeVisible();
    await expect(panel.getByRole("checkbox", { name: /^deceased on$/i })).toBeVisible();
    await expect(panel.getByRole("checkbox", { name: /^marital status$/i })).toBeVisible();

    // Defaults stay at the original six. Identifier is unchecked.
    await expect(
      panel.getByRole("checkbox", { name: /^identifier$/i }),
    ).not.toBeChecked();
    // Toggling Identifier on materialises a new column header.
    await panel.getByRole("checkbox", { name: /^identifier$/i }).click();
    await expect(
      page.getByRole("columnheader", { name: /identifier/i }),
    ).toBeVisible();
  });

  test("Saved column selection is honoured on the table's first paint, before any toggle", async ({
    page,
  }) => {
    // Regression: the page state used to initialise from defaults while
    // <ColumnPicker> read localStorage internally, so the table briefly
    // disagreed with the picker until the user toggled a checkbox.
    await resetPrefs(page);
    await page.evaluate(
      ([colKey]) => {
        localStorage.setItem(colKey, JSON.stringify(["identifier", "name", "id"]));
        localStorage.setItem("fhir-place-demo-patient-layout", "table");
      },
      [COLUMN_KEY],
    );

    await page.goto("/Patient");
    await expect(page.getByTestId("resource-table")).toBeVisible();

    // Saved columns should appear without opening the picker or toggling anything.
    await expect(page.getByRole("columnheader", { name: /identifier/i })).toBeVisible();
    // Default-but-unselected columns must not render on first paint.
    await expect(page.getByRole("columnheader", { name: /^gender$/i })).toHaveCount(0);
  });

  test("Fields picker on the patient detail page filters rendered top-level elements", async ({
    page,
  }) => {
    await resetPrefs(page);
    await page.goto("/Patient/ada");
    const view = page.getByTestId("resource-view");
    await expect(view).toBeVisible();

    // Sanity-check defaults: every present field is rendered.
    await expect(view).toContainText("Ada Lovelace");
    await expect(view).toContainText("female");
    await expect(view).toContainText("Dec 10, 1815");
    await expect(view).toContainText("ada@example.com");

    // The Fields picker is only present on Patient.
    const fieldsButton = page.getByRole("button", { name: /^fields$/i });
    await expect(fieldsButton).toBeVisible();
    await fieldsButton.click();

    // Materialised choice variant from `deceased[x]` shows up as its own option.
    const panel = page.getByRole("group", { name: /choose visible columns/i });
    await expect(
      panel.getByRole("checkbox", { name: /deceased.*dateTime/i }),
    ).toBeVisible();

    // Hide gender; ResourceView should drop that row.
    await panel.getByRole("checkbox", { name: /^gender$/i }).click();

    await expect(view).not.toContainText("female");
    // Untouched fields remain.
    await expect(view).toContainText("Ada Lovelace");
    await expect(view).toContainText("Dec 10, 1815");
    await expect(view).toContainText("ada@example.com");
  });

  test("Fields picker selection on the patient detail page persists across reload", async ({
    page,
  }) => {
    await resetPrefs(page);
    await page.goto("/Patient/ada");
    await expect(page.getByTestId("resource-view")).toBeVisible();

    await page.getByRole("button", { name: /^fields$/i }).click();
    const panel = page.getByRole("group", { name: /choose visible columns/i });
    await panel.getByRole("checkbox", { name: /^gender$/i }).click();

    await expect(page.getByTestId("resource-view")).not.toContainText("female");

    await page.reload();
    await expect(page.getByTestId("resource-view")).toBeVisible();
    await expect(page.getByTestId("resource-view")).not.toContainText("female");
  });

  test("Columns picker on the list page supports a keyboard filter that narrows the option list", async ({
    page,
  }) => {
    await resetPrefs(page);
    await page.goto("/Patient");
    await page.getByTestId("layout-table").click();
    await expect(page.getByTestId("resource-table")).toBeVisible();

    await page.getByRole("button", { name: /columns/i }).click();
    const panel = page.getByRole("group", { name: /choose visible columns/i });

    const search = panel.getByRole("searchbox");
    await expect(search).toBeVisible();
    // Search input is auto-focused so typing immediately filters.
    await expect(search).toBeFocused();

    await search.fill("marit");
    await expect(
      panel.getByRole("checkbox", { name: /^marital status$/i }),
    ).toBeVisible();
    // Unrelated options are hidden behind the filter.
    await expect(
      panel.getByRole("checkbox", { name: /^telecom$/i }),
    ).toHaveCount(0);

    // Power-user path: the long tail (filtered-out columns) becomes
    // reachable again the moment the filter is cleared.
    await search.clear();
    await expect(panel.getByRole("checkbox", { name: /^telecom$/i })).toBeVisible();
  });

  test("Columns picker filter shows 'no matches' when nothing in the option list matches", async ({
    page,
  }) => {
    await resetPrefs(page);
    await page.goto("/Patient");
    await page.getByTestId("layout-table").click();
    await page.getByRole("button", { name: /columns/i }).click();
    const panel = page.getByRole("group", { name: /choose visible columns/i });
    await panel.getByRole("searchbox").fill("nonexistentcolumnname");
    await expect(panel.getByTestId("column-picker-empty")).toBeVisible();
  });

  test("Fields picker on the patient detail page opens on the curated default subset", async ({
    page,
  }) => {
    await resetPrefs(page);
    await page.goto("/Patient/ada");
    const view = page.getByTestId("resource-view");
    await expect(view).toBeVisible();

    // Curated defaults are visible: name, gender, birthDate, telecom,
    // address, identifier.
    await expect(view).toContainText("Ada Lovelace");
    await expect(view).toContainText("female");
    await expect(view).toContainText("Dec 10, 1815");
    await expect(view).toContainText("ada@example.com");
    await expect(view).toContainText("MRN-0001");

    // `deceasedDateTime` is in the long tail (not in defaults). Picker
    // exposes it but ResourceView leaves it hidden until the user opts in.
    // The walker labels the row `Deceased`; the value is rendered through
    // the date formatter, so we assert on the visible label.
    await expect(view).not.toContainText("Deceased");

    // The picker itself, once opened, still lists every walked field —
    // long tail reachable.
    await page.getByRole("button", { name: /^fields$/i }).click();
    const panel = page.getByRole("group", { name: /choose visible columns/i });
    // Use the search to find the long-tail field, then toggle it on.
    await panel.getByRole("searchbox").fill("deceased");
    const deceasedCheckbox = panel.getByRole("checkbox", { name: /deceased.*dateTime/i });
    await expect(deceasedCheckbox).toBeVisible();
    await expect(deceasedCheckbox).not.toBeChecked();
    await deceasedCheckbox.click();

    // Clear the filter to confirm the row renders in the view.
    await panel.getByRole("searchbox").clear();
    await expect(view).toContainText("Deceased");
  });

  test("Fields picker is not rendered for non-Patient resources", async ({
    page,
  }) => {
    await resetPrefs(page);
    await page.goto("/Condition/cond-htn-ada");
    await expect(page.getByTestId("resource-view")).toBeVisible();
    await expect(page.getByRole("button", { name: /^fields$/i })).toHaveCount(0);
  });

  // Regression for #615: SD-derived choice[x] paths must not produce a second
  // entry in the column picker when the curated list already covers the concrete
  // variants (deceasedBoolean/deceasedDateTime and
  // multipleBirthBoolean/multipleBirthInteger).
  test("Column picker shows no duplicate Deceased or Multiple Birth labels", async ({
    page,
  }) => {
    await resetPrefs(page);
    await page.goto("/Patient");
    await page.getByTestId("layout-table").click();
    await expect(page.getByTestId("resource-table")).toBeVisible();

    await page.getByRole("button", { name: /columns/i }).click();
    const panel = page.getByRole("group", { name: /choose visible columns/i });
    const search = panel.getByRole("searchbox");

    // Filter down to "deceased" entries. Only "Deceased" (deceasedBoolean)
    // and "Deceased on" (deceasedDateTime) should be present — not a second
    // "Deceased" from the abstract deceased[x] path.
    await search.fill("deceased");
    const deceasedCheckboxes = panel.getByRole("checkbox", { name: /deceased/i });
    await expect(deceasedCheckboxes).toHaveCount(2);
    // The abstract path must not appear as a label.
    await expect(panel.getByRole("checkbox", { name: /^deceased$/i })).toHaveCount(1);

    // Filter for "multiple birth". Only the two concrete variants should appear.
    await search.fill("multiple birth");
    const multipleBirthCheckboxes = panel.getByRole("checkbox", { name: /multiple birth/i });
    await expect(multipleBirthCheckboxes).toHaveCount(1);
  });
});
