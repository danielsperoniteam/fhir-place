import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Observation, Patient } from "fhir/r4";
import { describe, expect, it, vi } from "vitest";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { FhirClientProvider } from "../hooks/FhirClientProvider.js";
import { PatientStructureDefinition } from "../../test/fixtures/StructureDefinition-Patient.js";
import { ObservationStructureDefinition } from "../../test/fixtures/StructureDefinition-Observation.js";
import { ResourceEditor } from "./ResourceEditor.js";

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const client = new FetchFhirClient({ baseUrl: "https://fhir.example.test/fhir" });
  return render(
    <QueryClientProvider client={qc}>
      <FhirClientProvider client={client}>{ui}</FhirClientProvider>
    </QueryClientProvider>,
  );
};

const emptyPatient: Patient = { resourceType: "Patient" };

const loaded: Patient = {
  resourceType: "Patient",
  id: "ada",
  active: true,
  gender: "female",
  birthDate: "1815-12-10",
  name: [{ given: ["Ada"], family: "Lovelace", use: "official" }],
  telecom: [{ system: "email", value: "ada@example.com" }],
};

describe("ResourceEditor", () => {
  it("renders a form with inputs driven by the StructureDefinition", () => {
    wrap(
      <ResourceEditor
        resource={emptyPatient}
        structureDefinition={PatientStructureDefinition}
      />,
    );
    const form = screen.getByTestId("resource-editor");
    expect(form).toBeInTheDocument();
    // Patient.active (boolean) → checkbox
    expect(within(form).getAllByRole("checkbox")[0]).toBeInTheDocument();
    // Patient.gender (code w/ enum short) → select
    const genderSelect = within(form).getAllByRole("combobox");
    expect(genderSelect.length).toBeGreaterThan(0);
  });

  it("pre-fills inputs from an existing resource", () => {
    wrap(
      <ResourceEditor
        resource={loaded}
        structureDefinition={PatientStructureDefinition}
      />,
    );
    const familyInput = screen.getByDisplayValue("Lovelace");
    expect(familyInput).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ada")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1815-12-10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ada@example.com")).toBeInTheDocument();
  });

  it("fires onChange with an updated draft on every keystroke", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    wrap(
      <ResourceEditor
        resource={emptyPatient}
        structureDefinition={PatientStructureDefinition}
        onChange={onChange}
      />,
    );
    const birthDate = screen
      .getByTestId("resource-editor")
      .querySelector('input[type="date"]') as HTMLInputElement;
    await user.clear(birthDate);
    await user.type(birthDate, "2024-01-15");
    const lastCall = onChange.mock.calls.at(-1)?.[0] as Patient;
    expect(lastCall.birthDate).toBe("2024-01-15");
  });

  it("supports adding and removing array items (Patient.name)", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    wrap(
      <ResourceEditor
        resource={emptyPatient}
        structureDefinition={PatientStructureDefinition}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add name/i }));
    // After adding, the first textbox in the form is the HumanName "given" field.
    const givenInputs = screen.getAllByRole("textbox");
    await user.type(givenInputs[0]!, "Grace");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]?.[0] as Patient;
    expect(saved.name?.[0]?.given).toEqual(["Grace"]);
  });

  it("prunes empty values before invoking onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    wrap(
      <ResourceEditor
        resource={
          {
            resourceType: "Patient",
            name: [{ given: [""], family: "Lovelace" }, { given: [""], family: "" }],
          } as Patient
        }
        structureDefinition={PatientStructureDefinition}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]?.[0] as Patient;
    expect(saved.resourceType).toBe("Patient");
    // the empty given entry and the fully-empty second name are pruned;
    // the populated family survives
    expect(saved.name).toEqual([{ family: "Lovelace" }]);
  });

  it("fires onCancel when Cancel clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    wrap(
      <ResourceEditor
        resource={emptyPatient}
        structureDefinition={PatientStructureDefinition}
        onCancel={onCancel}
      />,
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("handles choice types: switching from dateTime to boolean clears the other variant", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    wrap(
      <ResourceEditor
        resource={{ resourceType: "Patient", deceasedDateTime: "2020-01-01" } as Patient}
        structureDefinition={PatientStructureDefinition}
        onChange={onChange}
      />,
    );
    const choiceSelect = screen.getByTestId("choice-deceased");
    await user.selectOptions(choiceSelect, "boolean");
    // switching should clear deceasedDateTime in the draft
    const lastCall = onChange.mock.calls.at(-1)?.[0] as Patient;
    expect(lastCall.deceasedDateTime).toBeUndefined();
  });

  it("disables the Save button while saving", () => {
    wrap(
      <ResourceEditor
        resource={emptyPatient}
        structureDefinition={PatientStructureDefinition}
        saving
      />,
    );
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it("uses the path-based override for Observation.dataAbsentReason instead of the generic CodeableConcept input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const obs: Observation = {
      resourceType: "Observation",
      status: "final",
      code: { text: "BP" },
    };
    wrap(
      <ResourceEditor
        resource={obs}
        structureDefinition={ObservationStructureDefinition}
        onChange={onChange}
      />,
    );
    // Before the toggle is clicked, the raw CodeableConcept fields for
    // dataAbsentReason should not be visible — only the trigger button is.
    expect(
      screen.getByRole("button", { name: /mark result as missing/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /mark result as missing/i }));
    const last = onChange.mock.calls.at(-1)?.[0] as Observation;
    expect(last.dataAbsentReason?.coding?.[0]).toMatchObject({
      system: "http://terminology.hl7.org/CodeSystem/data-absent-reason",
      code: "unknown",
    });
  });

  it("saves an Observation valueQuantity with a valid UCUM code", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const obs: Observation = {
      resourceType: "Observation",
      status: "final",
      code: { text: "Glucose" },
      valueQuantity: {
        value: 93,
        unit: "milligrams per deciliter",
        code: "mg/dL",
      },
    };
    wrap(
      <ResourceEditor
        resource={obs}
        structureDefinition={ObservationStructureDefinition}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]?.[0] as Observation;
    expect(saved.valueQuantity?.code).toBe("mg/dL");
    expect(screen.queryByTestId("resource-editor-valuequantity-code-error")).toBeNull();
  });

  it("does not UCUM-validate a valueQuantity whose system is not UCUM", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const obs: Observation = {
      resourceType: "Observation",
      status: "final",
      code: { text: "Widget count" },
      valueQuantity: {
        value: 3,
        unit: "widgets",
        system: "http://example.org/units",
        code: "widgets",
      },
    };
    wrap(
      <ResourceEditor
        resource={obs}
        structureDefinition={ObservationStructureDefinition}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(screen.queryByTestId("resource-editor-valuequantity-code-error")).toBeNull();
  });

  it("blocks save when Observation valueQuantity.code is not UCUM", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const obs: Observation = {
      resourceType: "Observation",
      status: "final",
      code: { text: "Glucose" },
      valueQuantity: {
        value: 93,
        unit: "milligrams per deciliter",
        code: "not-a-ucum",
      },
    };
    wrap(
      <ResourceEditor
        resource={obs}
        structureDefinition={ObservationStructureDefinition}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).not.toHaveBeenCalled();
    const error = screen.getByTestId("resource-editor-valuequantity-code-error");
    expect(error).toHaveTextContent("not-a-ucum");
    expect(error).toHaveTextContent(
      "developer-tool warning, not clinical decision support",
    );
  });

  it("treats Observation valueQuantity.unit as display text only", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const obs: Observation = {
      resourceType: "Observation",
      status: "final",
      code: { text: "Glucose" },
      valueQuantity: {
        value: 93,
        unit: "mg/dL",
      },
    };
    wrap(
      <ResourceEditor
        resource={obs}
        structureDefinition={ObservationStructureDefinition}
        onSave={onSave}
      />,
    );
    const form = screen.getByTestId("resource-editor");
    await user.clear(within(form).getByLabelText("Unit"));
    await user.type(within(form).getByLabelText("Unit"), "milligrams per deciliter");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]?.[0] as Observation;
    expect(saved.valueQuantity).toMatchObject({
      unit: "milligrams per deciliter",
    });
    expect(saved.valueQuantity?.code).toBeUndefined();
    expect(screen.queryByTestId("resource-editor-valuequantity-code-error")).toBeNull();
  });

  // Regression for #587: labels/values previously rendered as <dt>/<dd>
  // inside a <div> grid, and nested complex types put <dt> inside <dd> —
  // React logs validateDOMNesting warnings for both.
  it("renders nested complex fields without validateDOMNesting warnings", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      wrap(
        <ResourceEditor
          resource={loaded}
          structureDefinition={PatientStructureDefinition}
        />,
      );
      const nestingWarnings = errorSpy.mock.calls.filter((call) =>
        String(call[0]).includes("validateDOMNesting"),
      );
      expect(nestingWarnings).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });

  // Regression for #588: an all-empty Patient/new form must not silently
  // POST `{ resourceType: "Patient" }`.
  it("blocks creating a Patient with no name and no identifier", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    wrap(
      <ResourceEditor
        resource={emptyPatient}
        structureDefinition={PatientStructureDefinition}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).not.toHaveBeenCalled();
    const banner = screen.getByTestId("resource-editor-form-error");
    expect(banner).toHaveTextContent(/no identifying information/i);
  });

  it("allows creating a Patient once a name is entered", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    wrap(
      <ResourceEditor
        resource={emptyPatient}
        structureDefinition={PatientStructureDefinition}
        onSave={onSave}
      />,
    );
    // trip the guardrail first, then fix the form and re-save
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(screen.getByTestId("resource-editor-form-error")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add name/i }));
    const givenInputs = screen.getAllByRole("textbox");
    await user.type(givenInputs[0]!, "Grace");
    // editing clears the banner
    expect(screen.queryByTestId("resource-editor-form-error")).toBeNull();

    await user.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]?.[0] as Patient;
    expect(saved.name?.[0]?.given).toEqual(["Grace"]);
  });

  it("blocks creating a Patient whose only 'identity' is whitespace or a bare identifier system", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    wrap(
      <ResourceEditor
        resource={
          {
            resourceType: "Patient",
            identifier: [{ system: "http://example.org/mrn" }],
            name: [{ text: "   ", given: [" "] }],
          } as Patient
        }
        structureDefinition={PatientStructureDefinition}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("resource-editor-form-error")).toHaveTextContent(
      /no identifying information/i,
    );
  });

  it("allows creating a Patient with an identifier value and no name", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    wrap(
      <ResourceEditor
        resource={
          {
            resourceType: "Patient",
            identifier: [{ system: "http://example.org/mrn", value: "MRN-123" }],
          } as Patient
        }
        structureDefinition={PatientStructureDefinition}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("does not block saving an existing anonymized Patient", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    wrap(
      <ResourceEditor
        resource={{ resourceType: "Patient", id: "anon-1", gender: "female" } as Patient}
        structureDefinition={PatientStructureDefinition}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("falls back to JSON textarea for datatypes without a built-in input", () => {
    const sdWithMystery = {
      ...PatientStructureDefinition,
      snapshot: {
        element: [
          ...(PatientStructureDefinition.snapshot?.element ?? []),
          {
            path: "Patient.mystery",
            min: 0,
            max: "1",
            short: "Unknown type",
            type: [{ code: "SomeWeirdType" }],
          },
        ],
      },
    };
    wrap(
      <ResourceEditor
        resource={{ resourceType: "Patient", mystery: { nested: 1 } } as unknown as Patient}
        structureDefinition={sdWithMystery}
      />,
    );
    // The fallback renders a textarea with the JSON contents
    expect(screen.getByDisplayValue(/"nested"/)).toBeInTheDocument();
  });
});
