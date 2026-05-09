import { expect, test } from "@playwright/test";

/**
 * `<CodedValue>` is the new chip+popover primitive that replaced the old
 * `<CodeChip>` `title`-tooltip rendering of `Coding` / `CodeableConcept`.
 *
 * Hover an AllergyIntolerance.code chip — the fixture's `code.text` is
 * "Penicillin" with no codings, so the popover should render only the TEXT
 * section and the +N indicator should not appear.
 */
test.describe("CodedValue popover", () => {
  test("hovering a text-only CodeableConcept chip reveals the popover TEXT section", async ({
    page,
  }) => {
    await page.goto("/AllergyIntolerance/ai-pen-ada");
    const view = page.getByTestId("hinted-detail");
    await expect(view).toBeVisible();

    // The chip wrapper carries `data-testid="coded-value"`. Multiple chips
    // appear on the detail page (clinicalStatus, verificationStatus, code,
    // reaction.manifestation). Pick the one showing "Penicillin".
    const codeChip = view
      .getByTestId("coded-value")
      .filter({ hasText: "Penicillin" })
      .first();
    await expect(codeChip).toBeVisible();

    // Popover is only mounted when the chip is hovered/focused.
    await expect(
      codeChip.getByTestId("coded-value-popover"),
    ).toHaveCount(0);

    await codeChip.hover();
    const popover = codeChip.getByTestId("coded-value-popover");
    await expect(popover).toBeVisible();

    // TEXT row is present because the fixture sets `code.text = "Penicillin"`.
    await expect(
      codeChip.getByTestId("coded-value-popover-text"),
    ).toHaveText("Penicillin");

    // No coding => no +N indicator and no hidden-codings band.
    await expect(
      codeChip.getByTestId("coded-value-extra-count"),
    ).toHaveCount(0);
    await expect(
      codeChip.getByTestId("coded-value-hidden-band"),
    ).toHaveCount(0);
  });

  test("popover closes on mouseleave", async ({ page }) => {
    await page.goto("/AllergyIntolerance/ai-pen-ada");
    const view = page.getByTestId("hinted-detail");
    await expect(view).toBeVisible();

    const chip = view
      .getByTestId("coded-value")
      .filter({ hasText: "Penicillin" })
      .first();

    await chip.hover();
    await expect(chip.getByTestId("coded-value-popover")).toBeVisible();

    // Move the cursor far outside the chip so mouseleave fires on the wrapper.
    await page.mouse.move(0, 0);
    await expect(chip.getByTestId("coded-value-popover")).toHaveCount(0);
  });
});
