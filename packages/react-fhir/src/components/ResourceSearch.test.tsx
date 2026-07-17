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

  it("excludes _count (redundant with page-size control)", () => {
    const capWithCount: CapabilityStatement = {
      ...cap,
      rest: [
        {
          mode: "server",
          resource: [
            {
              type: "Patient",
              searchParam: [
                { name: "name", type: "string" },
                { name: "_count", type: "number" },
              ],
            },
          ],
        },
      ],
    };
    const names = findSearchParamsForResource(capWithCount, "Patient").map((p) => p.name);
    expect(names).not.toContain("_count");
    expect(names).toContain("name");
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
    // - organization is a reference: a Type/id text input + a name-search
    //   picker (searchbox)
    // → 7 textboxes + 1 searchbox
    expect(screen.getAllByRole("textbox").length).toBe(7);
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
    // After expand: 7 textboxes (birthdate is a date input; organization
    // contributes one Type/id textbox plus a separate name-search box).
    expect(screen.getAllByRole("textbox").length).toBe(7);
    expect(screen.getByRole("searchbox", { name: /search organization/i })).toBeInTheDocument();
  });

  it("modifier menus narrow to the param's type and rewrite the submitted key (#254)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    wrap(
      <ResourceSearch resourceType="Patient" capabilityStatement={cap} onSubmit={onSubmit} initialVisible={8} />,
    );

    // string param offers :exact but not :not…
    const nameModifier = screen.getByLabelText("name modifier") as HTMLSelectElement;
    const nameOptions = Array.from(nameModifier.options).map((o) => o.value);
    expect(nameOptions).toContain("exact");
    expect(nameOptions).not.toContain("not");
    // …token param offers :not but not :exact.
    const genderModifier = screen.getByLabelText("gender modifier") as HTMLSelectElement;
    const genderOptions = Array.from(genderModifier.options).map((o) => o.value);
    expect(genderOptions).toContain("not");
    expect(genderOptions).not.toContain("exact");

    await user.type(screen.getByLabelText("name"), "Ada");
    await user.selectOptions(nameModifier, "exact");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(onSubmit).toHaveBeenLastCalledWith({ "name:exact": "Ada" });
  });

  it(":missing swaps the input for a boolean select and submits name:missing", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    wrap(
      <ResourceSearch resourceType="Patient" capabilityStatement={cap} onSubmit={onSubmit} initialVisible={8} />,
    );
    await user.selectOptions(screen.getByLabelText("birthdate modifier"), "missing");
    // The date picker is replaced by a true/false select.
    await user.selectOptions(screen.getByLabelText("birthdate"), "true");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(onSubmit).toHaveBeenLastCalledWith({ "birthdate:missing": "true" });
  });

  it("hydrates modifier'd initialParams back into the form", () => {
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        initialParams={{ "name:exact": "Ada" }}
        initialVisible={8}
      />,
    );
    expect((screen.getByLabelText("name") as HTMLInputElement).value).toBe("Ada");
    expect((screen.getByLabelText("name modifier") as HTMLSelectElement).value).toBe("exact");
  });

  it("preserves concurrent bare + modifier'd variants of the same param (#732 review)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        onSubmit={onSubmit}
        initialParams={{ name: "Smith", "name:exact": "John" }}
        initialVisible={8}
      />,
    );
    // The form edits the first variant; the second is preserved verbatim.
    expect((screen.getByLabelText("name") as HTMLInputElement).value).toBe("Smith");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      name: "Smith",
      "name:exact": "John",
    });
  });

  it(":in on a token swaps to a free-text canonical-URL input and wipes stale codes", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        onSubmit={onSubmit}
        initialParams={{ gender: "female" }}
        initialVisible={8}
      />,
    );
    await user.selectOptions(screen.getByLabelText("gender modifier"), "in");
    const field = screen.getByLabelText("gender") as HTMLInputElement;
    // Free text with the ValueSet grammar hint, stale code wiped.
    expect(field.tagName).toBe("INPUT");
    expect(field.placeholder).toBe("ValueSet canonical URL");
    expect(field.value).toBe("");
    await user.type(field, "http://example.org/ValueSet/genders");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      "gender:in": "http://example.org/ValueSet/genders",
    });
  });

  it(":identifier on a reference hides the lookup picker and hints token syntax", async () => {
    const user = userEvent.setup();
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        initialVisible={8}
      />,
    );
    // `organization` has a lookup picker by default…
    expect(screen.queryAllByText(/or look up/i).length).toBeGreaterThan(0);
    await user.selectOptions(
      screen.getByLabelText("organization modifier"),
      "identifier",
    );
    // …which disappears under :identifier, and the input hints system|value.
    expect(screen.queryByText(/or look up/i)).toBeNull();
    expect(
      (screen.getByLabelText("organization") as HTMLInputElement).placeholder,
    ).toBe("system|value");
  });

  it("merges a form edit that collides with a passthrough variant as AND values", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        onSubmit={onSubmit}
        initialParams={{ name: "Smith", "name:exact": "John" }}
        initialVisible={8}
      />,
    );
    // Switching the editable variant onto the preserved variant's key must
    // not overwrite it — both criteria survive as repeated values.
    await user.selectOptions(screen.getByLabelText("name modifier"), "exact");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      "name:exact": ["John", "Smith"],
    });
  });

  it("number fields offer numeric prefixes only (no sa/eb)", () => {
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={{
          ...cap,
          rest: [
            {
              mode: "server",
              resource: [
                {
                  type: "Patient",
                  searchParam: [{ name: "length", type: "number" }],
                },
              ],
            },
          ],
        }}
        initialVisible={4}
      />,
    );
    const prefixes = Array.from(
      (screen.getByLabelText("length prefix") as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(prefixes).toEqual(["", "eq", "ne", "lt", "le", "gt", "ge", "ap"]);
  });

  it("does not offer :of-type on non-Identifier token params", () => {
    // With no SD resolvable in the test harness the element type is unknown,
    // so `:of-type` (Identifier-only per FHIR R4) is withheld conservatively.
    wrap(
      <ResourceSearch resourceType="Patient" capabilityStatement={cap} initialVisible={8} />,
    );
    const genderOptions = Array.from(
      (screen.getByLabelText("gender modifier") as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(genderOptions).toContain("not");
    expect(genderOptions).not.toContain("of-type");
  });

  it("wipes a stale value when the modifier grammar changes", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        onSubmit={onSubmit}
        initialParams={{ gender: "female" }}
        initialVisible={8}
      />,
    );
    // female (default code grammar) → :missing (boolean grammar) must not
    // carry the old value along.
    await user.selectOptions(screen.getByLabelText("gender modifier"), "missing");
    expect((screen.getByLabelText("gender") as HTMLSelectElement).value).toBe("");
    // Leaving :missing back to the default grammar also clears.
    await user.selectOptions(screen.getByLabelText("gender"), "true");
    await user.selectOptions(screen.getByLabelText("gender modifier"), "");
    expect((screen.getByLabelText("gender") as HTMLInputElement).value).toBe("");
  });

  it("keeps the value when switching between :in and :not-in (same grammar)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    wrap(
      <ResourceSearch
        resourceType="Patient"
        capabilityStatement={cap}
        onSubmit={onSubmit}
        initialVisible={8}
      />,
    );
    await user.selectOptions(screen.getByLabelText("gender modifier"), "in");
    await user.type(
      screen.getByLabelText("gender"),
      "http://example.org/ValueSet/g",
    );
    // Switching to the sibling modifier must not wipe the URL.
    await user.selectOptions(screen.getByLabelText("gender modifier"), "not-in");
    expect((screen.getByLabelText("gender") as HTMLInputElement).value).toBe(
      "http://example.org/ValueSet/g",
    );
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      "gender:not-in": "http://example.org/ValueSet/g",
    });
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

describe("ResourceSearch — reference filter", () => {
  const stubPatientSearch = () => {
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
  };

  it("renders both the raw Type/id text input and the name-search picker", () => {
    wrap(
      <ResourceSearch
        resourceType="AllergyIntolerance"
        capabilityStatement={allergyCap}
      />,
    );
    // Text input (always visible) — `Type/id` placeholder identifies it.
    expect(screen.getByRole("textbox", { name: /patient/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/type\/id/i)).toBeInTheDocument();
    // Search-by-name picker.
    expect(screen.getByRole("searchbox", { name: /search patient/i })).toBeInTheDocument();
  });

  it("submits the value when the user types Type/id directly", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    wrap(
      <ResourceSearch
        resourceType="AllergyIntolerance"
        capabilityStatement={allergyCap}
        onSubmit={onSubmit}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: /patient/i }),
      "Patient/manual-id",
    );
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(onSubmit).toHaveBeenCalledWith({ patient: "Patient/manual-id" });
  });

  it("populates the text input from a name-search pick and submits it", async () => {
    stubPatientSearch();

    const onSubmit = vi.fn();
    const user = userEvent.setup();
    wrap(
      <ResourceSearch
        resourceType="AllergyIntolerance"
        capabilityStatement={allergyCap}
        onSubmit={onSubmit}
      />,
    );

    const text = screen.getByRole("textbox", { name: /patient/i });
    expect(text).toHaveValue("");

    await user.type(
      screen.getByRole("searchbox", { name: /search patient/i }),
      "Lovelace",
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Ada Lovelace/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("option", { name: /Ada Lovelace/ }));

    // The pick fills the always-visible Type/id text input.
    expect(text).toHaveValue("Patient/p1");

    await user.click(screen.getByRole("button", { name: /^search$/i }));
    expect(onSubmit).toHaveBeenCalledWith({ patient: "Patient/p1" });
  });

  it("lets the user overwrite the picked id by editing the text input afterwards", async () => {
    stubPatientSearch();

    const onSubmit = vi.fn();
    const user = userEvent.setup();
    wrap(
      <ResourceSearch
        resourceType="AllergyIntolerance"
        capabilityStatement={allergyCap}
        onSubmit={onSubmit}
      />,
    );

    await user.type(
      screen.getByRole("searchbox", { name: /search patient/i }),
      "Lovelace",
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Ada Lovelace/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("option", { name: /Ada Lovelace/ }));

    const text = screen.getByRole("textbox", { name: /patient/i });
    await user.clear(text);
    await user.type(text, "Patient/different-id");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(onSubmit).toHaveBeenCalledWith({ patient: "Patient/different-id" });
  });
});
