import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { Patient } from "fhir/r4";
import { describe, expect, it, vi } from "vitest";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { FhirClientProvider } from "../hooks/FhirClientProvider.js";
import { PatientStructureDefinition } from "../../test/fixtures/StructureDefinition-Patient.js";
import { ResourceView } from "./ResourceView.js";

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

const patient: Patient = {
  resourceType: "Patient",
  id: "ada",
  active: true,
  name: [
    { use: "official", given: ["Ada"], family: "Lovelace" },
    { use: "nickname", given: ["Countess"] },
  ],
  gender: "female",
  birthDate: "1815-12-10",
  deceasedDateTime: "1852-11-27",
  telecom: [{ system: "email", value: "ada@example.com", use: "home" }],
  address: [{ line: ["1 Workhouse Lane"], city: "London", country: "UK" }],
  text: {
    status: "generated",
    div: '<div xmlns="http://www.w3.org/1999/xhtml"><p>Ada Lovelace, born 1815</p></div>',
  },
};

describe("ResourceView", () => {
  it("renders heading with resource type and id", () => {
    wrap(<ResourceView resource={patient} structureDefinition={PatientStructureDefinition} />);
    expect(screen.getByRole("heading", { name: /patient/i })).toBeInTheDocument();
    // "ada" appears in the header badge AND in the Patient.id element
    expect(screen.getAllByText("ada").length).toBeGreaterThanOrEqual(1);
  });

  it("renders primitive and choice types with friendly formatting", () => {
    wrap(<ResourceView resource={patient} structureDefinition={PatientStructureDefinition} />);
    expect(screen.getByText("true")).toBeInTheDocument(); // active
    expect(screen.getByText("female")).toBeInTheDocument(); // gender (code)
    expect(screen.getByText("1815-12-10")).toBeInTheDocument(); // birthDate
    // deceasedDateTime via choice type
    expect(screen.getByText(/1852/)).toBeInTheDocument();
  });

  it("renders arrays as lists with one item per entry", () => {
    wrap(<ResourceView resource={patient} structureDefinition={PatientStructureDefinition} />);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText(/Countess/)).toBeInTheDocument();
  });

  it("renders ContactPoint with mailto link for email", () => {
    wrap(<ResourceView resource={patient} structureDefinition={PatientStructureDefinition} />);
    const link = screen.getByRole("link", { name: "ada@example.com" });
    expect(link).toHaveAttribute("href", "mailto:ada@example.com");
  });

  it("renders Address text", () => {
    wrap(<ResourceView resource={patient} structureDefinition={PatientStructureDefinition} />);
    expect(screen.getByText(/1 Workhouse Lane/)).toBeInTheDocument();
    expect(screen.getByText(/London/)).toBeInTheDocument();
  });

  it("renders sanitised narrative by default", () => {
    wrap(<ResourceView resource={patient} structureDefinition={PatientStructureDefinition} />);
    expect(screen.getByText(/Ada Lovelace, born 1815/)).toBeInTheDocument();
  });

  it("filters top-level elements when visibleFields is provided", () => {
    wrap(
      <ResourceView
        resource={patient}
        structureDefinition={PatientStructureDefinition}
        visibleFields={["gender", "birthDate"]}
      />,
    );
    expect(screen.getByText("female")).toBeInTheDocument();
    expect(screen.getByText("1815-12-10")).toBeInTheDocument();
    // `name` is not in visibleFields, so the rendered HumanName should be hidden.
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("matches choice variants by their materialised JSON key", () => {
    wrap(
      <ResourceView
        resource={patient}
        structureDefinition={PatientStructureDefinition}
        visibleFields={["deceasedDateTime"]}
      />,
    );
    expect(screen.getByText(/1852/)).toBeInTheDocument();
    expect(screen.queryByText("female")).not.toBeInTheDocument();
  });

  it("hides narrative when hideNarrative is true", () => {
    wrap(
      <ResourceView
        resource={patient}
        structureDefinition={PatientStructureDefinition}
        hideNarrative
      />,
    );
    expect(screen.queryByText(/born 1815/)).not.toBeInTheDocument();
  });

  it("allows overriding renderers per-type", () => {
    wrap(
      <ResourceView
        resource={patient}
        structureDefinition={PatientStructureDefinition}
        renderers={{
          HumanName: () => <span data-testid="custom-name">OVERRIDDEN</span>,
        }}
      />,
    );
    const custom = screen.getAllByTestId("custom-name");
    expect(custom.length).toBeGreaterThan(0);
    expect(custom[0]!.textContent).toBe("OVERRIDDEN");
  });

  it("recurses into BackboneElement children (Patient.contact.name)", () => {
    const withContact: Patient = {
      ...patient,
      contact: [
        {
          name: { given: ["Jane"], family: "Doe" },
        },
      ],
    };
    wrap(<ResourceView resource={withContact} structureDefinition={PatientStructureDefinition} />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("invokes onReferenceClick when a Reference is clicked", async () => {
    const ptWithRef = {
      resourceType: "Patient",
      id: "p",
      generalPractitioner: [{ reference: "Practitioner/gp-1", display: "Dr Smith" }],
    } as unknown as Patient;
    const sdWithRef = {
      ...PatientStructureDefinition,
      snapshot: {
        element: [
          ...(PatientStructureDefinition.snapshot?.element ?? []),
          {
            path: "Patient.generalPractitioner",
            min: 0,
            max: "*",
            short: "Primary care physician",
            type: [{ code: "Reference" }],
          },
        ],
      },
    };
    const onRef = vi.fn();
    wrap(
      <ResourceView
        resource={ptWithRef}
        structureDefinition={sdWithRef}
        onReferenceClick={onRef}
      />,
    );
    const [btn] = screen.getAllByRole("button", { name: "Dr Smith" });
    btn!.click();
    expect(onRef).toHaveBeenCalledWith({
      reference: "Practitioner/gp-1",
      display: "Dr Smith",
    });
  });

  it("falls back to JSON for unknown complex types", () => {
    const sdWithMoneyField = {
      ...PatientStructureDefinition,
      snapshot: {
        element: [
          ...(PatientStructureDefinition.snapshot?.element ?? []),
          {
            path: "Patient.mystery",
            min: 0,
            max: "1",
            short: "Some unknown datatype",
            type: [{ code: "SomeWeirdType" }],
          },
        ],
      },
    };
    const res = { ...patient, mystery: { nested: { thing: 42 } } } as unknown as Patient;
    wrap(<ResourceView resource={res} structureDefinition={sdWithMoneyField} />);
    // JSON fallback renders the payload as text
    expect(screen.getByText(/"thing"/)).toBeInTheDocument();
  });

  it("shows a loading state when SD is unknown and not supplied", () => {
    wrap(<ResourceView resource={{ resourceType: "Observation" }} />);
    expect(screen.getByTestId("resource-view-loading")).toBeInTheDocument();
  });

  it("finds the right DOM hierarchy for label/value pairs", () => {
    wrap(<ResourceView resource={patient} structureDefinition={PatientStructureDefinition} />);
    const view = screen.getByTestId("resource-view");
    const labels = within(view).getAllByText(/./, { selector: "dt" });
    expect(labels.length).toBeGreaterThan(4);
  });
});
