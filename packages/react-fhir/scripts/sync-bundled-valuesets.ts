#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

type ValueSetContains = { system?: string; code?: string; display?: string; contains?: ValueSetContains[] };
type ValueSet = {
  resourceType: 'ValueSet';
  url?: string;
  status?: string;
  expansion?: { identifier?: string; timestamp?: string; total?: number; contains?: ValueSetContains[] };
};
type ElementDefinition = { binding?: { valueSet?: string; strength?: string } };
type StructureDefinition = {
  resourceType: 'StructureDefinition';
  kind?: string;
  derivation?: string;
  type?: string;
  snapshot?: { element?: ElementDefinition[] };
  differential?: { element?: ElementDefinition[] };
};
type Bundle = { entry?: Array<{ resource?: unknown }> };

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, 'cache', 'r4-spec');
const ZIP_PATH = join(CACHE_DIR, 'definitions.json.zip');
const EXPANSIONS_PATH = join(CACHE_DIR, 'expansions.json');
const PROFILES_RESOURCES_PATH = join(CACHE_DIR, 'profiles-resources.json');
const PROFILES_TYPES_PATH = join(CACHE_DIR, 'profiles-types.json');
const OUTPUT_PATH = join(HERE, '..', 'src', 'structure', 'core', 'valuesets.generated.ts');

/**
 * Hard cap on bundled VS size — keeps the bundle from inflating with massive
 * terminologies (LOINC subsets, SNOMED hierarchies). Anything larger than
 * this still works at runtime via `$expand` against the terminology server.
 *
 * Tuning notes from the R4 spec data:
 *   cap=200   → ~500 VSes, ~625 KB raw (most common demo dropdowns covered)
 *   cap=500   → +13 VSes, +400 KB raw (long-tail care plan / observation enums)
 *   cap=1000  → +25 VSes, +2.3 MB raw (diminishing returns)
 */
const MAX_CODES = 500;

function ensureSpecData(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (!existsSync(ZIP_PATH)) {
    console.log('Downloading R4 definitions.json.zip ...');
    fetchToFile('https://hl7.org/fhir/R4/definitions.json.zip', ZIP_PATH);
  }
  const wanted = [
    ['expansions.json', EXPANSIONS_PATH],
    ['profiles-resources.json', PROFILES_RESOURCES_PATH],
    ['profiles-types.json', PROFILES_TYPES_PATH],
  ] as const;
  const missing = wanted.filter(([, path]) => !existsSync(path));
  if (missing.length > 0) {
    console.log(`Extracting ${missing.map(([n]) => n).join(', ')} ...`);
    execFileSync(
      'unzip',
      ['-o', '-j', ZIP_PATH, ...missing.map(([n]) => n), '-d', CACHE_DIR],
      { stdio: 'inherit' },
    );
  }
}

function fetchToFile(url: string, outPath: string): void {
  const res = execFileSync('curl', ['-fsSL', url], { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 });
  writeFileSync(outPath, res);
}

function flattenContains(nodes: ValueSetContains[] | undefined): ValueSetContains[] {
  if (!nodes) return [];
  const out: ValueSetContains[] = [];
  const stack = [...nodes];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur.code) out.push({ system: cur.system, code: cur.code, display: cur.display });
    if (cur.contains) stack.push(...cur.contains);
  }
  return out.reverse();
}

/** Strip a trailing `|version` from a canonical so lookups match across pinned + unpinned refs. */
function unversion(canonical: string): string {
  const i = canonical.indexOf('|');
  return i === -1 ? canonical : canonical.slice(0, i);
}

/**
 * Walk every core resource and datatype StructureDefinition's bindings and
 * collect the unversioned canonicals referenced. These are the value sets we
 * most want bundled — they're what `<ResourceEditor>` will look up to decide
 * whether to render a code field as a dropdown vs free text.
 */
function collectReferencedCanonicals(): Set<string> {
  const referenced = new Set<string>();
  for (const path of [PROFILES_RESOURCES_PATH, PROFILES_TYPES_PATH]) {
    if (!existsSync(path)) continue;
    const bundle = JSON.parse(readFileSync(path, 'utf8')) as Bundle;
    for (const entry of bundle.entry ?? []) {
      const sd = entry.resource as StructureDefinition | undefined;
      if (!sd || sd.resourceType !== 'StructureDefinition') continue;
      const elements = sd.snapshot?.element ?? sd.differential?.element ?? [];
      for (const el of elements) {
        const vs = el.binding?.valueSet;
        if (vs) referenced.add(unversion(vs));
      }
    }
  }
  return referenced;
}

interface Stats {
  referenced: number;
  bundled: number;
  bundledReferenced: number;
  bundledUnreferenced: number;
  skippedOversize: number;
  skippedOversizeReferenced: string[];
  skippedNoExpansion: number;
  skippedPartial: number;
  referencedMissing: string[];
}

function generate(): { ts: string; stats: Stats } {
  const bundle = JSON.parse(readFileSync(EXPANSIONS_PATH, 'utf8')) as Bundle;
  const referenced = collectReferencedCanonicals();
  const valueSets = (bundle.entry ?? [])
    .map((e) => e.resource)
    .filter((r): r is ValueSet => !!r && (r as ValueSet).resourceType === 'ValueSet');

  const seen = new Set<string>();
  const rows: Array<[string, ValueSet]> = [];
  const stats: Stats = {
    referenced: referenced.size,
    bundled: 0,
    bundledReferenced: 0,
    bundledUnreferenced: 0,
    skippedOversize: 0,
    skippedOversizeReferenced: [],
    skippedNoExpansion: 0,
    skippedPartial: 0,
    referencedMissing: [],
  };

  for (const vs of valueSets) {
    const url = vs.url;
    if (!url) continue;
    seen.add(url);
    const contains = flattenContains(vs.expansion?.contains);
    const total = vs.expansion?.total ?? contains.length;
    const isReferenced = referenced.has(url);
    if (contains.length === 0) {
      stats.skippedNoExpansion += 1;
      continue;
    }
    if (total > contains.length) {
      stats.skippedPartial += 1;
      continue;
    }
    if (contains.length > MAX_CODES) {
      stats.skippedOversize += 1;
      if (isReferenced) stats.skippedOversizeReferenced.push(url);
      continue;
    }
    rows.push([url, {
      resourceType: 'ValueSet',
      url,
      status: vs.status ?? 'active',
      expansion: {
        identifier: 'generated-from-fhir-r4-expansions',
        timestamp: new Date().toISOString(),
        total: contains.length,
        contains: contains.map((c) => ({ system: c.system, code: c.code, display: c.display })),
      },
    }]);
    stats.bundled += 1;
    if (isReferenced) stats.bundledReferenced += 1;
    else stats.bundledUnreferenced += 1;
  }

  for (const url of referenced) {
    if (!seen.has(url)) stats.referencedMissing.push(url);
  }

  rows.sort((a, b) => a[0].localeCompare(b[0]));

  // Minified JSON keeps the auto-generated source compact; bundlers minify
  // again at build time, but the on-disk file size matters for `git diff`,
  // editor performance, and clone size.
  const ts = `import type { ValueSet } from "fhir/r4";\n\n// AUTO-GENERATED by scripts/sync-bundled-valuesets.ts.\n// Do not edit by hand.\n\nexport const generatedCoreValueSets: Map<string, ValueSet> = new Map(\n${JSON.stringify(rows)} as [string, ValueSet][],\n);\n`;
  return { ts, stats };
}

function reportStats(stats: Stats): void {
  console.log('');
  console.log(`Bundle stats:`);
  console.log(`  Canonicals referenced by core SDs:    ${stats.referenced}`);
  console.log(`  Bundled total:                        ${stats.bundled}`);
  console.log(`    of which referenced by core SDs:    ${stats.bundledReferenced}`);
  console.log(`    of which not referenced (general):  ${stats.bundledUnreferenced}`);
  console.log(`  Skipped — no expansion in bundle:     ${stats.skippedNoExpansion}`);
  console.log(`  Skipped — incomplete expansion:       ${stats.skippedPartial}`);
  console.log(`  Skipped — over ${MAX_CODES} codes:           ${stats.skippedOversize}`);
  if (stats.skippedOversizeReferenced.length > 0) {
    console.log(`    of which referenced by core SDs:    ${stats.skippedOversizeReferenced.length}`);
    console.log(`    (these still work via terminology server $expand at runtime)`);
    for (const url of stats.skippedOversizeReferenced.slice(0, 5)) console.log(`      - ${url}`);
    if (stats.skippedOversizeReferenced.length > 5) {
      console.log(`      ... and ${stats.skippedOversizeReferenced.length - 5} more`);
    }
  }
  if (stats.referencedMissing.length > 0) {
    console.log(`  Referenced canonicals not in expansions.json: ${stats.referencedMissing.length}`);
    for (const url of stats.referencedMissing.slice(0, 5)) console.log(`      - ${url}`);
    if (stats.referencedMissing.length > 5) {
      console.log(`      ... and ${stats.referencedMissing.length - 5} more`);
    }
  }
}

ensureSpecData();
const { ts, stats } = generate();
writeFileSync(OUTPUT_PATH, ts);
console.log(`Wrote ${OUTPUT_PATH}`);
reportStats(stats);
