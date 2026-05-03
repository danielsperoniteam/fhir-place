#!/usr/bin/env node
/**
 * Mirror the R4 core StructureDefinitions into `apps/demo/public/fhir-r4/` so
 * the demo can resolve any resource type's SD at runtime without depending on
 * hl7.org being CORS-friendly or reachable.
 *
 * Output: one file per resource type, e.g.
 *   apps/demo/public/fhir-r4/patient.profile.json
 *   apps/demo/public/fhir-r4/adverseevent.profile.json
 *
 * Run once after a fresh clone (or whenever the spec is bumped):
 *   pnpm --filter @fhir-place/demo sync:fhir-spec
 *
 * The cache zip is gitignored; the per-type JSON files in `public/` are
 * committed so the demo runs offline straight after `pnpm install`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface StructureDefinition {
  resourceType: "StructureDefinition";
  type?: string;
  kind?: string;
  derivation?: string;
}
interface BundleEntry {
  resource?: { resourceType?: string };
}
interface Bundle {
  entry?: BundleEntry[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, "cache");
const ZIP_PATH = join(CACHE_DIR, "definitions.json.zip");
const RESOURCES_PATH = join(CACHE_DIR, "profiles-resources.json");
const OUTPUT_DIR = join(HERE, "..", "public", "fhir-r4");
const SOURCE_URL = "https://hl7.org/fhir/R4/definitions.json.zip";

function ensureSpec(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (!existsSync(ZIP_PATH)) {
    console.log(`Downloading ${SOURCE_URL} ...`);
    const buf = execFileSync("curl", ["-fsSL", SOURCE_URL], {
      encoding: "buffer",
      maxBuffer: 100 * 1024 * 1024,
    });
    writeFileSync(ZIP_PATH, buf);
  }
  if (!existsSync(RESOURCES_PATH)) {
    console.log("Extracting profiles-resources.json ...");
    execFileSync("unzip", ["-o", "-j", ZIP_PATH, "profiles-resources.json", "-d", CACHE_DIR], {
      stdio: "inherit",
    });
  }
}

function isCoreResourceSd(sd: StructureDefinition): boolean {
  return (
    sd.resourceType === "StructureDefinition" &&
    sd.kind === "resource" &&
    sd.derivation === "specialization" &&
    typeof sd.type === "string" &&
    sd.type.length > 0
  );
}

function main(): void {
  const force = process.argv.includes("--force");
  if (!force && existsSync(OUTPUT_DIR)) {
    const existing = readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".profile.json"));
    if (existing.length > 0) {
      console.log(
        `Skipping sync: ${existing.length} profile JSON files already present in ${OUTPUT_DIR}.\n` +
          `Pass --force to re-download and overwrite.`,
      );
      return;
    }
  }
  ensureSpec();
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const bundle = JSON.parse(readFileSync(RESOURCES_PATH, "utf8")) as Bundle;
  const entries = bundle.entry ?? [];
  let written = 0;
  for (const entry of entries) {
    const sd = entry.resource as StructureDefinition | undefined;
    if (!sd || !isCoreResourceSd(sd)) continue;
    const filename = `${sd.type!.toLowerCase()}.profile.json`;
    writeFileSync(join(OUTPUT_DIR, filename), JSON.stringify(sd) + "\n");
    written += 1;
  }
  console.log(`Wrote ${written} StructureDefinition files to ${OUTPUT_DIR}`);
}

main();
