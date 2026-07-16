import { fireEvent, render, screen } from "@testing-library/react";
import type { ElementDefinition, Quantity } from "fhir/r4";
import { describe, expect, it, vi } from "vitest";
import { QuantityInput } from "./Quantity.js";
import type { InputContext } from "./types.js";

const ctxFor = (element: Partial<ElementDefinition>): InputContext => ({
  path: element.path ?? "Observation.valueQuantity",
  typeCode: "Quantity",
  element: { path: "Observation.valueQuantity", ...element } as ElementDefinition,
});

const plainQuantityCtx = ctxFor({ type: [{ code: "Quantity" }] });
const simpleQuantityCtx = ctxFor({
  path: "MedicationRequest.dispenseRequest.quantity",
  type: [
    {
      code: "Quantity",
      profile: ["http://hl7.org/fhir/StructureDefinition/SimpleQuantity"],
    },
  ],
});

describe("QuantityInput (#368)", () => {
  it("exposes a comparator select that patches the draft", () => {
    const onChange = vi.fn();
    render(
      <QuantityInput
        value={{ value: 5 }}
        onChange={onChange}
        context={plainQuantityCtx}
      />,
    );
    fireEvent.change(screen.getByTestId("quantity-comparator"), {
      target: { value: "<" },
    });
    expect(onChange).toHaveBeenCalledWith({ value: 5, comparator: "<" });
  });

  it("clears the comparator when '=' is picked", () => {
    const onChange = vi.fn();
    render(
      <QuantityInput
        value={{ value: 5, comparator: "<" } as Quantity}
        onChange={onChange}
        context={plainQuantityCtx}
      />,
    );
    fireEvent.change(screen.getByTestId("quantity-comparator"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith({ value: 5, comparator: undefined });
  });

  it("hides the comparator for SimpleQuantity (spec forbids it)", () => {
    render(
      <QuantityInput
        value={{ value: 30 }}
        onChange={() => {}}
        context={simpleQuantityCtx}
      />,
    );
    expect(screen.queryByTestId("quantity-comparator")).toBeNull();
  });

  it("hides the comparator for versioned SimpleQuantity canonicals and bare type codes", () => {
    const versionedCtx = ctxFor({
      path: "MedicationRequest.dispenseRequest.quantity",
      type: [
        {
          code: "Quantity",
          profile: ["http://hl7.org/fhir/StructureDefinition/SimpleQuantity|4.0.1"],
        },
      ],
    });
    const { unmount } = render(
      <QuantityInput value={{ value: 1 }} onChange={() => {}} context={versionedCtx} />,
    );
    expect(screen.queryByTestId("quantity-comparator")).toBeNull();
    unmount();

    const bareTypeCtx = {
      ...ctxFor({ type: [{ code: "SimpleQuantity" }] }),
      typeCode: "SimpleQuantity",
    };
    render(
      <QuantityInput value={{ value: 1 }} onChange={() => {}} context={bareTypeCtx} />,
    );
    expect(screen.queryByTestId("quantity-comparator")).toBeNull();
  });

  it("strips a pre-existing comparator from SimpleQuantity values on edit", () => {
    const onChange = vi.fn();
    const { container } = render(
      <QuantityInput
        value={{ value: 30, comparator: "<" } as Quantity}
        onChange={onChange}
        context={simpleQuantityCtx}
      />,
    );
    // No comparator control renders, and editing any field drops the
    // forbidden comparator instead of re-emitting it forever.
    expect(screen.queryByTestId("quantity-comparator")).toBeNull();
    const valueInput = container.querySelectorAll("input")[0]!;
    fireEvent.change(valueInput, { target: { value: "31" } });
    expect(onChange).toHaveBeenCalledWith({ value: 31 });
  });

  it("defaults system to UCUM when a code is entered without one", () => {
    const onChange = vi.fn();
    const { container } = render(
      <QuantityInput
        value={{ value: 93 }}
        onChange={onChange}
        context={plainQuantityCtx}
      />,
    );
    const codeInput = container.querySelectorAll("input")[3]!;
    fireEvent.change(codeInput, { target: { value: "mg/dL" } });
    expect(onChange).toHaveBeenCalledWith({
      value: 93,
      code: "mg/dL",
      system: "http://unitsofmeasure.org",
    });
  });

  it("keeps an explicitly-set system when the code changes", () => {
    const onChange = vi.fn();
    const { container } = render(
      <QuantityInput
        value={{ value: 1, system: "http://example.org/units" }}
        onChange={onChange}
        context={plainQuantityCtx}
      />,
    );
    const codeInput = container.querySelectorAll("input")[3]!;
    fireEvent.change(codeInput, { target: { value: "widgets" } });
    expect(onChange).toHaveBeenCalledWith({
      value: 1,
      code: "widgets",
      system: "http://example.org/units",
    });
  });
});
