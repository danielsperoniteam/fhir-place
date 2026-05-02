import { AddressInput } from "./Address.js";
import { CodeableConceptInput } from "./CodeableConcept.js";
import { CodingInput } from "./Coding.js";
import { ContactPointInput } from "./ContactPoint.js";
import { DataAbsentReasonInput } from "./DataAbsentReason.js";
import { HumanNameInput } from "./HumanName.js";
import { IdentifierInput } from "./Identifier.js";
import { PeriodInput } from "./Period.js";
import {
  BooleanInput,
  CodeInput,
  DateInput,
  DateTimeInput,
  MarkdownInput,
  NumberInput,
  TextInput,
  TimeInput,
  UriInput,
} from "./primitives.js";
import { QuantityInput } from "./Quantity.js";
import { ReferenceInput } from "./Reference.js";
import { type FhirTypeInput, type PathInputs, type TypeInputs } from "./types.js";

export type {
  FhirInputProps,
  FhirTypeInput,
  InputContext,
  PathInputs,
  TypeInputs,
} from "./types.js";

export { DataAbsentReasonInput } from "./DataAbsentReason.js";
export { JsonFallbackInput } from "./JsonFallback.js";

export const defaultTypeInputs: TypeInputs = {
  // primitives
  string: TextInput as FhirTypeInput,
  markdown: MarkdownInput as FhirTypeInput,
  boolean: BooleanInput as FhirTypeInput,
  integer: NumberInput as FhirTypeInput,
  positiveInt: NumberInput as FhirTypeInput,
  unsignedInt: NumberInput as FhirTypeInput,
  decimal: NumberInput as FhirTypeInput,
  date: DateInput as FhirTypeInput,
  dateTime: DateTimeInput as FhirTypeInput,
  instant: DateTimeInput as FhirTypeInput,
  time: TimeInput as FhirTypeInput,
  code: CodeInput as FhirTypeInput,
  id: TextInput as FhirTypeInput,
  oid: TextInput as FhirTypeInput,
  uuid: TextInput as FhirTypeInput,
  uri: UriInput as FhirTypeInput,
  url: UriInput as FhirTypeInput,
  canonical: UriInput as FhirTypeInput,
  base64Binary: TextInput as FhirTypeInput,

  // complex
  HumanName: HumanNameInput as FhirTypeInput,
  Address: AddressInput as FhirTypeInput,
  ContactPoint: ContactPointInput as FhirTypeInput,
  Identifier: IdentifierInput as FhirTypeInput,
  Reference: ReferenceInput as FhirTypeInput,
  Period: PeriodInput as FhirTypeInput,
  Quantity: QuantityInput as FhirTypeInput,
  SimpleQuantity: QuantityInput as FhirTypeInput,
  Coding: CodingInput as FhirTypeInput,
  CodeableConcept: CodeableConceptInput as FhirTypeInput,
};

/** Path-based input overrides applied by ResourceEditor on top of `defaultTypeInputs`. */
export const defaultPathInputs: PathInputs = {
  "Observation.dataAbsentReason": DataAbsentReasonInput as FhirTypeInput,
};
