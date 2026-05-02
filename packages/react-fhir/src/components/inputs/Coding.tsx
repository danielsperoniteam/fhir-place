import type { Coding } from "fhir/r4";
import { bindingFor } from "../../structure/binding.js";
import { CodingAutocompleteInput } from "./CodingAutocomplete.js";
import { CodingInputManual } from "./CodingManual.js";
import { type FhirTypeInput } from "./types.js";

export { CodingInputManual } from "./CodingManual.js";

/**
 * Coding entry point. When the surrounding ElementDefinition declares a
 * `binding.valueSet`, swaps in a typeahead-style autocomplete that drives
 * `$expand?filter=` against the FHIR server. Without a binding, falls back
 * to the manual three-field input — preserving the v1 behaviour for unbound
 * Coding elements (e.g. `Patient.maritalStatus.coding[]` on a server with
 * no terminology module).
 */
export const CodingInput: FhirTypeInput<Coding> = (props) => {
  const { valueSet } = bindingFor(props.context.element);
  if (valueSet) return <CodingAutocompleteInput {...props} />;
  return <CodingInputManual {...props} />;
};
