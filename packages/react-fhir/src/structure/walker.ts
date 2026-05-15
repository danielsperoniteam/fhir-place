import type { ElementDefinition, Resource, StructureDefinition } from "fhir/r4";

/** A single element from a StructureDefinition paired with the value found in a resource. */
export interface WalkedElement {
  /** Full FHIR path, e.g. "Patient.name". */
  path: string;
  /** Key on the JSON object, e.g. "name". For choice types this is the resolved key like "valueQuantity". */
  key: string;
  /** Human-readable label derived from the element's short description (fallback: key). */
  label: string;
  /** The ElementDefinition from the StructureDefinition (snapshot or differential). */
  element: ElementDefinition;
  /** Primary FHIR type code (e.g. "string", "HumanName", "BackboneElement"). */
  typeCode: string | undefined;
  /** True when the element has max > 1 (an array in the JSON). */
  isArray: boolean;
  /** True when the element is a choice (path ends in [x]); `typeCode` is the resolved variant. */
  isChoice: boolean;
  /** Raw value from the resource (an array if `isArray`). Undefined when not present. */
  value: unknown;
}

export type ClinicalSafetyGuardrailId =
  | "required-patient-reference"
  | "observation-valuequantity-ucum"
  | "unsafe-dose-unit-abbreviation"
  | "allergy-criticality-visibility"
  | "patient-context-change";

export type ClinicalSafetyGuardrailPhase = "save" | "render" | "edit-context";

export type ClinicalSafetyGuardrailOutcome =
  | "block-save"
  | "warn"
  | "always-display";

export type ClinicalSafetyElementPath = `${Resource["resourceType"]}.${string}`;

export interface ClinicalSafetyGuardrail {
  id: ClinicalSafetyGuardrailId;
  phase: ClinicalSafetyGuardrailPhase;
  outcome: ClinicalSafetyGuardrailOutcome;
  resourceTypes: readonly Resource["resourceType"][];
  elementPaths: readonly ClinicalSafetyElementPath[];
}

// Design registry only: guardrail behavior is implemented by focused follow-up tickets.
export const RESOURCE_EDITOR_CLINICAL_SAFETY_GUARDRAILS = [
  {
    id: "required-patient-reference",
    phase: "save",
    outcome: "block-save",
    resourceTypes: [
      "AllergyIntolerance",
      "Condition",
      "DiagnosticReport",
      "Encounter",
      "MedicationAdministration",
      "MedicationRequest",
      "MedicationStatement",
      "Observation",
      "Procedure",
    ],
    elementPaths: [
      "AllergyIntolerance.patient",
      "Condition.subject",
      "DiagnosticReport.subject",
      "Encounter.subject",
      "MedicationAdministration.subject",
      "MedicationRequest.subject",
      "MedicationStatement.subject",
      "Observation.subject",
      "Procedure.subject",
    ],
  },
  {
    id: "observation-valuequantity-ucum",
    phase: "save",
    outcome: "block-save",
    resourceTypes: ["Observation"],
    elementPaths: ["Observation.valueQuantity.code"],
  },
  {
    id: "unsafe-dose-unit-abbreviation",
    phase: "render",
    outcome: "always-display",
    resourceTypes: ["MedicationRequest", "MedicationAdministration", "MedicationStatement"],
    elementPaths: [
      "MedicationRequest.dosageInstruction",
      "MedicationAdministration.dosage",
      "MedicationStatement.dosage",
    ],
  },
  {
    id: "allergy-criticality-visibility",
    phase: "render",
    outcome: "always-display",
    resourceTypes: ["AllergyIntolerance"],
    elementPaths: [
      "AllergyIntolerance.reaction",
      "AllergyIntolerance.criticality",
      "AllergyIntolerance.verificationStatus",
    ],
  },
  {
    id: "patient-context-change",
    phase: "edit-context",
    outcome: "warn",
    resourceTypes: [
      "AllergyIntolerance",
      "Condition",
      "DiagnosticReport",
      "Encounter",
      "MedicationAdministration",
      "MedicationRequest",
      "MedicationStatement",
      "Observation",
      "Procedure",
    ],
    elementPaths: [
      "AllergyIntolerance.patient",
      "Condition.subject",
      "DiagnosticReport.subject",
      "Encounter.subject",
      "MedicationAdministration.subject",
      "MedicationRequest.subject",
      "MedicationStatement.subject",
      "Observation.subject",
      "Procedure.subject",
    ],
  },
] as const satisfies readonly ClinicalSafetyGuardrail[];

const capitalize = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

const labelFromPath = (path: string, short?: string): string => {
  // Prefer `short` only when it looks like a name, not a value enumeration
  // ("male | female | other | unknown") or a sentence with punctuation.
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

const elements = (sd: StructureDefinition): ElementDefinition[] =>
  sd.snapshot?.element ?? sd.differential?.element ?? [];

/** Direct-child ElementDefinitions of `parentPath` (not grand-children). */
export function directChildren(
  sd: StructureDefinition,
  parentPath: string,
): ElementDefinition[] {
  const prefix = `${parentPath}.`;
  return elements(sd).filter((e) => {
    const p = e.path ?? "";
    if (!p.startsWith(prefix)) return false;
    const remainder = p.slice(prefix.length);
    return remainder.length > 0 && !remainder.includes(".");
  });
}

export function findElement(
  sd: StructureDefinition,
  path: string,
): ElementDefinition | undefined {
  return elements(sd).find((e) => e.path === path);
}

/**
 * Resolve a materialised choice variant (e.g. `Observation.valueQuantity`) back
 * to its `[x]` element and the matching type code. Returns undefined when no
 * sibling `[x]` element matches the leaf segment.
 *
 * Handles the case where consumers (StructureDefinition column configs, etc.)
 * pass paths in the JSON-key form rather than the spec form.
 */
export function findChoiceVariant(
  sd: StructureDefinition,
  path: string,
): { element: ElementDefinition; typeCode: string } | undefined {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1) return undefined;
  const parentPath = path.slice(0, lastDot);
  const leaf = path.slice(lastDot + 1);
  // Walk every uppercase boundary in the leaf so that multi-word base names
  // (`onsetAge`, `medicationCodeableConcept`) and multi-word type codes
  // (`SampledData`) both resolve.
  for (let i = 1; i < leaf.length; i++) {
    if (leaf[i] !== leaf[i]!.toUpperCase()) continue;
    const base = leaf.slice(0, i);
    const variantCap = leaf.slice(i);
    const choiceElement = findElement(sd, `${parentPath}.${base}[x]`);
    if (!choiceElement) continue;
    const matched = choiceElement.type?.find(
      (t) => t.code && capitalize(t.code) === variantCap,
    );
    if (matched?.code) {
      return { element: choiceElement, typeCode: matched.code };
    }
  }
  return undefined;
}

const isArrayCardinality = (el: ElementDefinition): boolean => {
  const max = el.max;
  if (!max) return false;
  if (max === "*") return true;
  const n = Number.parseInt(max, 10);
  return Number.isFinite(n) && n > 1;
};

/** Walk a resource against its StructureDefinition, yielding present top-level elements in SD order. */
export function walkResource(
  sd: StructureDefinition,
  resource: Resource,
): WalkedElement[] {
  return walkObject(sd, sd.type, resource as unknown as Record<string, unknown>);
}

/** Walk a nested object (e.g. a BackboneElement) at `parentPath` against the SD. */
export function walkObject(
  sd: StructureDefinition,
  parentPath: string,
  obj: Record<string, unknown>,
): WalkedElement[] {
  const out: WalkedElement[] = [];
  for (const el of directChildren(sd, parentPath)) {
    const path = el.path!;
    const relative = path.slice(parentPath.length + 1);

    if (relative.endsWith("[x]")) {
      const base = relative.slice(0, -3);
      const types = el.type ?? [];
      for (const t of types) {
        const variantKey = `${base}${capitalize(t.code!)}`;
        if (obj[variantKey] !== undefined && obj[variantKey] !== null) {
          out.push({
            path,
            key: variantKey,
            label: labelFromPath(path, el.short),
            element: el,
            typeCode: t.code,
            isArray: false,
            isChoice: true,
            value: obj[variantKey],
          });
          break;
        }
      }
      continue;
    }

    const value = obj[relative];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    out.push({
      path,
      key: relative,
      label: labelFromPath(path, el.short),
      element: el,
      typeCode: el.type?.[0]?.code,
      isArray: isArrayCardinality(el),
      isChoice: false,
      value,
    });
  }
  return out;
}

/** The set of FHIR R4 primitive type codes. */
export const PRIMITIVE_TYPES = new Set([
  "base64Binary",
  "boolean",
  "canonical",
  "code",
  "date",
  "dateTime",
  "decimal",
  "id",
  "instant",
  "integer",
  "markdown",
  "oid",
  "positiveInt",
  "string",
  "time",
  "unsignedInt",
  "uri",
  "url",
  "uuid",
  "xhtml",
]);

export function isPrimitive(typeCode: string | undefined): boolean {
  return typeCode !== undefined && PRIMITIVE_TYPES.has(typeCode);
}
