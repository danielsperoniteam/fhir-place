import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CapabilityStatement } from "fhir/r4";
import { describe, expect, it, vi } from "vitest";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { FhirClientProvider } from "../hooks/FhirClientProvider.js";
import { ResourceSearch } from "./ResourceSearch.js";

const cap: CapabilityStatement = {
  resourceType: "CapabilityStatement",
  status: "active",
  date: "2024-01-01",
  kind: "instance",
  fhirVersion: "4.0.1",
  format: ["json"],
  rest: [
    {
      mode: "server",
      resource: [
        {
          type: "Patient",
          searchParam: [
            { name: "birthdate", type: "date", documentation: "Date of birth" },
            { name: "name", type: "string" },
          ],
        },
      ],
    },
  ],
};

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = new FetchFhirClient({ baseUrl: "https://fhir.example.test/fhir" });
  return render(
    <QueryClientProvider client={qc}>
      <FhirClientProvider client={client}>{ui}</FhirClientProvider>
    </QueryClientProvider>,
  );
};

describe("ResourceSearch — date search fields", () => {
  it("renders a native date picker + prefix selector for date params", () => {
    wrap(<ResourceSearch resourceType="Patient" capabilityStatement={cap} />);
    const dateInput = screen.getByLabelText("birthdate") as HTMLInputElement;
    // HTML5 date inputs register as role=textbox in jsdom; assert `type=date` explicitly.
    expect(dateInput.getAttribute("type")).toBe("date");
    // Prefix selector with every FHIR prefix option.
    const prefix = screen.getByRole("combobox", { name: "birthdate prefix" });
    const options = within(prefix).getAllByRole("option");
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(
      // sa/eb joined in #254 PR B (period-param prefixes).
      ["", "eq", "ne", "lt", "le", "gt", "ge", "ap", "sa", "eb"],
    );
  });

  it("emits plain date when no prefix is chosen", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        onSubmit={onSubmit}
      />,
    );
    const dateInput = screen.getByLabelText("birthdate") as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2024-01-15" } });
    await user.click(screen.getByRole("button", { name: /search/i }));
    expect(onSubmit).toHaveBeenCalledWith({ birthdate: "2024-01-15" });
  });

  it("prefixes the date when a prefix is selected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        onSubmit={onSubmit}
      />,
    );
    const dateInput = screen.getByLabelText("birthdate") as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2024-01-15" } });
    await user.selectOptions(screen.getByRole("combobox", { name: "birthdate prefix" }), "ge");
    await user.click(screen.getByRole("button", { name: /search/i }));
    expect(onSubmit).toHaveBeenCalledWith({ birthdate: "ge2024-01-15" });
  });

  it("rehydrates the prefix + date from an initial value like 'lt2020-05-01'", () => {
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        initialParams={{ birthdate: "lt2020-05-01" }}
      />,
    );
    const dateInput = screen.getByLabelText("birthdate") as HTMLInputElement;
    const prefix = screen.getByRole("combobox", { name: "birthdate prefix" }) as HTMLSelectElement;
    expect(dateInput.value).toBe("2020-05-01");
    expect(prefix.value).toBe("lt");
  });
});
