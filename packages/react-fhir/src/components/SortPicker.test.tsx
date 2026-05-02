import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CapabilityStatement } from "fhir/r4";
import { describe, expect, it, vi } from "vitest";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { FhirClientProvider } from "../hooks/FhirClientProvider.js";
import { SortPicker } from "./SortPicker.js";

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
            { name: "name", type: "string" },
            { name: "family", type: "string" },
            { name: "birthdate", type: "date" },
            { name: "gender", type: "token" },
            { name: "address-city", type: "string" },
            { name: "context-quantity", type: "composite" },
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

describe("SortPicker", () => {
  it("lists every advertised search param except composite/special types", async () => {
    const user = userEvent.setup();
    wrap(
      <SortPicker
        resourceType="Patient"
        capabilityStatement={cap}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /sort/i }));
    // Sortable params present.
    expect(screen.getByRole("button", { name: /^name/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^family/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^birthdate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^gender/i })).toBeInTheDocument();
    // Composite type is filtered out.
    expect(screen.queryByRole("button", { name: /context-quantity/i })).toBeNull();
  });

  it("emits the field name when picking a field (defaults to ascending)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(
      <SortPicker
        resourceType="Patient"
        capabilityStatement={cap}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /sort/i }));
    await user.click(screen.getByRole("button", { name: /^family/i }));
    expect(onChange).toHaveBeenLastCalledWith("family");
  });

  it("flipping to descending prefixes the active field with `-`", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(
      <SortPicker
        resourceType="Patient"
        capabilityStatement={cap}
        value="family"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /sort/i }));
    await user.click(screen.getByRole("button", { name: /descending/i }));
    expect(onChange).toHaveBeenLastCalledWith("-family");
  });

  it("re-clicking the active field clears the sort", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(
      <SortPicker
        resourceType="Patient"
        capabilityStatement={cap}
        value="-family"
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /sort/i }));
    await user.click(screen.getByRole("button", { name: /^family/i }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("renders nothing when the resource type has no searchable params", () => {
    wrap(
      <SortPicker
        resourceType="Unknown"
        capabilityStatement={cap}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /sort/i })).toBeNull();
  });

  it("respects priorityParams when ordering fields", async () => {
    const user = userEvent.setup();
    wrap(
      <SortPicker
        resourceType="Patient"
        capabilityStatement={cap}
        priorityParams={["birthdate", "family"]}
        onChange={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /sort/i }));
    const fieldButtons = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") !== null && !/ascending|descending/i.test(b.textContent ?? ""));
    expect(fieldButtons.slice(0, 2).map((b) => b.textContent)).toEqual([
      expect.stringMatching(/^Birthdate/),
      expect.stringMatching(/^Family/),
    ]);
  });
});
