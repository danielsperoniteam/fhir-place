import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Condition, Immunization, MedicationRequest, Observation, Patient, Procedure, StructureDefinition } from "fhir/r4";
import { describe, expect, it, vi } from "vitest";
import { ConditionStructureDefinition } from "../../test/fixtures/StructureDefinition-Condition.js";
import { ImmunizationStructureDefinition } from "../../test/fixtures/StructureDefinition-Immunization.js";
import { MedicationRequestStructureDefinition } from "../../test/fixtures/StructureDefinition-MedicationRequest.js";
import { ObservationStructureDefinition } from "../../test/fixtures/StructureDefinition-Observation.js";
import { ProcedureStructureDefinition } from "../../test/fixtures/StructureDefinition-Procedure.js";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { FhirClientProvider } from "../hooks/FhirClientProvider.js";
import { getByPath, ResourceTable } from "./ResourceTable.js";

const wrap = () => {
  const client = new FetchFhirClient({ baseUrl: "https://fhir.example.test/fhir" });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <FhirClientProvider client={client}>{children}</FhirClientProvider>
    </QueryClientProvider>
  );
};

const sd: StructureDefinition = {
  resourceType: "StructureDefinition",
  id: "Patient",
  url: "http://hl7.org/fhir/StructureDefinition/Patient",
  name: "Patient",
  status: "active",
  kind: "resource",
  abstract: false,
  type: "Patient",
  snapshot: {
    element: [
      { id: "Patient", path: "Patient", min: 0, max: "*" },
      { id: "Patient.name", path: "Patient.name", min: 0, max: "*", short: "Name", type: [{ code: "HumanName" }] },
      { id: "Patient.gender", path: "Patient.gender", min: 0, max: "1", short: "Gender", type: [{ code: "code" }] },
      { id: "Patient.birthDate", path: "Patient.birthDate", min: 0, max: "1", short: "Birth date", type: [{ code: "date" }] },
    ],
  },
};

const patients: Patient[] = [
  {
    resourceType: "Patient",
    id: "p1",
    name: [{ given: ["Ada"], family: "Lovelace" }],
    gender: "female",
    birthDate: "1815-12-10",
  },
  {
    resourceType: "Patient",
    id: "p2",
    name: [{ given: ["Alan"], family: "Turing" }],
    gender: "male",
    birthDate: "1912-06-23",
  },
];

describe("getByPath", () => {
  it("reads nested string paths", () => {
    expect(getByPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("auto-indexes the first element of arrays", () => {
    expect(
      getByPath({ name: [{ family: "Smith" }, { family: "Jones" }] }, "name.family"),
    ).toBe("Smith");
  });

  it("supports explicit [idx] segments", () => {
    expect(
      getByPath({ name: [{ family: "Smith" }, { family: "Jones" }] }, "name[1].family"),
    ).toBe("Jones");
  });

  it("returns undefined for missing segments", () => {
    expect(getByPath({ a: 1 }, "a.b.c")).toBeUndefined();
  });
});

describe("ResourceTable", () => {
  it("renders a header + row per resource with datatype-aware cells", () => {
    render(
      <ResourceTable<Patient>
        resources={patients}
        columns={["name", "gender", "birthDate"]}
        structureDefinition={sd}
        // Pin to the table layout — auto mode renders BOTH layouts in
        // jsdom (no CSS), which would duplicate every label / value text
        // node and break the count-based assertions below.
        layout="table"
      />,
      { wrapper: wrap() },
    );
    // Headers derived from SD.short
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Gender")).toBeInTheDocument();
    // Header is derived from the column path (not element.short), so camelCase
    // `birthDate` becomes "Birth Date".
    expect(screen.getByText("Birth Date")).toBeInTheDocument();
    // Rows rendered
    const rows = screen.getAllByTestId("resource-row");
    expect(rows).toHaveLength(2);
    // HumanName cell uses the type renderer
    expect(within(rows[0]!).getByText(/Ada Lovelace/)).toBeInTheDocument();
  });

  it("supports custom cellRenderers per path", () => {
    render(
      <ResourceTable<Patient>
        resources={patients}
        columns={["name"]}
        cellRenderers={{
          name: (p) => <span data-testid="custom-name">{p.id}</span>,
        }}
        structureDefinition={sd}
        layout="table"
      />,
      { wrapper: wrap() },
    );
    expect(screen.getAllByTestId("custom-name")).toHaveLength(2);
  });

  it("invokes onRowClick when a row is clicked", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    render(
      <ResourceTable<Patient>
        resources={patients}
        columns={["name"]}
        onRowClick={onRowClick}
        structureDefinition={sd}
      />,
      { wrapper: wrap() },
    );
    await user.click(screen.getAllByTestId("resource-row")[0]!);
    expect(onRowClick).toHaveBeenCalledWith(patients[0]);
  });

  it("toggles sort direction via header click (controlled)", async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ResourceTable<Patient>
        resources={patients}
        columns={["gender"]}
        sort={{ by: "gender", direction: "asc" }}
        onSortChange={onSortChange}
        structureDefinition={sd}
      />,
      { wrapper: wrap() },
    );
    await user.click(screen.getByRole("button", { name: /gender/i }));
    expect(onSortChange).toHaveBeenCalledWith({ by: "gender", direction: "desc" });
  });

  it("renders emptyState when resources is empty", () => {
    render(
      <ResourceTable<Patient>
        resources={[]}
        columns={["gender"]}
        emptyState={<p data-testid="empty">Nothing here</p>}
        structureDefinition={sd}
      />,
      { wrapper: wrap() },
    );
    expect(screen.getByTestId("empty")).toBeInTheDocument();
  });

  it("dispatches choice-typed cells (valueQuantity) to the Quantity renderer", () => {
    const observation: Observation = {
      resourceType: "Observation",
      id: "o1",
      status: "final",
      code: { text: "Heart rate" },
      valueQuantity: {
        value: 72,
        unit: "beats/minute",
        system: "http://unitsofmeasure.org",
        code: "/min",
      },
    };
    render(
      <ResourceTable<Observation>
        resources={[observation]}
        columns={["code.text", "valueQuantity"]}
        columnLabels={{ "code.text": "Observation", valueQuantity: "Value" }}
        structureDefinition={ObservationStructureDefinition}
      />,
      { wrapper: wrap() },
    );
    const row = screen.getByTestId("resource-row");
    // Renders via QuantityRenderer ("72 beats/minute"), not raw JSON.
    expect(within(row).getByText(/72/)).toBeInTheDocument();
    expect(within(row).getByText(/beats\/minute/)).toBeInTheDocument();
    expect(within(row).queryByText(/unitsofmeasure\.org/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/"value":/)).not.toBeInTheDocument();
  });

  it("resolves value[x] per-row to the materialised choice variant", () => {
    const heartRate: Observation = {
      resourceType: "Observation",
      id: "o1",
      status: "final",
      code: { text: "Heart rate" },
      valueQuantity: { value: 72, unit: "beats/minute" },
    };
    const smoking: Observation = {
      resourceType: "Observation",
      id: "o2",
      status: "final",
      code: { text: "Tobacco smoking status NHIS" },
      valueCodeableConcept: {
        coding: [
          { system: "http://snomed.info/sct", code: "266919005", display: "Never smoker" },
        ],
        text: "Never smoker",
      },
    };
    render(
      <ResourceTable<Observation>
        resources={[heartRate, smoking]}
        columns={["code.text", "value[x]"]}
        columnLabels={{ "code.text": "Observation", "value[x]": "Value" }}
        structureDefinition={ObservationStructureDefinition}
      />,
      { wrapper: wrap() },
    );
    const rows = screen.getAllByTestId("resource-row");
    // Quantity variant dispatches to QuantityRenderer.
    expect(within(rows[0]!).getByText(/72/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/beats\/minute/)).toBeInTheDocument();
    // CodeableConcept variant dispatches to CodeableConceptRenderer (text "Never smoker"),
    // not the raw JSON fallback.
    expect(within(rows[1]!).getByText(/Never smoker/)).toBeInTheDocument();
    expect(within(rows[1]!).queryByText(/"coding":/)).not.toBeInTheDocument();
  });

  it("strips array indices when resolving choice variants on nested paths", () => {
    // Indexed-component observation: `component[0].value[x]` has an array
    // index in the runtime path, but StructureDefinition element paths don't
    // (`Observation.component.value[x]`). Without stripping the index before
    // findChoiceVariant, the SD lookup misses and resolvedTypeCode falls back
    // to the header-time default — which for `value[x]` is the first declared
    // variant (Quantity). A CodeableConcept variant would then dispatch to
    // QuantityRenderer and render blank. Use a CodeableConcept value here so
    // this test would fail without index normalisation.
    const observation: Observation = {
      resourceType: "Observation",
      id: "o1",
      status: "final",
      code: { text: "Lab panel" },
      component: [
        {
          code: { text: "Result" },
          valueCodeableConcept: {
            coding: [
              { system: "http://snomed.info/sct", code: "260385009", display: "Negative" },
            ],
            text: "Negative",
          },
        },
      ],
    };
    render(
      <ResourceTable<Observation>
        resources={[observation]}
        columns={["code.text", "component[0].value[x]"]}
        columnLabels={{
          "code.text": "Observation",
          "component[0].value[x]": "Result",
        }}
        structureDefinition={ObservationStructureDefinition}
      />,
      { wrapper: wrap() },
    );
    const row = screen.getByTestId("resource-row");
    // CodeableConceptRenderer surfaces "Negative". The Quantity fallback
    // would render an empty <span> here (no .value/.unit on a CodeableConcept).
    expect(within(row).getByText(/Negative/)).toBeInTheDocument();
  });

  it("renders a card layout on narrow viewports (layout=cards)", () => {
    render(
      <ResourceTable<Patient>
        resources={patients}
        columns={["name", "gender", "birthDate"]}
        structureDefinition={sd}
        layout="cards"
      />,
      { wrapper: wrap() },
    );
    // Each row is now a list item with a label/value pair per column.
    const rows = screen.getAllByTestId("resource-row-card");
    expect(rows).toHaveLength(2);
    // Headers don't render in card mode; instead each cell is paired with
    // its column label inline.
    expect(within(rows[0]!).getByText("Name")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Gender")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Birth Date")).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/Ada Lovelace/)).toBeInTheDocument();
    // No HTML <table> in the DOM.
    expect(document.querySelector("table")).toBeNull();
  });

  it("invokes onRowClick from the card layout via Enter / Space", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    render(
      <ResourceTable<Patient>
        resources={patients}
        columns={["name"]}
        onRowClick={onRowClick}
        structureDefinition={sd}
        layout="cards"
      />,
      { wrapper: wrap() },
    );
    const firstRow = screen.getAllByTestId("resource-row-card")[0]!;
    firstRow.focus();
    await user.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledWith(patients[0]);
  });

  it("falls back to a friendly dash for missing cell values", () => {
    const partial: Patient = { resourceType: "Patient", id: "p3", gender: "other" };
    render(
      <ResourceTable<Patient>
        resources={[partial]}
        columns={["name", "gender"]}
        structureDefinition={sd}
      />,
      { wrapper: wrap() },
    );
    const row = screen.getByTestId("resource-row");
    // Name missing → em-dash placeholder
    expect(within(row).getByText("—")).toBeInTheDocument();
    // Gender present → renders via code renderer
    expect(within(row).getByText("other")).toBeInTheDocument();
  });

  describe("compartment choice-column variants (regression)", () => {
    it("medication[x] — CodeableConcept variant renders medication text", () => {
      const rx: MedicationRequest = {
        resourceType: "MedicationRequest",
        id: "rx1",
        status: "active",
        intent: "order",
        medicationCodeableConcept: { text: "Lisinopril 10mg" },
        subject: { reference: "Patient/p1" },
      };
      render(
        <ResourceTable<MedicationRequest>
          resources={[rx]}
          columns={["status", "medication[x]", "authoredOn"]}
          columnLabels={{ status: "Status", "medication[x]": "Medication", authoredOn: "Ordered" }}
          structureDefinition={MedicationRequestStructureDefinition}
          layout="table"
        />,
        { wrapper: wrap() },
      );
      const row = screen.getByTestId("resource-row");
      expect(within(row).getByText(/Lisinopril 10mg/)).toBeInTheDocument();
      expect(within(row).queryByText(/"text":/)).not.toBeInTheDocument();
    });

    it("medication[x] — Reference variant renders reference display text, not raw JSON", () => {
      const rx: MedicationRequest = {
        resourceType: "MedicationRequest",
        id: "rx2",
        status: "active",
        intent: "order",
        medicationReference: { reference: "Medication/m1", display: "Amoxicillin 500mg capsule" },
        subject: { reference: "Patient/p1" },
      };
      render(
        <ResourceTable<MedicationRequest>
          resources={[rx]}
          columns={["status", "medication[x]", "authoredOn"]}
          columnLabels={{ status: "Status", "medication[x]": "Medication", authoredOn: "Ordered" }}
          structureDefinition={MedicationRequestStructureDefinition}
          layout="table"
        />,
        { wrapper: wrap() },
      );
      const row = screen.getByTestId("resource-row");
      // ReferenceRenderer renders display text, not raw JSON
      expect(within(row).getByText(/Amoxicillin 500mg capsule/)).toBeInTheDocument();
      expect(within(row).queryByText(/"reference":/)).not.toBeInTheDocument();
    });

    it("onset[x] — onsetDateTime variant renders the date string", () => {
      const condition: Condition = {
        resourceType: "Condition",
        id: "c1",
        clinicalStatus: { text: "active" },
        code: { text: "Hypertension" },
        subject: { reference: "Patient/p1" },
        onsetDateTime: "2022-01-15",
      };
      render(
        <ResourceTable<Condition>
          resources={[condition]}
          columns={["clinicalStatus", "code", "onset[x]"]}
          columnLabels={{ clinicalStatus: "Status", code: "Condition", "onset[x]": "Onset" }}
          structureDefinition={ConditionStructureDefinition}
          layout="table"
        />,
        { wrapper: wrap() },
      );
      const row = screen.getByTestId("resource-row");
      // DateTime renderer emits a <time dateTime="..."> element; match by attribute
      // rather than locale-formatted text which is environment-dependent.
      expect(
        within(row).getByText((_c, el) => el?.tagName === "TIME" && el.getAttribute("dateTime") === "2022-01-15"),
      ).toBeInTheDocument();
    });

    it("onset[x] — onsetPeriod variant renders start and end dates, not raw JSON", () => {
      const condition: Condition = {
        resourceType: "Condition",
        id: "c2",
        code: { text: "Seasonal allergy" },
        subject: { reference: "Patient/p1" },
        onsetPeriod: { start: "2023-03-01", end: "2023-05-31" },
      };
      render(
        <ResourceTable<Condition>
          resources={[condition]}
          columns={["clinicalStatus", "code", "onset[x]"]}
          columnLabels={{ clinicalStatus: "Status", code: "Condition", "onset[x]": "Onset" }}
          structureDefinition={ConditionStructureDefinition}
          layout="table"
        />,
        { wrapper: wrap() },
      );
      const row = screen.getByTestId("resource-row");
      // PeriodRenderer shows humanised start and end; the raw ISO is preserved
      // on the <time> element's `dateTime` attribute so downstream consumers
      // (screen readers, scrapers) still see the unaltered FHIR value.
      expect(within(row).getByText(/Mar 1, 2023/)).toBeInTheDocument();
      expect(within(row).getByText(/May 31, 2023/)).toBeInTheDocument();
      expect(
        within(row).getByText((_c, el) => el?.tagName === "TIME" && el.getAttribute("dateTime") === "2023-03-01"),
      ).toBeInTheDocument();
      expect(within(row).queryByText(/"start":/)).not.toBeInTheDocument();
    });

    it("performed[x] — performedDateTime variant renders a humanised date", () => {
      const procedure: Procedure = {
        resourceType: "Procedure",
        id: "proc1",
        status: "completed",
        code: { text: "Appendectomy" },
        subject: { reference: "Patient/p1" },
        performedDateTime: "2021-08-10",
      };
      render(
        <ResourceTable<Procedure>
          resources={[procedure]}
          columns={["status", "code", "performed[x]"]}
          columnLabels={{ status: "Status", code: "Procedure", "performed[x]": "Performed" }}
          structureDefinition={ProcedureStructureDefinition}
          layout="table"
        />,
        { wrapper: wrap() },
      );
      const row = screen.getByTestId("resource-row");
      // Visible text is humanised; the raw ISO is still on the <time>'s
      // `dateTime` attribute for machine consumers (issue #556).
      expect(within(row).getByText(/Aug 10, 2021/)).toBeInTheDocument();
      expect(
        within(row).getByText((_c, el) => el?.tagName === "TIME" && el.getAttribute("dateTime") === "2021-08-10"),
      ).toBeInTheDocument();
    });

    it("performed[x] — performedPeriod variant renders humanised start and end, not raw JSON", () => {
      const procedure: Procedure = {
        resourceType: "Procedure",
        id: "proc2",
        status: "completed",
        code: { text: "Physical therapy" },
        subject: { reference: "Patient/p1" },
        performedPeriod: { start: "2022-02-01", end: "2022-06-30" },
      };
      render(
        <ResourceTable<Procedure>
          resources={[procedure]}
          columns={["status", "code", "performed[x]"]}
          columnLabels={{ status: "Status", code: "Procedure", "performed[x]": "Performed" }}
          structureDefinition={ProcedureStructureDefinition}
          layout="table"
        />,
        { wrapper: wrap() },
      );
      const row = screen.getByTestId("resource-row");
      expect(within(row).getByText(/Feb 1, 2022/)).toBeInTheDocument();
      expect(within(row).getByText(/Jun 30, 2022/)).toBeInTheDocument();
      expect(within(row).queryByText(/"start":/)).not.toBeInTheDocument();
    });

    it("occurrence[x] — occurrenceDateTime variant renders the date string", () => {
      const imm: Immunization = {
        resourceType: "Immunization",
        id: "imm1",
        status: "completed",
        vaccineCode: { text: "Influenza vaccine" },
        patient: { reference: "Patient/p1" },
        occurrenceDateTime: "2023-10-05",
      };
      render(
        <ResourceTable<Immunization>
          resources={[imm]}
          columns={["status", "vaccineCode", "occurrence[x]"]}
          columnLabels={{ status: "Status", vaccineCode: "Vaccine", "occurrence[x]": "Administered" }}
          structureDefinition={ImmunizationStructureDefinition}
          layout="table"
        />,
        { wrapper: wrap() },
      );
      const row = screen.getByTestId("resource-row");
      // DateTime renderer emits a <time dateTime="..."> element; match by attribute.
      expect(
        within(row).getByText((_c, el) => el?.tagName === "TIME" && el.getAttribute("dateTime") === "2023-10-05"),
      ).toBeInTheDocument();
    });

    it("occurrence[x] — occurrenceString variant renders the string value, not raw JSON", () => {
      const imm: Immunization = {
        resourceType: "Immunization",
        id: "imm2",
        status: "completed",
        vaccineCode: { text: "COVID-19 vaccine" },
        patient: { reference: "Patient/p1" },
        occurrenceString: "approximately 2021",
      };
      render(
        <ResourceTable<Immunization>
          resources={[imm]}
          columns={["status", "vaccineCode", "occurrence[x]"]}
          columnLabels={{ status: "Status", vaccineCode: "Vaccine", "occurrence[x]": "Administered" }}
          structureDefinition={ImmunizationStructureDefinition}
          layout="table"
        />,
        { wrapper: wrap() },
      );
      const row = screen.getByTestId("resource-row");
      expect(within(row).getByText(/approximately 2021/)).toBeInTheDocument();
      expect(within(row).queryByText(/"approximately/)).not.toBeInTheDocument();
    });
  });

  describe("responsive layouts", () => {
    it("auto layout (default) renders both a table and a card stack", () => {
      render(
        <ResourceTable<Patient>
          resources={patients}
          columns={["name", "gender"]}
          structureDefinition={sd}
        />,
        { wrapper: wrap() },
      );
      expect(screen.getByTestId("resource-table-table")).toBeInTheDocument();
      expect(screen.getByTestId("resource-table-cards")).toBeInTheDocument();
      // jsdom doesn't apply CSS, so both layouts are in the DOM. Existing
      // unit tests counting `resource-row` still see only the table rows.
      expect(screen.getAllByTestId("resource-row")).toHaveLength(2);
      expect(screen.getAllByTestId("resource-row-card")).toHaveLength(2);
    });

    it('layout="table" omits the card stack entirely', () => {
      render(
        <ResourceTable<Patient>
          resources={patients}
          columns={["name", "gender"]}
          structureDefinition={sd}
          layout="table"
        />,
        { wrapper: wrap() },
      );
      expect(screen.getByTestId("resource-table-table")).toBeInTheDocument();
      expect(screen.queryByTestId("resource-table-cards")).not.toBeInTheDocument();
      expect(screen.queryAllByTestId("resource-row-card")).toHaveLength(0);
    });

    it('layout="cards" omits the table entirely', () => {
      render(
        <ResourceTable<Patient>
          resources={patients}
          columns={["name", "gender"]}
          structureDefinition={sd}
          layout="cards"
        />,
        { wrapper: wrap() },
      );
      expect(screen.queryByTestId("resource-table-table")).not.toBeInTheDocument();
      expect(screen.getByTestId("resource-table-cards")).toBeInTheDocument();
      expect(screen.getAllByTestId("resource-row-card")).toHaveLength(2);
      // No table rows.
      expect(screen.queryAllByTestId("resource-row")).toHaveLength(0);
    });

    it("renders each card as a label/value list and dispatches the same renderers", () => {
      render(
        <ResourceTable<Patient>
          resources={patients}
          columns={["name", "gender", "birthDate"]}
          structureDefinition={sd}
          layout="cards"
        />,
        { wrapper: wrap() },
      );
      const card = screen.getAllByTestId("resource-row-card")[0]!;
      // Labels (column headers) + values render side by side in the dl.
      expect(within(card).getByText("Name")).toBeInTheDocument();
      expect(within(card).getByText(/Ada Lovelace/)).toBeInTheDocument();
      expect(within(card).getByText("Gender")).toBeInTheDocument();
      expect(within(card).getByText("female")).toBeInTheDocument();
      expect(within(card).getByText("Birth Date")).toBeInTheDocument();
      // Dates are humanised by the Date renderer; the raw value stays on
      // the <time>'s `dateTime` attribute.
      expect(within(card).getByText("Dec 10, 1815")).toBeInTheDocument();
      expect(
        within(card).getByText(
          (_c, el) => el?.tagName === "TIME" && el.getAttribute("dateTime") === "1815-12-10",
        ),
      ).toBeInTheDocument();
    });

    it("card rows are keyboard-clickable when onRowClick is set", async () => {
      const onRowClick = vi.fn();
      const user = userEvent.setup();
      render(
        <ResourceTable<Patient>
          resources={patients}
          columns={["name"]}
          structureDefinition={sd}
          layout="cards"
          onRowClick={onRowClick}
        />,
        { wrapper: wrap() },
      );
      const card = screen.getAllByTestId("resource-row-card")[1]!;
      card.focus();
      expect(card.tabIndex).toBe(0);
      await user.keyboard("{Enter}");
      expect(onRowClick).toHaveBeenCalledWith(patients[1]);
    });

    it("dispatches choice-typed cells (valueQuantity) the same way in card layout", () => {
      const observation: Observation = {
        resourceType: "Observation",
        id: "o1",
        status: "final",
        code: { text: "Heart rate" },
        valueQuantity: { value: 86, unit: "beats/minute" },
      };
      render(
        <ResourceTable<Observation>
          resources={[observation]}
          columns={["code.text", "valueQuantity"]}
          columnLabels={{ "code.text": "Observation", valueQuantity: "Value" }}
          structureDefinition={ObservationStructureDefinition}
          layout="cards"
        />,
        { wrapper: wrap() },
      );
      const card = screen.getByTestId("resource-row-card");
      expect(within(card).getByText(/86/)).toBeInTheDocument();
      expect(within(card).getByText(/beats\/minute/)).toBeInTheDocument();
      expect(within(card).queryByText(/"value":/)).not.toBeInTheDocument();
    });
  });
});
