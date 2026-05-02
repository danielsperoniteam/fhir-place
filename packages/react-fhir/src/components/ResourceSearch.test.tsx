import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CapabilityStatement } from "fhir/r4";
import { describe, expect, it, vi } from "vitest";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { FhirClientProvider } from "../hooks/FhirClientProvider.js";
import {
  findSearchParamsForResource,
  ResourceSearch,
  tokenPlaceholder,
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
    // birthdate is a date input (role is not textbox), so textbox count is 7.
    const fields = screen.getAllByRole("textbox");
    expect(fields.length).toBe(7);
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
    // birthdate is a date input, not a textbox — so 7 textboxes after expand.
    expect(screen.getAllByRole("textbox").length).toBe(7);
  });

  it("shows a friendly message when no params are advertised", () => {
    wrap(<ResourceSearch resourceType="UnknownType" capabilityStatement={cap} />);
    expect(screen.getByText(/no searchable parameters/i)).toBeInTheDocument();
  });
});

describe("tokenPlaceholder", () => {
  const el = (typeCode: string) => ({ path: "X.y", type: [{ code: typeCode }] });

  it("falls back to `code or system|code` when the element is unknown", () => {
    expect(tokenPlaceholder(undefined)).toBe("code or system|code");
  });

  it("returns `code or system|code` for CodeableConcept / Coding / Identifier", () => {
    expect(tokenPlaceholder(el("CodeableConcept"))).toBe("code or system|code");
    expect(tokenPlaceholder(el("Coding"))).toBe("code or system|code");
    expect(tokenPlaceholder(el("Identifier"))).toBe("code or system|code");
  });

  it("drops the system half for primitive `code` elements", () => {
    expect(tokenPlaceholder(el("code"))).toBe("code");
  });

  it("hints true/false for `boolean` elements", () => {
    expect(tokenPlaceholder(el("boolean"))).toBe("true | false");
  });

  it("hints a URL for uri-family elements", () => {
    expect(tokenPlaceholder(el("uri"))).toBe("https://…");
    expect(tokenPlaceholder(el("url"))).toBe("https://…");
    expect(tokenPlaceholder(el("canonical"))).toBe("https://…");
  });
});
