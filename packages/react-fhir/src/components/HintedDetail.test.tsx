import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { AllergyIntolerance } from "fhir/r4";
import { describe, expect, it } from "vitest";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { FhirClientProvider } from "../hooks/FhirClientProvider.js";
import { AllergyIntoleranceStructureDefinition } from "../../test/fixtures/StructureDefinition-AllergyIntolerance.js";
import { getLayoutHint } from "../layout-hints/hints.js";
import { HintedDetail } from "./HintedDetail.js";

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

const allergy: AllergyIntolerance = {
  resourceType: "AllergyIntolerance",
  id: "peanut",
  clinicalStatus: {
    coding: [
      {
        system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
        code: "active",
        display: "Active",
      },
    ],
  },
  verificationStatus: {
    coding: [
      {
        system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
        code: "confirmed",
        display: "Confirmed",
      },
    ],
  },
  type: "allergy",
  category: ["food"],
  criticality: "high",
  code: {
    text: "Peanut",
    coding: [{ system: "http://snomed.info/sct", code: "227493005", display: "Peanut" }],
  },
  patient: { reference: "Patient/ada", display: "Ada Lovelace" },
  recordedDate: "2024-01-15",
  reaction: [
    {
      manifestation: [{ text: "Hives" }],
      severity: "moderate",
    },
  ],
};

describe("HintedDetail", () => {
  it("renders the hero row with declared fields", () => {
    const hint = getLayoutHint("AllergyIntolerance")!;
    wrap(
      <HintedDetail
        resource={allergy}
        hint={hint}
        structureDefinition={AllergyIntoleranceStructureDefinition}
      />,
    );
    const hero = screen.getByTestId("hinted-detail-hero");
    expect(hero).toBeInTheDocument();
    // code / clinicalStatus in hero; criticality moves to Reactions section
    expect(screen.getByTestId("hinted-detail-hero-code")).toBeInTheDocument();
    expect(screen.getByTestId("hinted-detail-hero-clinicalStatus")).toBeInTheDocument();
    // criticality is surfaced in the dedicated Reactions section, not the hero
    expect(screen.queryByTestId("hinted-detail-hero-criticality")).not.toBeInTheDocument();
  });

  it("renders sections with field labels and values", () => {
    const hint = getLayoutHint("AllergyIntolerance")!;
    wrap(
      <HintedDetail
        resource={allergy}
        hint={hint}
        structureDefinition={AllergyIntoleranceStructureDefinition}
      />,
    );
    expect(screen.getByTestId("hinted-detail-section-subject")).toBeInTheDocument();
    expect(screen.getByTestId("hinted-detail-section-classification")).toBeInTheDocument();
    expect(screen.getByText("Patient")).toBeInTheDocument();
    expect(screen.getByText("Recorded Date")).toBeInTheDocument();
  });

  it("surfaces high criticality with reaction context without raw JSON", () => {
    const hint = getLayoutHint("AllergyIntolerance")!;
    wrap(
      <HintedDetail
        resource={allergy}
        hint={hint}
        structureDefinition={AllergyIntoleranceStructureDefinition}
      />,
    );

    const reactions = screen.getByTestId("hinted-detail-section-reactions");
    expect(within(reactions).getByText("criticality: high")).toBeInTheDocument();
    expect(within(reactions).getByText("Hives")).toBeInTheDocument();
    expect(
      within(reactions).getByText(/developer-tool warning, not clinical decision support/),
    ).toBeInTheDocument();
    expect(within(reactions).queryByText(/"manifestation"/)).not.toBeInTheDocument();
  });

  it("keeps reaction plus verificationStatus visible when criticality is missing", () => {
    const hint = getLayoutHint("AllergyIntolerance")!;
    const withoutCriticality: AllergyIntolerance = {
      ...allergy,
      criticality: undefined,
    };
    wrap(
      <HintedDetail
        resource={withoutCriticality}
        hint={hint}
        structureDefinition={AllergyIntoleranceStructureDefinition}
      />,
    );

    const reactions = screen.getByTestId("hinted-detail-section-reactions");
    expect(within(reactions).queryByText(/criticality:/)).not.toBeInTheDocument();
    expect(within(reactions).getByText("Confirmed")).toBeInTheDocument();
    expect(within(reactions).getByText("Hives")).toBeInTheDocument();
  });

  it("skips fields that are absent from the resource", () => {
    const hint = getLayoutHint("AllergyIntolerance")!;
    const sparse: AllergyIntolerance = {
      resourceType: "AllergyIntolerance",
      id: "x",
      patient: { reference: "Patient/ada" },
    };
    wrap(
      <HintedDetail
        resource={sparse}
        hint={hint}
        structureDefinition={AllergyIntoleranceStructureDefinition}
      />,
    );
    // Hero is rendered but every individual hero field is missing → no
    // hero spans render.
    expect(screen.queryByTestId("hinted-detail-hero-code")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hinted-detail-hero-clinicalStatus")).not.toBeInTheDocument();
    // The Reactions guardrail section also does not render when none of its
    // fields (criticality, verificationStatus, reaction) are present.
    expect(
      screen.queryByTestId("hinted-detail-section-reactions"),
    ).not.toBeInTheDocument();
    // Sections without any present fields collapse entirely.
    expect(
      screen.queryByTestId("hinted-detail-section-classification"),
    ).not.toBeInTheDocument();
    // The Subject section still renders because `patient` is present.
    expect(screen.getByTestId("hinted-detail-section-subject")).toBeInTheDocument();
  });

  it("renders nothing when the hint has no detail block", () => {
    const { container } = wrap(<HintedDetail resource={allergy} hint={{}} />);
    expect(container.firstChild).toBeNull();
  });
});
