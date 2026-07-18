import type { StructureDefinition } from "fhir/r4";

export interface FhirPathColumn {
  path: string;
  label: string;
}

interface FhirPathColumnInput {
  path: string;
  label?: string;
}

export function labelFromFhirPath(path: string): string {
  const last = path.split(".").pop() ?? path;
  return last
    .replace(/\[\d+\]/g, "")
    .replace(/\[x\]$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function directChildPath(resourceType: string, path?: string): string | null {
  const prefix = `${resourceType}.`;
  if (!path?.startsWith(prefix)) return null;
  const child = path.slice(prefix.length);
  if (!child || child.includes(".")) return null;
  return child;
}

export function topLevelColumnsFromStructureDefinition(
  resourceType: string,
  structureDefinition?: StructureDefinition,
): FhirPathColumn[] {
  const seen = new Set<string>();
  const out: FhirPathColumn[] = [];
  for (const element of structureDefinition?.snapshot?.element ?? []) {
    const path = directChildPath(resourceType, element.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push({ path, label: labelFromFhirPath(path) });
  }
  return out;
}

export function summaryColumnsFromStructureDefinition(
  resourceType: string,
  structureDefinition?: StructureDefinition,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const element of structureDefinition?.snapshot?.element ?? []) {
    if (!element.isSummary) continue;
    const path = directChildPath(resourceType, element.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

/**
 * Merge preferred columns with fallback columns, deduplicating by path.
 *
 * Beyond exact-path dedup, choice[x] abstract paths in the fallback are
 * suppressed when the preferred list already contains at least one concrete
 * variant of that choice (e.g. `deceasedBoolean` covers `deceased[x]`).
 * This prevents the Patient column picker from showing both "Deceased" (from
 * `deceasedBoolean`) and a second "Deceased" entry (from SD-derived
 * `deceased[x]`).
 *
 * A second pass deduplicates by human label. When a parent path (e.g.
 * `basedOn`) and a child path (e.g. `basedOn.reference`) carry the same label
 * after label resolution, the parent is suppressed — the child path is more
 * specific and the SD top-level entry is redundant. This prevents unconfigured
 * resources like Communication from showing duplicate "Based On", "Part Of",
 * and "Recipient" checkboxes in the column picker.
 */
export function mergeFhirPathColumns(
  preferred: FhirPathColumnInput[],
  fallback: FhirPathColumnInput[],
): FhirPathColumn[] {
  const preferredPaths = new Set(preferred.map((c) => c.path));

  const seen = new Set<string>();
  const raw: FhirPathColumn[] = [];

  for (const column of [...preferred, ...fallback]) {
    if (seen.has(column.path)) continue;

    // Suppress an abstract choice[x] path when at least one concrete variant
    // is already in the preferred list. A concrete variant for "deceased[x]"
    // is any preferred path that starts with "deceased" followed by an
    // uppercase letter, e.g. "deceasedBoolean" or "deceasedDateTime".
    const choiceStem = column.path.match(/^(.+)\[x\]$/)?.[1];
    if (choiceStem) {
      // A preferred path "deceasedBoolean" or "deceasedDateTime" covers the
      // abstract "deceased[x]" — match any path whose first character after
      // the stem is uppercase (the FHIR type-name convention).
      const covered = [...preferredPaths].some((p) => {
        if (!p.startsWith(choiceStem)) return false;
        const next = p[choiceStem.length];
        return next !== undefined && next >= "A" && next <= "Z";
      });
      if (covered) continue;
    }

    seen.add(column.path);
    raw.push({
      path: column.path,
      label: column.label ?? labelFromFhirPath(column.path),
    });
  }

  // Suppress parent paths whose label is already covered by a child path in
  // the same list. Group by label; when a label maps to both a short path and
  // a longer child path (e.g. `basedOn` and `basedOn.reference`), keep only
  // the longest (most specific) path and discard the parent.
  const labelToLongest = new Map<string, string>();
  for (const { path, label } of raw) {
    const current = labelToLongest.get(label);
    if (current === undefined || path.length > current.length) {
      labelToLongest.set(label, path);
    }
  }

  return raw.filter(({ path, label }) => labelToLongest.get(label) === path);
}
