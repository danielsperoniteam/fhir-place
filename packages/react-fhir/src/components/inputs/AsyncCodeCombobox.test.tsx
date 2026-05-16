import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ValueSet } from "fhir/r4";
import { describe, expect, it } from "vitest";
import type { FhirClient } from "../../client/types.js";
import { FhirClientProvider } from "../../hooks/FhirClientProvider.js";
import { AsyncCodeCombobox } from "./AsyncCodeCombobox.js";

const VALUE_SET = "http://snomed.info/sct?fhir_vs=isa/123037004";

/**
 * Minimal fake client. `useValueSetExpansion` only touches `request()`, so
 * stubbing it lets us exercise the success and failure branches without a
 * real fetch — and without tripping the Node-25 `AbortSignal` interop bug
 * that breaks `FetchFhirClient` under MSW locally.
 */
const fakeClient = (request: FhirClient["request"]): FhirClient =>
  ({ baseUrl: "https://tx.example.test/r4", fhirVersion: "4.0", request }) as FhirClient;

const renderWith = (client: FhirClient) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FhirClientProvider client={client} terminologyClient={client}>
        <AsyncCodeCombobox
          valueSet={VALUE_SET}
          value={undefined}
          onChange={() => {}}
          fieldName="code"
          debounceMs={0}
        />
      </FhirClientProvider>
    </QueryClientProvider>,
  );
};

describe("AsyncCodeCombobox", () => {
  it("surfaces a terminology-unavailable notice when $expand fails", async () => {
    const client = fakeClient(() => Promise.reject(new TypeError("Failed to fetch")));
    const user = userEvent.setup();
    renderWith(client);
    await user.type(screen.getByRole("combobox", { name: "code" }), "body");
    // The persistent inline alert below the input must appear so the user
    // knows the dropdown is empty by configuration, not because data is empty.
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /terminology server unreachable/i,
      ),
    );
    expect(screen.queryByText("No matches")).not.toBeInTheDocument();
  });

  it("shows matches and no error notice when $expand succeeds", async () => {
    const expansion: ValueSet = {
      resourceType: "ValueSet",
      status: "active",
      url: VALUE_SET,
      expansion: {
        identifier: "x",
        timestamp: "2024-01-01T00:00:00Z",
        contains: [
          { system: "http://snomed.info/sct", code: "1", display: "body part" },
        ],
      },
    };
    const client = fakeClient(() => Promise.resolve(expansion as unknown));
    const user = userEvent.setup();
    renderWith(client);
    await user.type(screen.getByRole("combobox", { name: "code" }), "body");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /body part/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
