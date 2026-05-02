import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CapabilityStatement } from "fhir/r4";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { FhirClientProvider } from "../hooks/FhirClientProvider.js";
import {
  findSearchParamsForResource,
  ResourceSearch,
} from "./ResourceSearch.js";

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
            { name: "name", type: "string", documentation: "A server defined search by name" },
            { name: "identifier", type: "token" },
            { name: "birthdate", type: "date" },
            { name: "gender", type: "token" },
            { name: "organization", type: "reference" },
            { name: "address-city", type: "string" },
            { name: "phone", type: "token" },
            { name: "_id", type: "token" },
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

describe("findSearchParamsForResource", () => {
  it("returns the params for the named resource", () => {
    const params = findSearchParamsForResource(cap, "Patient");
    expect(params.map((p) => p.name)).toContain("name");
    expect(params.map((p) => p.name)).toContain("identifier");
  });

  it("returns [] for unknown resource types", () => {
    expect(findSearchParamsForResource(cap, "Unknown")).toEqual([]);
  });

  it("orders priority params first, then alphabetical", () => {
    const params = findSearchParamsForResource(cap, "Patient", [
      "_id",
      "identifier",
      "name",
    ]);
    expect(params.slice(0, 3).map((p) => p.name)).toEqual([
      "_id",
      "identifier",
      "name",
    ]);
  });
});

describe("ResourceSearch", () => {
  it("renders search inputs for every advertised parameter", () => {
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        initialVisible={20}
      />,
    );
    // name, identifier, birthdate, gender, organization, address-city, phone, _id
    // - birthdate is a date input (no textbox role)
    // - organization is a reference, rendered via ReferencePicker → searchbox role
    // → 6 textboxes + 1 searchbox
    expect(screen.getAllByRole("textbox").length).toBe(6);
    expect(screen.getByRole("searchbox", { name: /search organization/i })).toBeInTheDocument();
    expect(screen.getByLabelText("birthdate")).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText(/code or system\|code/i).length).toBeGreaterThan(0);
  });

  it("emits onSubmit with only non-empty params", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        onSubmit={onSubmit}
      />,
    );
    const nameField = screen.getByRole("textbox", { name: /name/i });
    await user.type(nameField, "smith");
    await user.click(screen.getByRole("button", { name: /search/i }));
    expect(onSubmit).toHaveBeenCalledWith({ name: "smith" });
  });

  it("emits onChange on each keystroke", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        onChange={onChange}
      />,
    );
    const nameField = screen.getByRole("textbox", { name: /name/i });
    await user.type(nameField, "ab");
    // Last call should contain name: "ab"
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last).toEqual({ name: "ab" });
  });

  it("Clear empties the form and emits {} via onChange + onSubmit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        onChange={onChange}
        onSubmit={onSubmit}
        initialParams={{ name: "smith" }}
      />,
    );
    expect(screen.getByDisplayValue("smith")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({});
    // Clear must also re-submit so the parent's active query resets without a
    // second Search click.
    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it("starts with only `initialVisible` params and toggles Show more", async () => {
    const user = userEvent.setup();
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        initialVisible={3}
      />,
    );
    expect(screen.getAllByRole("textbox").length).toBe(3);
    await user.click(screen.getByRole("button", { name: /show.*more parameters/i }));
    // After expand: 6 textboxes (birthdate is a date input; organization is a
    // reference picker rendered as a searchbox).
    expect(screen.getAllByRole("textbox").length).toBe(6);
    expect(screen.getByRole("searchbox", { name: /search organization/i })).toBeInTheDocument();
  });

  it("shows a friendly message when no params are advertised", () => {
    wrap(<ResourceSearch resourceType="UnknownType" capabilityStatement={cap} />);
    expect(screen.getByText(/no searchable parameters/i)).toBeInTheDocument();
  });
});

const allergyCap: CapabilityStatement = {
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
          type: "AllergyIntolerance",
          searchParam: [
            { name: "patient", type: "reference", documentation: "Who the sensitivity is for" },
            { name: "code", type: "token" },
          ],
        },
      ],
    },
  ],
};

const BASE = "https://fhir.example.test/fhir";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("ResourceSearch — reference name search", () => {
  it("searches Patients by name and submits the picked Patient/id", async () => {
    server.use(
      http.get(`${BASE}/Patient`, ({ request }) => {
        const q = (new URL(request.url).searchParams.get("name") ?? "").toLowerCase();
        const all = [
          { resourceType: "Patient", id: "p1", name: [{ given: ["Ada"], family: "Lovelace" }] },
          { resourceType: "Patient", id: "p2", name: [{ given: ["Alan"], family: "Turing" }] },
        ];
        const matches = all.filter((p) =>
          (p.name[0]?.family ?? "").toLowerCase().includes(q),
        );
        return HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: matches.map((r) => ({ resource: r })),
        });
      }),
    );

    const onSubmit = vi.fn();
    const user = userEvent.setup();
    wrap(
      <ResourceSearch
        resourceType="AllergyIntolerance"
        capabilityStatement={allergyCap}
        onSubmit={onSubmit}
      />,
    );

    const search = screen.getByRole("searchbox", { name: /search patient/i });
    await user.type(search, "Lovelace");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Ada Lovelace/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("option", { name: /Ada Lovelace/ }));
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(onSubmit).toHaveBeenCalledWith({ patient: "Patient/p1" });
  });
});
