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
          { resourceType: "Patient", name: [{ given: [""], family: "" }] } as Patient
        }
        structureDefinition={PatientStructureDefinition}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]?.[0] as Patient;
    expect(saved.resourceType).toBe("Patient");
    // empty given and empty family mean no name array at all
    expect(saved.name).toBeUndefined();
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
