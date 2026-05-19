import { expect, test } from "@playwright/test";

// Regression coverage for #476 and #564. Procedures whose performed time is
// carried in `performedPeriod` (not `performedDateTime`) used to render `—`
// in the list view's "Performed" column because the column was hard-pinned
// to `performedDateTime` (#476). The fix routes the column through
// `performed[x]` so either choice variant materialises per row.
// #564: the Period branch then rendered raw ISO-8601 strings while the
// DateTime branch rendered locale-formatted text; both branches now use the
// same human-readable locale format. This spec asserts both.
test.describe("Procedure list — Performed column", () => {
  test("renders performedPeriod.start, not '—', for period-only procedures", async ({
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

    // performedDateTime row — keeps working. The DateTime renderer
    // formats the timestamp via toLocaleString, but the underlying
    // <time datetime="…"> attribute still carries the raw ISO value.
    const dtRow = table
      .getByTestId("resource-row")
      .filter({ hasText: "Screening colonoscopy" });
    await expect(dtRow).toBeVisible();
    await expect(dtRow.locator("time")).toHaveAttribute(
      "datetime",
      "2023-11-02T10:30:00Z",
    );

    // performedPeriod-only row — the row this bug was filed for.
    // PeriodRenderer emits `<time>start</time> → <time>end</time>`. The
    // raw ISO value stays on the `datetime` attribute (machine-readable)
    // while the visible text is locale-formatted (#564), matching the
    // DateTime branch above.
    const periodRow = table
      .getByTestId("resource-row")
      .filter({ hasText: "Physical therapy" });
    await expect(periodRow).toBeVisible();
    const times = periodRow.locator("time");
    await expect(times.first()).toHaveAttribute("datetime", "2022-02-01");
    await expect(times.nth(1)).toHaveAttribute("datetime", "2022-06-30");
    // The visible text must NOT be the raw ISO string — it is locale-formatted.
    await expect(times.first()).not.toHaveText("2022-02-01");

    // The Performed cell specifically must not collapse to the `—` placeholder.
    // Asserting against the whole row would still pass if only this cell
    // regressed (other cells still carry text), so scope to the column.
    // Default visible columns are Status, Procedure (code), Performed —
    // index 2.
    const performedCell = periodRow.locator("td").nth(2);
    await expect(performedCell).not.toHaveText(/^—$/);
  });
});
