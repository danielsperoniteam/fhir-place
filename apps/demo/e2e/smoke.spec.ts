import { expect, test, request as pwRequest } from "@playwright/test";

/**
 * Smoke suite for the interop demo matrix.
 *
 * Run with `pnpm --filter @fhir-place/demo e2e -- --grep smoke`.
 *
 * The default invocation hits the local dev server, which uses the in-browser
 * MSW mock (or public HAPI when `VITE_USE_MOCK=false` + `VITE_FHIR_BASE_URL`
 * are set). The Medplum / Aidbox tagged tests probe their backend's
 * `metadata` endpoint and skip gracefully when it isn't reachable, so this
 * file is safe to run against any of the three backends in
 * `docs/interop-matrix.md`.
 */

const FHIR_BASE_URL = process.env.VITE_FHIR_BASE_URL ?? "";

async function backendReachable(url: string): Promise<boolean> {
  if (!url) return false;
  const ctx = await pwRequest.newContext();
  try {
    const metadata = url.replace(/\/$/, "") + "/metadata";
    const res = await ctx.get(metadata, { timeout: 5_000 });
    return res.ok();
  } catch {
    return false;
  } finally {
    await ctx.dispose();
  }
}

test.describe("@smoke interop matrix", () => {
  test("Patient list renders against the configured backend", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /patients/i })).toBeVisible();
    // The base-URL chip surfaces which backend the demo is talking to —
    // useful for triaging when the matrix turns red.
    await expect(page.getByTestId("base-url")).toBeVisible();
    expect(
      consoleErrors.filter(
        (msg) =>
          msg.includes("tx.fhir.org") &&
          msg.includes("ValueSet") &&
          msg.includes("administrative-gender"),
      ),
    ).toEqual([]);
  });

  test("@medplum Patient list renders against Medplum", async ({ page }) => {
    test.skip(
      !/medplum/i.test(FHIR_BASE_URL),
      "VITE_FHIR_BASE_URL does not point at Medplum",
    );
    test.skip(
      !(await backendReachable(FHIR_BASE_URL)),
      `Medplum at ${FHIR_BASE_URL} not reachable`,
    );
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /patients/i })).toBeVisible();
  });

  test("@aidbox Patient list renders against Aidbox", async ({ page }) => {
    test.skip(
      !/aidbox|localhost:8080/i.test(FHIR_BASE_URL),
      "VITE_FHIR_BASE_URL does not point at Aidbox",
    );
    test.skip(
      !(await backendReachable(FHIR_BASE_URL)),
      `Aidbox at ${FHIR_BASE_URL} not reachable`,
    );
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /patients/i })).toBeVisible();
  });
});
