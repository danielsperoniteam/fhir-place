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

  it("extensible binding → no 'Other…' escape hatch (extensible is closed)", async () => {
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
      expect(screen.getByRole("option", { name: /yes/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("option", { name: /other…/i })).not.toBeInTheDocument();
  });

  it("preferred binding → shows an 'Other…' option", async () => {
    mockValueSet([{ code: "yes" }, { code: "no" }]);
    const preferredEl: ElementDefinition = {
      ...genderElement,
      binding: {
        strength: "preferred",
        valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender",
      },
    };
    render(
      <CodeInput
        value={undefined}
        onChange={() => {}}
        context={{ path: "Patient.gender", typeCode: "code", element: preferredEl }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /other…/i })).toBeInTheDocument(),
    );
  });

  it("example binding → shows an 'Other…' option", async () => {
    mockValueSet([{ code: "yes" }, { code: "no" }]);
    const exampleEl: ElementDefinition = {
      ...genderElement,
      binding: {
        strength: "example",
        valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender",
      },
    };
    render(
      <CodeInput
        value={undefined}
        onChange={() => {}}
        context={{ path: "Patient.gender", typeCode: "code", element: exampleEl }}
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

const CodingInput = defaultTypeInputs.Coding!;
const CodeableConceptInput = defaultTypeInputs.CodeableConcept!;

describe("CodingInput (ValueSet-driven)", () => {
  const maritalStatusVsUrl =
    "http://hl7.org/fhir/ValueSet/marital-status";
  const maritalSystem = "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus";

  const maritalElement: ElementDefinition = {
    path: "Patient.maritalStatus.coding",
    type: [{ code: "Coding" }],
    binding: { strength: "extensible", valueSet: maritalStatusVsUrl },
  };

  const mockMaritalVs = (
    codes: Array<{ code: string; display?: string; system?: string }>,
  ) => {
    server.use(
      http.get(`${BASE}/ValueSet/$expand`, () =>
        HttpResponse.json({
          resourceType: "ValueSet",
          status: "active",
          url: maritalStatusVsUrl,
          expansion: {
            identifier: "x",
            timestamp: "2024-01-01T00:00:00Z",
            contains: codes.map((c) => ({
              system: c.system ?? maritalSystem,
              code: c.code,
              display: c.display,
            })),
          },
        }),
      ),
    );
  };

  it("renders a <select> of bound concepts and writes a full Coding on pick", async () => {
    mockMaritalVs([
      { code: "M", display: "Married" },
      { code: "S", display: "Never Married" },
    ]);
    const onChange = vi.fn();
    render(
      <CodingInput
        value={undefined}
        onChange={onChange}
        context={{
          path: "Patient.maritalStatus.coding",
          typeCode: "Coding",
          element: maritalElement,
        }}
      />,
      { wrapper: mkWrapper() },
    );

    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Married \(M\)/ })).toBeInTheDocument(),
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "coding" }),
      `${maritalSystem}|M`,
    );
    expect(onChange).toHaveBeenCalledWith({
      system: maritalSystem,
      code: "M",
      display: "Married",
    });
  });

  it("required binding hides the 'Other…' escape hatch", async () => {
    mockMaritalVs([{ code: "M" }, { code: "S" }]);
    render(
      <CodingInput
        value={undefined}
        onChange={() => {}}
        context={{
          path: "Patient.maritalStatus.coding",
          typeCode: "Coding",
          element: { ...maritalElement, binding: { strength: "required", valueSet: maritalStatusVsUrl } },
        }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /M/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("option", { name: /other…/i })).not.toBeInTheDocument();
  });

  it("extensible binding hides 'Other…' — a non-enumerated value is not editable free-form", async () => {
    mockMaritalVs([{ code: "M" }, { code: "S" }]);
    render(
      <CodingInput
        value={{ system: "urn:custom", code: "weird", display: "Weird" }}
        onChange={() => {}}
        context={{
          path: "Patient.maritalStatus.coding",
          typeCode: "Coding",
          element: maritalElement,
        }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /M/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("option", { name: /other…/i })).not.toBeInTheDocument();
  });

  it("preferred binding preserves a non-enumerated value via 'Other…' and exposes the free-form editor", async () => {
    mockMaritalVs([{ code: "M" }, { code: "S" }]);
    const preferredElement: ElementDefinition = {
      ...maritalElement,
      binding: { strength: "preferred", valueSet: maritalStatusVsUrl },
    };
    render(
      <CodingInput
        value={{ system: "urn:custom", code: "weird", display: "Weird" }}
        onChange={() => {}}
        context={{
          path: "Patient.maritalStatus.coding",
          typeCode: "Coding",
          element: preferredElement,
        }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /other…/i })).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("urn:custom")).toBeInTheDocument();
    expect(screen.getByDisplayValue("weird")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Weird")).toBeInTheDocument();
  });

  it("example binding preserves a non-enumerated value via 'Other…' and exposes the free-form editor", async () => {
    mockMaritalVs([{ code: "M" }, { code: "S" }]);
    const exampleElement: ElementDefinition = {
      ...maritalElement,
      binding: { strength: "example", valueSet: maritalStatusVsUrl },
    };
    render(
      <CodingInput
        value={{ system: "urn:local", code: "local-code", display: "Local" }}
        onChange={() => {}}
        context={{
          path: "Patient.maritalStatus.coding",
          typeCode: "Coding",
          element: exampleElement,
        }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /other…/i })).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("urn:local")).toBeInTheDocument();
    expect(screen.getByDisplayValue("local-code")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Local")).toBeInTheDocument();
  });

  it("falls back to the free-form 3-input editor when the element has no binding", () => {
    const noBinding: ElementDefinition = {
      path: "Foo.bar",
      type: [{ code: "Coding" }],
    };
    render(
      <CodingInput
        value={{ code: "abc" }}
        onChange={() => {}}
        context={{ path: "Foo.bar", typeCode: "Coding", element: noBinding }}
      />,
      { wrapper: mkWrapper() },
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("abc")).toBeInTheDocument();
  });
});

describe("CodeableConceptInput (binding propagation)", () => {
  const vsUrl = "http://hl7.org/fhir/ValueSet/condition-clinical";
  const system = "http://terminology.hl7.org/CodeSystem/condition-clinical";

  it("renders the bound dropdown for the inner Coding and updates coding[0]", async () => {
    server.use(
      http.get(`${BASE}/ValueSet/$expand`, () =>
        HttpResponse.json({
          resourceType: "ValueSet",
          status: "active",
          url: vsUrl,
          expansion: {
            identifier: "x",
            timestamp: "2024-01-01T00:00:00Z",
            contains: [
              { system, code: "active", display: "Active" },
              { system, code: "resolved", display: "Resolved" },
            ],
          },
        }),
      ),
    );
    const element: ElementDefinition = {
      path: "Condition.clinicalStatus",
      type: [{ code: "CodeableConcept" }],
      binding: { strength: "required", valueSet: vsUrl },
    };
    const onChange = vi.fn();
    render(
      <CodeableConceptInput
        value={undefined}
        onChange={onChange}
        context={{
          path: "Condition.clinicalStatus",
          typeCode: "CodeableConcept",
          element,
        }}
      />,
      { wrapper: mkWrapper() },
    );

    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Active \(active\)/ })).toBeInTheDocument(),
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "clinicalStatus" }),
      `${system}|active`,
    );
    expect(onChange).toHaveBeenCalledWith({
      coding: [{ system, code: "active", display: "Active" }],
    });
  });

  const mockVs = (codes: Array<{ code: string; display?: string }>) => {
    server.use(
      http.get(`${BASE}/ValueSet/$expand`, () =>
        HttpResponse.json({
          resourceType: "ValueSet",
          status: "active",
          url: vsUrl,
          expansion: {
            identifier: "x",
            timestamp: "2024-01-01T00:00:00Z",
            contains: codes.map((c) => ({ system, ...c })),
          },
        }),
      ),
    );
  };

  it("required binding: renders dropdown, no 'Other…' escape", async () => {
    mockVs([{ code: "active", display: "Active" }, { code: "resolved", display: "Resolved" }]);
    const element: ElementDefinition = {
      path: "Condition.clinicalStatus",
      type: [{ code: "CodeableConcept" }],
      binding: { strength: "required", valueSet: vsUrl },
    };
    render(
      <CodeableConceptInput
        value={undefined}
        onChange={() => {}}
        context={{ path: "Condition.clinicalStatus", typeCode: "CodeableConcept", element }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Active \(active\)/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("option", { name: /other…/i })).not.toBeInTheDocument();
  });

  it("extensible binding: renders dropdown, no 'Other…' escape", async () => {
    mockVs([{ code: "active", display: "Active" }, { code: "resolved", display: "Resolved" }]);
    const element: ElementDefinition = {
      path: "Condition.clinicalStatus",
      type: [{ code: "CodeableConcept" }],
      binding: { strength: "extensible", valueSet: vsUrl },
    };
    render(
      <CodeableConceptInput
        value={undefined}
        onChange={() => {}}
        context={{ path: "Condition.clinicalStatus", typeCode: "CodeableConcept", element }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Active \(active\)/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("option", { name: /other…/i })).not.toBeInTheDocument();
  });

  it("preferred binding: renders dropdown with 'Other…' escape that exposes free-form Coding editor", async () => {
    mockVs([{ code: "active", display: "Active" }, { code: "resolved", display: "Resolved" }]);
    const element: ElementDefinition = {
      path: "Condition.clinicalStatus",
      type: [{ code: "CodeableConcept" }],
      binding: { strength: "preferred", valueSet: vsUrl },
    };
    render(
      <CodeableConceptInput
        value={undefined}
        onChange={() => {}}
        context={{ path: "Condition.clinicalStatus", typeCode: "CodeableConcept", element }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /other…/i })).toBeInTheDocument(),
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "clinicalStatus" }),
      "__other__",
    );
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
  });

  it("example binding: renders dropdown with 'Other…' escape and round-trips a custom coding", async () => {
    mockVs([{ code: "active", display: "Active" }, { code: "resolved", display: "Resolved" }]);
    const element: ElementDefinition = {
      path: "Procedure.outcome",
      type: [{ code: "CodeableConcept" }],
      binding: { strength: "example", valueSet: vsUrl },
    };
    const onChange = vi.fn();
    render(
      <CodeableConceptInput
        value={{ coding: [{ system: "urn:local", code: "local-01", display: "Local Code" }] }}
        onChange={onChange}
        context={{ path: "Procedure.outcome", typeCode: "CodeableConcept", element }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /other…/i })).toBeInTheDocument(),
    );
    // custom value should auto-select Other… and show free-form inputs
    expect(screen.getByDisplayValue("urn:local")).toBeInTheDocument();
    expect(screen.getByDisplayValue("local-01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Local Code")).toBeInTheDocument();
  });
});

describe("Other… UX from empty value", () => {
  it("CodeInput: picking 'Other…' on an empty preferred binding surfaces a free-text input", async () => {
    server.use(
      http.get(`${BASE}/ValueSet/$expand`, () =>
        HttpResponse.json({
          resourceType: "ValueSet",
          status: "active",
          url: "http://hl7.org/fhir/ValueSet/administrative-gender",
          expansion: {
            identifier: "x",
            timestamp: "2024-01-01T00:00:00Z",
            contains: [
              { system: "http://hl7.org/fhir/administrative-gender", code: "male" },
            ],
          },
        }),
      ),
    );
    const el: ElementDefinition = {
      path: "Patient.gender",
      type: [{ code: "code" }],
      binding: {
        strength: "preferred",
        valueSet: "http://hl7.org/fhir/ValueSet/administrative-gender",
      },
    };
    render(
      <CodeInput
        value={undefined}
        onChange={() => {}}
        context={{ path: "Patient.gender", typeCode: "code", element: el }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /other…/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "gender" }),
      "__other__",
    );
    expect(
      screen.getByRole("textbox", { name: /gender \(custom\)/i }),
    ).toBeInTheDocument();
  });

  it("CodingInput: picking 'Other…' on an empty preferred binding surfaces the free-form editor", async () => {
    server.use(
      http.get(`${BASE}/ValueSet/$expand`, () =>
        HttpResponse.json({
          resourceType: "ValueSet",
          status: "active",
          url: "http://hl7.org/fhir/ValueSet/marital-status",
          expansion: {
            identifier: "x",
            timestamp: "2024-01-01T00:00:00Z",
            contains: [
              {
                system: "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus",
                code: "M",
                display: "Married",
              },
            ],
          },
        }),
      ),
    );
    const el: ElementDefinition = {
      path: "Patient.maritalStatus.coding",
      type: [{ code: "Coding" }],
      binding: {
        strength: "preferred",
        valueSet: "http://hl7.org/fhir/ValueSet/marital-status",
      },
    };
    render(
      <CodingInput
        value={undefined}
        onChange={() => {}}
        context={{
          path: "Patient.maritalStatus.coding",
          typeCode: "Coding",
          element: el,
        }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /other…/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText("System")).not.toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "coding" }),
      "__other__",
    );
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Code")).toBeInTheDocument();
  });

  it("CodingInput: extensible binding does NOT surface 'Other…'", async () => {
    server.use(
      http.get(`${BASE}/ValueSet/$expand`, () =>
        HttpResponse.json({
          resourceType: "ValueSet",
          status: "active",
          url: "http://hl7.org/fhir/ValueSet/marital-status",
          expansion: {
            identifier: "x",
            timestamp: "2024-01-01T00:00:00Z",
            contains: [
              {
                system: "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus",
                code: "M",
                display: "Married",
              },
            ],
          },
        }),
      ),
    );
    const el: ElementDefinition = {
      path: "Patient.maritalStatus.coding",
      type: [{ code: "Coding" }],
      binding: {
        strength: "extensible",
        valueSet: "http://hl7.org/fhir/ValueSet/marital-status",
      },
    };
    render(
      <CodingInput
        value={undefined}
        onChange={() => {}}
        context={{
          path: "Patient.maritalStatus.coding",
          typeCode: "Coding",
          element: el,
        }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Married/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("option", { name: /other…/i })).not.toBeInTheDocument();
  });
});

describe("CodingInput async combobox (large/partial ValueSets)", () => {
  const snomedVs = "http://snomed.info/sct?fhir_vs";
  const snomedSystem = "http://snomed.info/sct";

  const installSnomedHandler = () => {
    server.use(
      http.get(`${BASE}/ValueSet/$expand`, ({ request }) => {
        const url = new URL(request.url);
        const filter = url.searchParams.get("filter");
        if (!filter) {
          // Initial useValueSet probe — server returns a partial expansion
          // signaling the ValueSet is too large to enumerate locally.
          return HttpResponse.json({
            resourceType: "ValueSet",
            status: "active",
            url: snomedVs,
            expansion: {
              identifier: "x",
              timestamp: "2024-01-01T00:00:00Z",
              total: 999_999,
              contains: [],
            },
          });
        }
        const all = [
          { system: snomedSystem, code: "73211009", display: "Diabetes mellitus" },
          { system: snomedSystem, code: "44054006", display: "Diabetes mellitus type 2" },
          { system: snomedSystem, code: "84114007", display: "Heart failure" },
        ];
        const matching = all.filter((c) =>
          c.display.toLowerCase().includes(filter.toLowerCase()),
        );
        return HttpResponse.json({
          resourceType: "ValueSet",
          status: "active",
          url: snomedVs,
          expansion: {
            identifier: "x",
            timestamp: "2024-01-01T00:00:00Z",
            total: 999_999,
            contains: matching,
          },
        });
      }),
    );
  };

  const conditionCodeElement: ElementDefinition = {
    path: "Condition.code",
    type: [{ code: "Coding" }],
    binding: { strength: "extensible", valueSet: snomedVs },
  };

  it("switches to combobox when expansion is partial and queries on type-ahead", async () => {
    installSnomedHandler();
    const onChange = vi.fn();
    render(
      <CodingInput
        value={undefined}
        onChange={onChange}
        context={{ path: "Condition.code", typeCode: "Coding", element: conditionCodeElement }}
      />,
      { wrapper: mkWrapper() },
    );
    const input = await screen.findByRole("combobox", { name: "code" });
    expect(input.tagName).toBe("INPUT"); // not <select>
    await userEvent.type(input, "diab");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /Diabetes mellitus 73211009/ }),
      ).toBeInTheDocument(),
    );
    await userEvent.click(
      screen.getByRole("option", { name: /Diabetes mellitus 73211009/ }),
    );
    expect(onChange).toHaveBeenCalledWith({
      system: snomedSystem,
      code: "73211009",
      display: "Diabetes mellitus",
    });
  });

  it("ArrowDown + Enter selects the highlighted option", async () => {
    installSnomedHandler();
    const onChange = vi.fn();
    render(
      <CodingInput
        value={undefined}
        onChange={onChange}
        context={{ path: "Condition.code", typeCode: "Coding", element: conditionCodeElement }}
      />,
      { wrapper: mkWrapper() },
    );
    const input = await screen.findByRole("combobox", { name: "code" });
    await userEvent.type(input, "heart");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Heart failure/ })).toBeInTheDocument(),
    );
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith({
      system: snomedSystem,
      code: "84114007",
      display: "Heart failure",
    });
  });

  it("exposes a 'Enter a custom code…' details escape on example bindings", async () => {
    installSnomedHandler();
    const exampleElement: ElementDefinition = {
      ...conditionCodeElement,
      binding: { strength: "example", valueSet: snomedVs },
    };
    render(
      <CodingInput
        value={undefined}
        onChange={() => {}}
        context={{ path: "Condition.code", typeCode: "Coding", element: exampleElement }}
      />,
      { wrapper: mkWrapper() },
    );
    await screen.findByRole("combobox", { name: "code" });
    expect(screen.getByText(/Enter a custom code…/i)).toBeInTheDocument();
  });

  it("hides the custom-code escape on required bindings", async () => {
    installSnomedHandler();
    const required: ElementDefinition = {
      ...conditionCodeElement,
      binding: { strength: "required", valueSet: snomedVs },
    };
    render(
      <CodingInput
        value={undefined}
        onChange={() => {}}
        context={{ path: "Condition.code", typeCode: "Coding", element: required }}
      />,
      { wrapper: mkWrapper() },
    );
    await screen.findByRole("combobox", { name: "code" });
    expect(screen.queryByText(/Enter a custom code…/i)).not.toBeInTheDocument();
  });

  it("falls back to the free-form editor when the binding can't be resolved at all", async () => {
    server.use(
      http.get(`${BASE}/ValueSet/$expand`, () =>
        HttpResponse.json({ error: "no" }, { status: 500 }),
      ),
      http.get(`${BASE}/ValueSet`, () =>
        HttpResponse.json({ error: "no" }, { status: 500 }),
      ),
    );
    const el: ElementDefinition = {
      path: "Foo.bar",
      type: [{ code: "Coding" }],
      binding: {
        strength: "preferred",
        valueSet: "http://example.com/vs/unknown-by-everyone",
      },
    };
    render(
      <CodingInput
        value={undefined}
        onChange={() => {}}
        context={{ path: "Foo.bar", typeCode: "Coding", element: el }}
      />,
      { wrapper: mkWrapper() },
    );
    await waitFor(() => expect(screen.getByText("System")).toBeInTheDocument());
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText("Display")).toBeInTheDocument();
  });
});
