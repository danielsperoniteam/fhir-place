import { describe, expect, it } from "vitest";
import { bundledTypes, loaders } from "./index.generated.js";

/**
 * Regression test for the production bug where `pages.yml` deployed a build
 * with an empty `loaders` map (the committed stub) because no step in the
 * release pipeline ran `pnpm sync:sds`. With an empty map the bundled-core
 * fallback in `resolveStructureDefinition` returns undefined for every type,
 * and the SMART/HAPI public sandboxes don't store core SDs at REST — every
 * `<ResourceView>` collapses with the friendly "could not resolve" error.
 *
 * The package's `prebuild` hook now invokes `sync:sds` before `tsc`, so the
 * published bundle always ships populated loaders. Tests run after `build`
 * in both `ci.yml` and `pages.yml`, which means by the time vitest runs, the
 * generated loaders module has already been written. If this test fails on
 * a fresh local checkout, run `pnpm --filter @fhir-place/react-fhir sync:sds`
 * (or the package's `build`) once to populate it.
 */
describe("bundled StructureDefinition loaders (production smoke test)", () => {
  it("ships a loader for every entry in bundledTypes", () => {
    const missing = bundledTypes.filter((t) => !loaders[t]);
    expect(missing, prebuildHint(missing)).toEqual([]);
  });

  it("includes the canonical core resource types", () => {
    const required = ["Patient", "Observation", "MedicationRequest", "Encounter", "Condition"];
    const missing = required.filter((t) => !loaders[t]);
    expect(missing, prebuildHint(missing)).toEqual([]);
  });
});

function prebuildHint(missing: string[]): string {
  if (missing.length === 0) return "";
  return (
    `Bundled loaders map is missing ${missing.length} type(s) (e.g. ${missing.slice(0, 3).join(", ")}). ` +
    `The committed sd/index.generated.ts is a CI-bootstrap stub; run ` +
    `\`pnpm --filter @fhir-place/react-fhir sync:sds\` or the package's ` +
    `build (which invokes sync:sds via prebuild) to populate it.`
  );
}
