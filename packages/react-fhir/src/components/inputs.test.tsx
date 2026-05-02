import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ElementDefinition } from "fhir/r4";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { FhirClientProvider } from "../hooks/FhirClientProvider.js";
import { defaultTypeInputs } from "./inputs/index.js";

const BASE = "https://fhir.example.test/fhir";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const mkWrapper = () => {
  const client = new FetchFhirClient({ baseUrl: BASE });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <FhirClientProvider client={client}>{children}</FhirClientProvider>
    </QueryClientProvider>
  );
};

const CodeInput = defaultTypeInputs.code!;

describe("CodeInput (ValueSet-driven)", () => {
  const genderElement: ElementDefinition = {
    path: "Patient.gender",
    type: [{ code: "code" }],
    short: "male | female | other | unknown",
    binding: {
      strength: "required",
      valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender",
    },
  };

  const mockValueSet = (codes: Array<{ code: string; display?: string }>) => {
    server.use(
      http.get(`${BASE}/ValueSet/$expand`, () =>
        HttpResponse.json({
          resourceType: "ValueSet",
          status: "active",
          url: "http://hl7.org/fhir/ValueSet/administrative-gender",
          expansion: {
            identifier: "x",
            timestamp: "2024-01-01T00:00:00Z",
            contains: codes.map((c) => ({
              system: "http://hl7.org/fhir/administrative-gender",
              ...c,
            })),
          },
        }),
      ),
    );
  };

  it("resolves binding.valueSet into a <select> of enumerated codes with display labels", async () => {
    mockValueSet([
      { code: "male", display: "Male" },
      { code: "female", display: "Female" },
      { code: "other", display: "Other" },
      { code: "unknown", display: "Unknown" },
    ]);
    const onChange = vi.fn();
    render(
      <CodeInput
        value={undefined}
        onChange={onChange}
        context={{ path: "Patient.gender", typeCode: "code", element: genderElement }}
      />,
      { wrapper: mkWrapper() },
    );

    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Female \(female\)/ })).toBeInTheDocument(),
    );
    const select = screen.getByRole("combobox", { name: "gender" });
    await userEvent.selectOptions(select, "female");
    expect(onChange).toHaveBeenCalledWith("female");
  });

  it("required binding → no 'Other…' escape hatch", async () => {
    mockValueSet([{ code: "male" }, { code: "female" }]);
    render(
      <CodeInput
        value={undefined}
        onChange={() => {}}
        context={{ path: "Patient.gender", typeCode: "code", element: genderElement }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /female/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("option", { name: /other…/i })).not.toBeInTheDocument();
  });

  it("extensible binding → shows an 'Other…' option", async () => {
    mockValueSet([{ code: "yes" }, { code: "no" }]);
    const extensibleEl: ElementDefinition = {
      ...genderElement,
      binding: {
        strength: "extensible",
        valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender",
      },
    };
    render(
      <CodeInput
        value={undefined}
        onChange={() => {}}
        context={{ path: "Patient.gender", typeCode: "code", element: extensibleEl }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /other…/i })).toBeInTheDocument(),
    );
  });

  it("falls back to pipe-separated short when there is no binding", async () => {
    const noBinding: ElementDefinition = {
      path: "Fake.status",
      type: [{ code: "code" }],
      short: "draft | active | retired",
    };
    render(
      <CodeInput
        value={undefined}
        onChange={() => {}}
        context={{ path: "Fake.status", typeCode: "code", element: noBinding }}
      />,
      { wrapper: mkWrapper() },
    );
    expect(screen.getByRole("option", { name: "draft" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "active" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "retired" })).toBeInTheDocument();
  });

  it("falls back to a plain text input when there is neither binding nor short enumeration", () => {
    const bare: ElementDefinition = {
      path: "Fake.token",
      type: [{ code: "code" }],
    };
    render(
      <CodeInput
        value="xyz"
        onChange={() => {}}
        context={{ path: "Fake.token", typeCode: "code", element: bare }}
      />,
      { wrapper: mkWrapper() },
    );
    expect(screen.getByRole("textbox")).toHaveValue("xyz");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("preserves a current non-enumerated value by selecting 'Other…' and showing a free-text input (extensible)", async () => {
    mockValueSet([{ code: "draft" }, { code: "active" }]);
    const el: ElementDefinition = {
      ...genderElement,
      binding: {
        strength: "preferred",
        valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender",
      },
    };
    render(
      <CodeInput
        value="custom-code"
        onChange={() => {}}
        context={{ path: "Fake.status", typeCode: "code", element: el }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() => expect(screen.getByDisplayValue("custom-code")).toBeInTheDocument());
  });
});

const CodeableConceptInput = defaultTypeInputs.CodeableConcept!;
const CodingInput = defaultTypeInputs.Coding!;

describe("CodingInput (binding-aware)", () => {
  const bodySiteElement: ElementDefinition = {
    path: "Observation.bodySite",
    type: [{ code: "CodeableConcept" }],
    binding: {
      strength: "example",
      valueSet: "http://hl7.org/fhir/ValueSet/body-site",
    },
  };

  const mockExpand = (
    codes: Array<{ code: string; display?: string; system?: string }>,
    expectFilter?: (filter: string | null) => void,
  ) => {
    server.use(
      http.get(`${BASE}/ValueSet/$expand`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        expectFilter?.(params.get("filter"));
        return HttpResponse.json({
          resourceType: "ValueSet",
          status: "active",
          url: "http://hl7.org/fhir/ValueSet/body-site",
          expansion: {
            identifier: "x",
            timestamp: "2024-01-01T00:00:00Z",
            contains: codes.map((c) => ({
              system: c.system ?? "http://snomed.info/sct",
              code: c.code,
              ...(c.display ? { display: c.display } : {}),
            })),
          },
        });
      }),
    );
  };

  it("renders the autocomplete (not manual fields) when the element has a binding", () => {
    render(
      <CodingInput
        value={undefined}
        onChange={() => {}}
        context={{
          path: "Observation.bodySite",
          typeCode: "Coding",
          element: bodySiteElement,
        }}
      />,
      { wrapper: mkWrapper() },
    );
    expect(screen.getByRole("combobox", { name: "bodySite" })).toBeInTheDocument();
    // manual fields are not rendered up-front
    expect(screen.queryByLabelText("System")).not.toBeInTheDocument();
  });

  it("renders manual System/Code/Display fields when there is no binding", () => {
    const unboundEl: ElementDefinition = {
      path: "Patient.maritalStatus.coding",
      type: [{ code: "Coding" }],
    };
    render(
      <CodingInput
        value={undefined}
        onChange={() => {}}
        context={{
          path: "Patient.maritalStatus.coding",
          typeCode: "Coding",
          element: unboundEl,
        }}
      />,
      { wrapper: mkWrapper() },
    );
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("filters via $expand on typed query and writes back system/code/display on pick", async () => {
    let seenFilter: string | null = null;
    mockExpand(
      [{ code: "10200004", display: "Liver structure" }],
      (filter) => {
        if (filter) seenFilter = filter;
      },
    );
    const onChange = vi.fn();
    render(
      <CodingInput
        value={undefined}
        onChange={onChange}
        context={{
          path: "Observation.bodySite",
          typeCode: "Coding",
          element: bodySiteElement,
        }}
      />,
      { wrapper: mkWrapper() },
    );

    const input = screen.getByRole("combobox", { name: "bodySite" });
    await userEvent.type(input, "liver");

    await waitFor(() => expect(seenFilter).toBe("liver"));
    const option = await screen.findByRole("option", { name: /Liver structure/ });
    await userEvent.click(option);
    expect(onChange).toHaveBeenCalledWith({
      system: "http://snomed.info/sct",
      code: "10200004",
      display: "Liver structure",
    });
  });

  it("shows the selected coding with a clear button when a value is set", async () => {
    render(
      <CodingInput
        value={{
          system: "http://snomed.info/sct",
          code: "10200004",
          display: "Liver structure",
        }}
        onChange={() => {}}
        context={{
          path: "Observation.bodySite",
          typeCode: "Coding",
          element: bodySiteElement,
        }}
      />,
      { wrapper: mkWrapper() },
    );
    expect(screen.getByText("Liver structure")).toBeInTheDocument();
    expect(screen.getByText("10200004")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear bodySite/i })).toBeInTheDocument();
  });

  it("falls back to manual entry when both $expand and ValueSet search fail", async () => {
    server.use(
      http.get(`${BASE}/ValueSet/$expand`, () =>
        HttpResponse.json({ resourceType: "OperationOutcome" }, { status: 501 }),
      ),
      http.get(`${BASE}/ValueSet`, () =>
        HttpResponse.json({ resourceType: "OperationOutcome" }, { status: 500 }),
      ),
    );
    render(
      <CodingInput
        value={undefined}
        onChange={() => {}}
        context={{
          path: "Observation.bodySite",
          typeCode: "Coding",
          element: bodySiteElement,
        }}
      />,
      { wrapper: mkWrapper() },
    );
    const search = screen.getByRole("combobox", { name: "bodySite" });
    await userEvent.click(search);
    await userEvent.type(search, "x");
    const manualButton = await screen.findByRole("button", { name: /enter manually/i });
    await userEvent.click(manualButton);
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
  });
});

describe("CodeableConceptInput (binding-aware)", () => {
  const bodySiteEl: ElementDefinition = {
    path: "Observation.bodySite",
    type: [{ code: "CodeableConcept" }],
    binding: {
      strength: "example",
      valueSet: "http://hl7.org/fhir/ValueSet/body-site",
    },
  };

  it("forwards the binding so the inner Coding renders an autocomplete", () => {
    render(
      <CodeableConceptInput
        value={undefined}
        onChange={() => {}}
        context={{
          path: "Observation.bodySite",
          typeCode: "CodeableConcept",
          element: bodySiteEl,
        }}
      />,
      { wrapper: mkWrapper() },
    );
    // free-text "Text" is still present
    expect(screen.getByText("Text")).toBeInTheDocument();
    // …but the Coding sub-field is the autocomplete, not three text inputs
    expect(screen.getByRole("combobox", { name: "bodySite" })).toBeInTheDocument();
    expect(screen.queryByLabelText("System")).not.toBeInTheDocument();
  });
});
