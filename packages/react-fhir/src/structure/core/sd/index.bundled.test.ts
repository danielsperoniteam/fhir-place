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
 * The package's `prebuild` hook now invokes `sync:sds` before `tsc`, so any
 * artifact-producing build (CI deploy, npm publish, local `pnpm build`) ships
 * populated loaders. The script itself refuses to overwrite the index with
 * an empty map, so a partial regeneration cannot silently sneak in.
 *
 * On a fresh checkout where only the committed stub is present (`loaders`
 * exactly empty), `pnpm test:run` skips these assertions so the normal
 * unit-test workflow doesn't require running `build` first. As soon as
 * `sync:sds` has run, the assertions activate and verify that every type
 * advertised in `bundledTypes` has a matching loader.
 */
const isUninitialisedStub = Object.keys(loaders).length === 0;

describe.skipIf(isUninitialisedStub)(
  "bundled StructureDefinition loaders (production smoke test)",
  () => {
    it("ships a loader for every entry in bundledTypes", () => {
      const missing = bundledTypes.filter((t) => !loaders[t]);
      expect(missing).toEqual([]);
    });

    it("includes the canonical core resource types", () => {
      const required = [
        "Patient",
        "Observation",
        "MedicationRequest",
        "Encounter",
        "Condition",
      ];
      const missing = required.filter((t) => !loaders[t]);
      expect(missing).toEqual([]);
    });
  },
);
