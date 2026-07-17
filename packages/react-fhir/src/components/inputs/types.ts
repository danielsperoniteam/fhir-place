import type { ElementDefinition } from "fhir/r4";
import type { ReactNode } from "react";

/** Element-level context every type-specific input receives. */
export interface InputContext {
  path: string;
  typeCode: string | undefined;
  element: ElementDefinition;
}

export interface FhirInputProps<T = unknown> {
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  context: InputContext;
  error?: string;
}

export type FhirTypeInput<T = unknown> = (props: FhirInputProps<T>) => ReactNode;
export type TypeInputs = Record<string, FhirTypeInput>;

/** Per-path overrides keyed by full ElementDefinition.path (e.g. "Observation.dataAbsentReason"). */
export type PathInputs = Record<string, FhirTypeInput>;

/** Shared form-field classes so every datatype renders consistently. */
export const baseField =
  "w-full rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm focus:border-blue-500 focus:outline-none";
export const subLabel = "mb-1 block text-xs font-medium text-[var(--text-muted)]";
export const subRow = "grid grid-cols-1 gap-2 sm:grid-cols-2";
