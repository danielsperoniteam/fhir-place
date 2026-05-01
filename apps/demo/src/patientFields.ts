import type { StructureDefinition } from "fhir/r4";
import { directChildren } from "@fhir-place/react-fhir";

export interface PatientFieldOption {
  /** JSON key (matches `WalkedElement.key`), e.g. "name", "deceasedDateTime". */
  path: string;
  /** Human-readable label. */
  label: string;
}

const capitalize = (s: string): string =>
  s ? s[0]!.toUpperCase() + s.slice(1) : s;

const labelFor = (path: string, short?: string): string => {
  if (short && short.length <= 40 && !short.includes("|") && !short.includes(".")) {
    return short;
  }
  const last = path.split(".").pop() ?? path;
  return last
    .replace(/\[x\]$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
};

/**
 * Top-level Patient fields as picker options. Choice elements (e.g.
 * `deceased[x]`) expand into one option per type variant so the path matches
 * the materialised JSON key produced by the walker.
 */
export function patientFieldOptions(
  sd: StructureDefinition,
): PatientFieldOption[] {
  const out: PatientFieldOption[] = [];
  for (const el of directChildren(sd, "Patient")) {
    const last = el.path?.split(".").pop() ?? "";
    if (!last) continue;
    if (last.endsWith("[x]")) {
      const base = last.slice(0, -3);
      for (const t of el.type ?? []) {
        if (!t.code) continue;
        const variantKey = `${base}${capitalize(t.code)}`;
        out.push({
          path: variantKey,
          label: `${labelFor(`Patient.${base}`, el.short)} (${t.code})`,
        });
      }
      continue;
    }
    out.push({ path: last, label: labelFor(el.path!, el.short) });
  }
  return out;
}
