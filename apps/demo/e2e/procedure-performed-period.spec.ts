import { expect, test } from "@playwright/test";

// Regression coverage for #476. Procedures whose performed time is carried
// in `performedPeriod` (not `performedDateTime`) used to render `—` in the
// list view's "Performed" column because the column was hard-pinned to
// `performedDateTime`. The fix routes the column through `performed[x]` so
// either choice variant materialises per row; this spec asserts both.
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
    // PeriodRenderer emits `<time>start</time> → <time>end</time>` with
    // the raw start/end date strings; this is what used to render `—`
    // before the column was switched to `performed[x]`.
    const periodRow = table
      .getByTestId("resource-row")
      .filter({ hasText: "Physical therapy" });
    await expect(periodRow).toBeVisible();
    const times = periodRow.locator("time");
    await expect(times.first()).toContainText("2022-02-01");
    await expect(times.nth(1)).toContainText("2022-06-30");

    // The period row must not collapse to the `—` placeholder.
    await expect(periodRow).not.toContainText(/^—$/);
  });
});
