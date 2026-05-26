import { expect, test } from "@playwright/test";

// Regression coverage for #476 and #556. Procedures whose performed time is
// carried in `performedPeriod` (not `performedDateTime`) used to render `—`
// in the list view's "Performed" column because the column was hard-pinned
// to `performedDateTime`; the fix routes the column through `performed[x]`
// so either choice variant materialises per row.
//
// #556 layered humanisation on top of that: the Performed column must now
// read like `Feb 1, 2022 → Jun 30, 2022` rather than raw ISO. The <time>
// elements still carry the raw FHIR string in `datetime` for screen-readers
// and scrapers.
test.describe("Procedure list — Performed column", () => {
  test("renders humanised performedDateTime and performedPeriod values", async ({
    page,
  }) => {
    // Use the scoped patient view: the mock backend only serves procedures
    // when a patient is in scope, and the same `ResourceListPage` →
    // `ResourceTable` path is exercised either way. Heading is the bare
    // resource type when scoped to a patient compartment.
    await page.goto("/fhir-ui/Procedure?patient=ada");
    await expect(page.getByRole("heading", { name: /^procedure$/i })).toBeVisible();

    const table = page.getByTestId("resource-table-table");
    await expect(table).toBeVisible();

    // performedDateTime row — humanised text in the cell, raw ISO on the
    // <time>'s `datetime` attribute. UTC pin (see formatDateTime in the
    // library) makes "10:30Z" deterministic: "Nov 2, 2023, 10:30 AM".
    const dtRow = table
      .getByTestId("resource-row")
      .filter({ hasText: "Screening colonoscopy" });
    await expect(dtRow).toBeVisible();
    await expect(dtRow.locator("time")).toHaveAttribute(
      "datetime",
      "2023-11-02T10:30:00Z",
    );
    await expect(dtRow).toContainText(/Nov 2, 2023/);

    // performedPeriod-only row — the row this bug was filed for.
    // PeriodRenderer emits `<time>start</time> → <time>end</time>` with
    // humanised text inside and the raw start/end ISO on the `datetime`
    // attribute.
    const periodRow = table
      .getByTestId("resource-row")
      .filter({ hasText: "Physical therapy" });
    await expect(periodRow).toBeVisible();
    const times = periodRow.locator("time");
    await expect(times.first()).toContainText("Feb 1, 2022");
    await expect(times.nth(1)).toContainText("Jun 30, 2022");
    await expect(times.first()).toHaveAttribute("datetime", "2022-02-01");
    await expect(times.nth(1)).toHaveAttribute("datetime", "2022-06-30");

    // The Performed cell specifically must not collapse to the `—` placeholder.
    // Default visible columns are Status, Procedure (code), Performed — index 2.
    const performedCell = periodRow.locator("td").nth(2);
    await expect(performedCell).not.toHaveText(/^—$/);
    // And it must not contain the raw ISO any more.
    await expect(performedCell).not.toContainText("2022-02-01T");
    await expect(performedCell).not.toContainText("→2022");
  });
});
