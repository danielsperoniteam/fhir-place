import { createContext, useContext, type ReactNode } from "react";
import type { FhirClient } from "../client/types.js";

const FhirClientContext = createContext<FhirClient | null>(null);
const TerminologyClientContext = createContext<FhirClient | null>(null);

export interface FhirClientProviderProps {
  client: FhirClient;
  /**
   * Optional separate client for ValueSet/CodeSystem operations. When omitted,
   * terminology hooks fall through to the data `client`. Pass a distinct
   * client (e.g. https://tx.fhir.org/r4) when the data server cannot expand
   * large terminologies like SNOMED, LOINC, or BCP-47.
   */
  terminologyClient?: FhirClient;
  children: ReactNode;
}

export function FhirClientProvider({
  client,
  terminologyClient,
  children,
}: FhirClientProviderProps) {
  return (
    <FhirClientContext.Provider value={client}>
      <TerminologyClientContext.Provider value={terminologyClient ?? null}>
        {children}
      </TerminologyClientContext.Provider>
    </FhirClientContext.Provider>
  );
}

export function useFhirClient(): FhirClient {
  const client = useContext(FhirClientContext);
  if (!client) {
    throw new Error(
      "useFhirClient must be called inside <FhirClientProvider>. Wrap your app or tests with it.",
    );
  }
  return client;
}

/**
 * Returns the terminology client when one was provided to
 * `FhirClientProvider`, otherwise falls through to the data client. Use this
 * for `ValueSet/$expand` and other terminology operations so they can target
 * a SNOMED-capable server independent of the data server.
 */
export function useTerminologyClient(): FhirClient {
  const tx = useContext(TerminologyClientContext);
  const data = useFhirClient();
  return tx ?? data;
}

/**
 * Like {@link useTerminologyClient} but returns `null` when called outside a
 * `FhirClientProvider`. Used by hooks whose query is conditionally disabled
 * (e.g. `useValueSet(undefined)`) so components that render without a
 * provider can still call the hook without throwing.
 */
export function useOptionalTerminologyClient(): FhirClient | null {
  const tx = useContext(TerminologyClientContext);
  const data = useContext(FhirClientContext);
  return tx ?? data;
}
