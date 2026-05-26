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

export function mergeFhirPathColumns(
  preferred: FhirPathColumnInput[],
  fallback: FhirPathColumnInput[],
): FhirPathColumn[] {
  const seen = new Set<string>();
  const out: FhirPathColumn[] = [];
  for (const column of [...preferred, ...fallback]) {
    if (seen.has(column.path)) continue;
    seen.add(column.path);
    out.push({
      path: column.path,
      label: column.label ?? labelFromFhirPath(column.path),
    });
  }
  return out;
}
