import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CodeableConcept, ElementDefinition } from "fhir/r4";
import { describe, expect, it, vi } from "vitest";
import { DataAbsentReasonInput } from "./DataAbsentReason.js";

const element: ElementDefinition = {
  path: "Observation.dataAbsentReason",
  type: [{ code: "CodeableConcept" }],
  short: "Why the result is missing",
};

const renderInput = (
  value: CodeableConcept | undefined,
  onChange: (v: CodeableConcept | undefined) => void = () => {},
) =>
  render(
    <DataAbsentReasonInput
      value={value}
      onChange={onChange}
      context={{ path: element.path!, typeCode: "CodeableConcept", element }}
    />,
  );

describe("DataAbsentReasonInput", () => {
  it("renders a trigger button when no reason is set", () => {
    renderInput(undefined);
    expect(
      screen.getByRole("button", { name: /mark result as missing/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("clicking the trigger seeds a default standard reason ('unknown')", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderInput(undefined, onChange);
    await user.click(screen.getByRole("button", { name: /mark result as missing/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toEqual({
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/data-absent-reason",
          code: "unknown",
          display: "Unknown",
        },
      ],
    });
  });

  it("renders the standard-reason dropdown when a standard coding is set", () => {
    renderInput({
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/data-absent-reason",
          code: "asked-declined",
          display: "Asked but declined",
        },
      ],
    });
    const select = screen.getByRole("combobox", { name: /reason/i });
    expect(select).toHaveValue("asked-declined");
    // Raw CodeableConcept fields stay hidden for standard reasons.
    expect(screen.queryByText(/^Text$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^System$/)).not.toBeInTheDocument();
  });

  it("changing the dropdown emits a new standard CodeableConcept", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderInput(
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/data-absent-reason",
            code: "unknown",
            display: "Unknown",
          },
        ],
      },
      onChange,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /reason/i }),
      "masked",
    );
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/data-absent-reason",
          code: "masked",
          display: "Masked",
        },
      ],
    });
  });

  it("selecting 'Other (custom code)' clears the standard coding and reveals raw fields", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderInput(
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/data-absent-reason",
            code: "unknown",
            display: "Unknown",
          },
        ],
      },
      onChange,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /reason/i }),
      "__custom__",
    );
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({});
  });

  it("renders the raw CodeableConcept fields when value is custom (non-standard system)", () => {
    renderInput({
      text: "see attached",
      coding: [{ system: "https://example/local", code: "x" }],
    });
    expect(screen.getByText(/^Text$/)).toBeInTheDocument();
    expect(screen.getByText(/^System$/)).toBeInTheDocument();
    expect(screen.getByText(/^Code$/)).toBeInTheDocument();
    expect(screen.getByText(/^Display$/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /reason/i })).toHaveValue("__custom__");
  });

  it("clicking the clear button emits undefined", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderInput(
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/data-absent-reason",
            code: "unknown",
            display: "Unknown",
          },
        ],
      },
      onChange,
    );
    await user.click(screen.getByRole("button", { name: /clear reason/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
