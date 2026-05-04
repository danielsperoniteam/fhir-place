import type { ElementDefinition, Reference } from "fhir/r4";
import { ReferencePicker } from "../ReferencePicker.js";
import { type FhirTypeInput } from "./types.js";

/**
 * Common reference-able types shown when the ElementDefinition carries no
 * `targetProfile` (e.g. bundled core SDs that omit it, or servers that return
 * only the differential without a snapshot).
 */
export const DEFAULT_REFERENCE_TYPES = [
  "Patient",
  "Practitioner",
  "Organization",
  "Encounter",
  "Location",
  "Device",
] as const;

/**
 * Prefers the search-and-pick `<ReferencePicker>` for all Reference elements.
 * When the ElementDefinition advertises `targetProfile`s those are used as the
 * allowed target types; when none are present the picker falls back to
 * `DEFAULT_REFERENCE_TYPES` so the user still gets the search UX rather than
 * raw `Type/id` text inputs.
 */
export const ReferenceInput: FhirTypeInput<Reference> = ({
  value,
  onChange,
  context,
}) => {
  const targets = targetTypesFromElement(context.element);
  const effectiveTargets = targets.length > 0 ? targets : [...DEFAULT_REFERENCE_TYPES];
  return <ReferencePicker targets={effectiveTargets} value={value} onChange={onChange} />;
};

const targetTypesFromElement = (element: ElementDefinition): string[] => {
  const refType = element.type?.find((t) => t.code === "Reference");
  const profiles = refType?.targetProfile ?? [];
  return profiles
    .map((p) => p.split("/").pop() ?? "")
    .filter(Boolean)
    .filter((t) => t !== "Resource"); // Reference(Any) → treat as empty, use defaults
};
