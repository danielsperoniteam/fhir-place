#!/usr/bin/env node
/**
 * Profile-aware codegen spike (issue #123).
 *
 * Reads a *cached* copy of the US Core 7.0 IG package from
 * `scripts/cache/us-core-7/package/`, walks `StructureDefinition.differential`
 * for the two profiles in scope (Patient + Laboratory Result Observation),
 * and emits a TS file with branded narrowed types at
 * `src/structure/__experimental__/us-core-7.ts`.
 *
 * This is **not** a stable API. The goal is to learn the shape of the codegen
 * pipeline before committing to it. See `docs/spikes/profile-codegen.md` for
 * what worked, what didn't, and what would need to change to expand to a full
 * IG.
 *
 * Usage (from repo root):
 *   node --experimental-strip-types packages/react-fhir/scripts/codegen-spike.ts
 *
 * Node 22+ is required for the `--experimental-strip-types` flag. The script
 * only uses node:fs, node:path, and node:url, so no npm deps are needed.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type ElementDefinition = {
  id?: string;
  path: string;
  sliceName?: string;
  min?: number;
  max?: string;
  mustSupport?: boolean;
  type?: { code: string; profile?: string[]; targetProfile?: string[] }[];
  fixedUri?: string;
  fixedCode?: string;
  binding?: { strength: string; valueSet?: string };
  slicing?: unknown;
};

type StructureDefinition = {
  resourceType: "StructureDefinition";
  id: string;
  url: string;
  version?: string;
  name: string;
  type: string;
  baseDefinition?: string;
  derivation?: "specialization" | "constraint";
  differential?: { element: ElementDefinition[] };
};

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = join(HERE, "cache", "us-core-7", "package");
const OUTPUT_FILE = join(
  HERE,
  "..",
  "src",
  "structure",
  "__experimental__",
  "us-core-7.ts",
);

/** Profiles the spike commits to narrowing. Anything else in the cache is ignored. */
const TARGET_PROFILE_URLS = new Set([
  "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
  "http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab",
]);

function loadIgPackage(): StructureDefinition[] {
  const files = readdirSync(PACKAGE_DIR).filter(
    (f) => f.startsWith("StructureDefinition-") && f.endsWith(".json"),
  );
  const sds: StructureDefinition[] = [];
  for (const f of files) {
    const sd = JSON.parse(
      readFileSync(join(PACKAGE_DIR, f), "utf8"),
    ) as StructureDefinition;
    if (sd.resourceType !== "StructureDefinition") continue;
    if (!TARGET_PROFILE_URLS.has(sd.url)) continue;
    sds.push(sd);
  }
  return sds;
}

/**
 * Walk a profile's differential and collect:
 *   - top-level paths that gain `min >= 1` or `mustSupport`
 *   - choice-type narrowings (`value[x]` -> the explicit `type[]` codes)
 *   - slice names per top-level path
 *   - bound ValueSet URLs
 *
 * The spike deliberately stops at depth 1 below the resource root for member
 * narrowing; deeper paths (e.g. `Patient.name.family`) are recorded as
 * "annotated must-support fields" in the emitted comment but don't change the
 * emitted TS shape. Promoting that to real per-element narrowing is one of
 * the open questions called out in the spike doc.
 */
type NarrowedField = {
  path: string;
  required: boolean;
  mustSupport: boolean;
  choiceTypes?: string[];
  binding?: { strength: string; valueSet: string };
  slices?: string[];
};

type NarrowedProfile = {
  url: string;
  version: string;
  name: string;
  baseType: string;
  topLevelFields: NarrowedField[];
  deepMustSupportPaths: string[];
};

function narrow(sd: StructureDefinition): NarrowedProfile {
  const elements = sd.differential?.element ?? [];
  const fieldsByPath = new Map<string, NarrowedField>();
  const slicesByPath = new Map<string, Set<string>>();
  const deepMustSupport: string[] = [];

  const rootPrefix = `${sd.type}.`;

  for (const el of elements) {
    if (!el.path.startsWith(rootPrefix)) continue;
    const tail = el.path.slice(rootPrefix.length);
    const segments = tail.split(".");
    const topLevel = segments[0];
    if (!topLevel) continue;

    if (el.sliceName) {
      const set = slicesByPath.get(topLevel) ?? new Set();
      set.add(el.sliceName);
      slicesByPath.set(topLevel, set);
    }

    if (segments.length > 1) {
      if (el.mustSupport) deepMustSupport.push(el.path);
      continue;
    }

    const existing = fieldsByPath.get(topLevel) ?? {
      path: topLevel,
      required: false,
      mustSupport: false,
    };

    if (typeof el.min === "number" && el.min >= 1) existing.required = true;
    if (el.mustSupport) existing.mustSupport = true;

    if (topLevel.endsWith("[x]") && el.type && el.type.length > 0) {
      existing.choiceTypes = el.type.map((t) => t.code);
    }

    if (el.binding?.valueSet) {
      existing.binding = {
        strength: el.binding.strength,
        valueSet: el.binding.valueSet,
      };
    }

    fieldsByPath.set(topLevel, existing);
  }

  for (const [path, set] of slicesByPath) {
    const f = fieldsByPath.get(path);
    if (f) f.slices = [...set];
  }

  return {
    url: sd.url,
    version: sd.version ?? "unknown",
    name: sd.name,
    baseType: sd.type,
    topLevelFields: [...fieldsByPath.values()].filter(
      (f) => f.mustSupport || f.required || f.choiceTypes || f.slices,
    ),
    deepMustSupportPaths: deepMustSupport,
  };
}

function emitProfile(profile: NarrowedProfile): string {
  const brand = profile.name;
  const requiredKeys: string[] = [];

  for (const f of profile.topLevelFields) {
    // Choice types (`value[x]`) are intentionally NOT narrowed in the spike.
    // The shape that lands in JSON has a per-variant property
    // (`valueQuantity` / `valueString` / ...), and writing a sound discriminated
    // union over those at the parent level is non-trivial in TS — see the
    // "Punted" section of `docs/spikes/profile-codegen.md`. The spike records
    // the choice list in the JSDoc annotation only.
    if (f.path.endsWith("[x]")) continue;
    if (f.required || f.mustSupport) requiredKeys.push(f.path);
  }

  const requiredKeyUnion =
    requiredKeys.length === 0
      ? "never"
      : requiredKeys.map((k) => `"${k}"`).join(" | ");

  const fieldDocs = profile.topLevelFields
    .map((f) => {
      const flags = [
        f.required ? "min=1" : null,
        f.mustSupport ? "MS" : null,
        f.binding ? `binding=${f.binding.strength}` : null,
        f.slices ? `slices=[${f.slices.join(",")}]` : null,
        f.choiceTypes ? `choice=[${f.choiceTypes.join("|")}]` : null,
      ]
        .filter(Boolean)
        .join(" ");
      return ` *   - ${f.path} (${flags})`;
    })
    .join("\n");

  return [
    `// ===== ${profile.name} (${profile.url} v${profile.version}) =====`,
    "",
    `/**`,
    ` * Branded marker for ${profile.name}. Generated by`,
    ` * \`scripts/codegen-spike.ts\` from a cached US Core 7.0 IG. Experimental.`,
    ` *`,
    ` * Profiled fields walked from \`differential\`:`,
    fieldDocs || " *   (no top-level constraints)",
    ` *`,
    ` * Deep must-support paths recorded but not narrowed in the spike:`,
    profile.deepMustSupportPaths.length === 0
      ? " *   (none)"
      : profile.deepMustSupportPaths.map((p) => ` *   - ${p}`).join("\n"),
    ` */`,
    `declare const ${brand}Brand: unique symbol;`,
    "",
    `export type ${profile.name}Required = ${requiredKeyUnion};`,
    "",
    `type ${profile.name}Base = Omit<${profile.baseType}, ${profile.name}Required> & {`,
    `  readonly [K in ${profile.name}Required]-?: NonNullable<${profile.baseType}[K]>;`,
    `};`,
    "",
    `export type ${profile.name} = ${profile.name}Base & {`,
    `  readonly [${brand}Brand]: "${profile.url}";`,
    `};`,
    "",
    `/**`,
    ` * Brand an unbranded ${profile.baseType} as ${profile.name}.`,
    ` *`,
    ` * The spike does **not** validate at runtime — this is a type-only escape`,
    ` * hatch. A real codegen pipeline would either (a) emit a Zod parser per`,
    ` * profile, or (b) use \`fhirpath\` invariants from the SD to drive runtime`,
    ` * narrowing.`,
    ` */`,
    `export function as${profile.name}(`,
    `  resource: ${profile.name}Base,`,
    `): ${profile.name} {`,
    `  return resource as ${profile.name};`,
    `}`,
    "",
  ].join("\n");
}

function emit(profiles: NarrowedProfile[]): string {
  const baseTypes = [...new Set(profiles.map((p) => p.baseType))].sort();
  const header = [
    "/* eslint-disable */",
    "// @generated by packages/react-fhir/scripts/codegen-spike.ts",
    "// DO NOT EDIT BY HAND. Re-run the script to regenerate.",
    "//",
    "// Source: cached US Core 7.0.0 IG (scripts/cache/us-core-7/).",
    "// Status: __experimental__ spike output for issue #123. NOT exported from",
    "// the package barrel (`src/structure/index.ts`). See",
    "// `docs/spikes/profile-codegen.md` for caveats and known limitations.",
    "",
    `import type { ${baseTypes.join(", ")} } from "fhir/r4";`,
    "",
  ].join("\n");

  const body = profiles.map(emitProfile).join("\n");

  return `${header}\n${body}`;
}

function main() {
  const sds = loadIgPackage();
  if (sds.length === 0) {
    throw new Error(
      `No StructureDefinitions matched the spike's profile allow-list under ${PACKAGE_DIR}.`,
    );
  }
  const narrowed = sds.map(narrow);
  const out = emit(narrowed);
  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, out);
  console.error(
    `[codegen-spike] wrote ${narrowed.length} profile(s) to ${OUTPUT_FILE}`,
  );
  for (const p of narrowed) {
    console.error(
      `  - ${p.name} (${p.topLevelFields.length} top-level fields, ${p.deepMustSupportPaths.length} deep MS paths)`,
    );
  }
}

main();
