import type { CodeableConcept, Dosage, Meta } from "fhir/r4";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render as rtlRender,
  type RenderOptions,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  codeSystemLabel,
  DEFAULT_CODING_PRIORITY,
  defaultTypeRenderers,
  preferredCoding,
} from "./renderers.js";

// CodeChip uses useCodeLookup → useQuery, so every renderer that may emit a
// chip needs to render inside a QueryClientProvider. Tests don't configure a
// FhirClientProvider so the lookup query is automatically disabled.
function render(ui: ReactElement, options?: RenderOptions) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return rtlRender(ui, { wrapper: Wrapper, ...options });
}

describe("codeSystemLabel", () => {
  it("returns a short label for well-known code systems", () => {
    expect(codeSystemLabel("http://snomed.info/sct")).toBe("SNOMED");
    expect(codeSystemLabel("http://loinc.org")).toBe("LOINC");
    expect(codeSystemLabel("http://www.ama-assn.org/go/cpt")).toBe("CPT");
    expect(codeSystemLabel("http://hl7.org/fhir/sid/icd-10-cm")).toBe("ICD-10-CM");
    expect(codeSystemLabel("http://www.nlm.nih.gov/research/umls/rxnorm")).toBe("RxNorm");
  });

  it("returns the last URL segment for unknown systems", () => {
    expect(codeSystemLabel("http://example.org/fhir/custom-codes")).toBe(
      "custom-codes",
    );
  });

  it("returns '' for undefined", () => {
    expect(codeSystemLabel(undefined)).toBe("");
  });
});

describe("preferredCoding", () => {
  const icd10: CodeableConcept = {
    coding: [
      { system: "http://snomed.info/sct", code: "73211009", display: "Diabetes mellitus" },
      { system: "http://hl7.org/fhir/sid/icd-10-cm", code: "E11.9", display: "Type 2 DM" },
    ],
  };

  it("picks ICD-10-CM first for Condition.code", () => {
    const chosen = preferredCoding(icd10, "Condition.code");
    expect(chosen?.system).toBe("http://hl7.org/fhir/sid/icd-10-cm");
    expect(chosen?.code).toBe("E11.9");
  });

  it("picks CPT first for Procedure.code", () => {
    const cc: CodeableConcept = {
      coding: [
        { system: "http://snomed.info/sct", code: "387713003" },
        { system: "http://www.ama-assn.org/go/cpt", code: "45378", display: "Colonoscopy" },
      ],
    };
    const chosen = preferredCoding(cc, "Procedure.code");
    expect(chosen?.system).toBe("http://www.ama-assn.org/go/cpt");
  });

  it("picks LOINC first for Observation.code", () => {
    const cc: CodeableConcept = {
      coding: [
        { system: "http://snomed.info/sct", code: "271649006" },
        { system: "http://loinc.org", code: "8480-6", display: "Systolic BP" },
      ],
    };
    const chosen = preferredCoding(cc, "Observation.code");
    expect(chosen?.system).toBe("http://loinc.org");
  });

  it("picks RxNorm first for MedicationRequest.medicationCodeableConcept", () => {
    const cc: CodeableConcept = {
      coding: [
        { system: "http://hl7.org/fhir/sid/ndc", code: "00093-7155-56" },
        { system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "314076" },
      ],
    };
    const chosen = preferredCoding(cc, "MedicationRequest.medicationCodeableConcept");
    expect(chosen?.system).toBe("http://www.nlm.nih.gov/research/umls/rxnorm");
  });

  it("falls back to SNOMED, then LOINC, when no path-specific priority matches", () => {
    const cc: CodeableConcept = {
      coding: [
        { system: "http://example.org/custom", code: "x" },
        { system: "http://loinc.org", code: "12345-6" },
        { system: "http://snomed.info/sct", code: "999" },
      ],
    };
    expect(preferredCoding(cc, "Some.Unknown.path")?.system).toBe(
      "http://snomed.info/sct",
    );
  });

  it("returns the first coding when nothing matches any priority", () => {
    const cc: CodeableConcept = {
      coding: [
        { system: "http://example.org/one", code: "a" },
        { system: "http://example.org/two", code: "b" },
      ],
    };
    expect(preferredCoding(cc, "Some.path")?.code).toBe("a");
  });

  it("returns undefined when there is no coding", () => {
    expect(preferredCoding(undefined, "Any.path")).toBeUndefined();
    expect(preferredCoding({ text: "only text" }, "Any.path")).toBeUndefined();
    expect(preferredCoding({ coding: [] }, "Any.path")).toBeUndefined();
  });
});

describe("CodeableConcept renderer (CodedValue)", () => {
  const renderer = defaultTypeRenderers.CodeableConcept!;
  const ctx = { path: "Observation.code", typeCode: "CodeableConcept" };

  // The popover only mounts on hover/focus to keep the chip's text from
  // duplicating into the accessibility tree. Tests use this helper to open
  // the popover before asserting on its contents.
  function openPopover(testIdRoot: HTMLElement) {
    const wrapper = testIdRoot.querySelector(
      '[data-testid="coded-value"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(wrapper);
  }

  it("renders the text label and the primary coding's code on the chip", () => {
    const cc: CodeableConcept = {
      text: "Diastolic blood pressure",
      coding: [
        { system: "http://loinc.org", code: "8462-4", display: "Diastolic blood pressure" },
      ],
    };
    const { getByTestId } = render(<>{renderer(cc, ctx)}</>);
    expect(getByTestId("coded-value-label").textContent).toBe(
      "Diastolic blood pressure",
    );
    expect(getByTestId("coded-value-code").textContent).toBe("8462-4");
  });

  it("renders the popover text section on hover when CodeableConcept.text is set", () => {
    const cc: CodeableConcept = {
      text: "Diastolic blood pressure",
      coding: [{ system: "http://loinc.org", code: "8462-4" }],
    };
    const { container, getByTestId, queryByTestId } = render(
      <>{renderer(cc, ctx)}</>,
    );
    expect(queryByTestId("coded-value-popover-text")).toBeNull();
    openPopover(container);
    expect(getByTestId("coded-value-popover-text").textContent).toBe(
      "Diastolic blood pressure",
    );
  });

  it("renders an em-dash when neither text nor coding is present", () => {
    const cc: CodeableConcept = {};
    const { container } = render(<>{renderer(cc, ctx)}</>);
    expect(container.textContent).toBe("—");
  });

  it("falls back to plain text when no coding is present", () => {
    const cc: CodeableConcept = { text: "free text only" };
    const { getByTestId } = render(<>{renderer(cc, ctx)}</>);
    expect(getByTestId("coded-value-label").textContent).toBe("free text only");
  });

  it("renders just the coding when text is missing", () => {
    const cc: CodeableConcept = {
      coding: [{ system: "http://loinc.org", code: "8462-4", display: "Diastolic blood pressure" }],
    };
    const { getByTestId } = render(<>{renderer(cc, ctx)}</>);
    expect(getByTestId("coded-value-label").textContent).toBe(
      "Diastolic blood pressure",
    );
    expect(getByTestId("coded-value-code").textContent).toBe("8462-4");
  });

  it("shows a +N indicator when there is more than one coding", () => {
    const cc: CodeableConcept = {
      coding: [
        { system: "http://loinc.org", code: "8462-4" },
        { system: "http://snomed.info/sct", code: "271650006" },
      ],
    };
    const { getByTestId } = render(<>{renderer(cc, ctx)}</>);
    expect(getByTestId("coded-value-extra-count").textContent).toBe("+1");
  });

  it("tucks unknown-system codings into a collapsed expander", () => {
    const cc: CodeableConcept = {
      text: "Diastolic blood pressure",
      coding: [
        { system: "http://loinc.org", code: "8462-4" },
        { system: "http://snomed.info/sct", code: "271650006" },
        { system: "http://example.org/custom", code: "DBP-9" },
      ],
    };
    const { container, getByTestId } = render(<>{renderer(cc, ctx)}</>);
    openPopover(container);
    // The unknown coding (DBP-9) lives behind the expander.
    expect(container.textContent).not.toContain("DBP-9");
    const toggle = getByTestId("coded-value-other-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Both known LOINC + SNOMED codings are listed in the popover body.
    expect(container.textContent).toContain("271650006");
    expect(container.textContent).toContain("8462-4");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("DBP-9");
  });

  it("falls back to the bundled display when Coding.display is missing", () => {
    const cc: CodeableConcept = {
      coding: [
        {
          system:
            "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
          code: "active",
        },
      ],
    };
    const { getByTestId } = render(
      <>{renderer(cc, { ...ctx, path: "AllergyIntolerance.clinicalStatus" })}</>,
    );
    expect(getByTestId("coded-value-label").textContent).toBe("Active");
    expect(getByTestId("coded-value-code").textContent).toBe("active");
  });

  it("surfaces the bundled CodeSystem definition in the popover on hover", () => {
    const cc: CodeableConcept = {
      coding: [
        {
          system:
            "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
          code: "active",
        },
      ],
    };
    const { container, getByTestId } = render(
      <>{renderer(cc, { ...ctx, path: "AllergyIntolerance.clinicalStatus" })}</>,
    );
    openPopover(container);
    expect(getByTestId("coded-value-definition").textContent).toContain(
      "The subject is currently experiencing, or is at risk of, a reaction to the identified substance.",
    );
  });

  it("renders the friendly system pill for known systems on hover", () => {
    const cc: CodeableConcept = {
      coding: [
        {
          system:
            "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
          code: "active",
        },
      ],
    };
    const { container, getByTestId } = render(
      <>{renderer(cc, { ...ctx, path: "AllergyIntolerance.clinicalStatus" })}</>,
    );
    openPopover(container);
    expect(getByTestId("coded-value-system-pill").textContent).toContain(
      "HL7 AllergyIntolerance Clinical",
    );
  });

  it("does not render the +N indicator when there is only one coding", () => {
    const cc: CodeableConcept = {
      text: "Diastolic blood pressure",
      coding: [{ system: "http://loinc.org", code: "8462-4" }],
    };
    const { container, queryByTestId } = render(<>{renderer(cc, ctx)}</>);
    expect(queryByTestId("coded-value-extra-count")).toBeNull();
    openPopover(container);
    // No hidden band when every coding belongs to a known system.
    expect(queryByTestId("coded-value-hidden-band")).toBeNull();
  });

  it("renders a tone dot when ctx.tone is set", () => {
    const cc: CodeableConcept = {
      coding: [{ system: "http://loinc.org", code: "8462-4" }],
    };
    const { container } = render(
      <>{renderer(cc, { ...ctx, tone: "success" })}</>,
    );
    // Tone is opt-in via the context — the dot ships as the first child
    // before the label inside the chip.
    const chip = container.querySelector('[data-testid="coded-value-chip"]');
    expect(chip?.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("closes the popover on mouseleave and resets the expander state", () => {
    const cc: CodeableConcept = {
      text: "Diastolic blood pressure",
      coding: [
        { system: "http://loinc.org", code: "8462-4" },
        { system: "http://example.org/custom", code: "DBP-9" },
      ],
    };
    const { container, queryByTestId, getByTestId } = render(
      <>{renderer(cc, ctx)}</>,
    );
    const wrapper = container.querySelector(
      '[data-testid="coded-value"]',
    ) as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    fireEvent.click(getByTestId("coded-value-other-toggle"));
    expect(
      getByTestId("coded-value-other-toggle").getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.mouseLeave(wrapper);
    expect(queryByTestId("coded-value-popover")).toBeNull();
    fireEvent.mouseEnter(wrapper);
    expect(
      getByTestId("coded-value-other-toggle").getAttribute("aria-expanded"),
    ).toBe("false");
  });
});

describe("Meta renderer", () => {
  const renderer = defaultTypeRenderers.Meta!;
  const ctx = { path: "Patient.meta", typeCode: "Meta" };

  it("renders a summary line with versionId, lastUpdated, and source", () => {
    const m: Meta = {
      versionId: "1",
      lastUpdated: "2026-02-10T17:48:37.700+00:00",
      source: "#wiWDxr1Jk1z1zMIZ",
    };
    const { container } = render(<>{renderer(m, ctx)}</>);
    const summary = container.querySelector("summary");
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain("v1");
    expect(summary!.textContent).toContain("2026-02-10T17:48:37.700+00:00");
    expect(summary!.textContent).toContain("#wiWDxr1Jk1z1zMIZ");
  });

  it("exposes one row per Meta field inside the expandable", () => {
    const m: Meta = {
      versionId: "3",
      lastUpdated: "2026-02-10T17:48:37.700+00:00",
      source: "#abc",
      profile: ["http://hl7.org/fhir/StructureDefinition/Patient"],
      security: [{ system: "http://example.org/sec", code: "TOP" }],
      tag: [{ system: "http://example.org/tag", code: "demo" }],
    };
    const { container } = render(<>{renderer(m, ctx)}</>);
    const labels = Array.from(container.querySelectorAll("dt")).map((n) => n.textContent);
    expect(labels).toEqual([
      "Version Id",
      "Last Updated",
      "Source",
      "Profile",
      "Security",
      "Tag",
    ]);
    expect(container.textContent).toContain("http://hl7.org/fhir/StructureDefinition/Patient");
    expect(container.textContent).toContain("TOP");
    expect(container.textContent).toContain("demo");
  });

  it("toggles open and closed via the summary element", () => {
    const m: Meta = { versionId: "1", lastUpdated: "2026-02-10T17:48:37.700+00:00" };
    const { container } = render(<>{renderer(m, ctx)}</>);
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(container.querySelector("summary")!);
    expect(details.open).toBe(true);
  });

  it("hides rows for fields that are absent", () => {
    const m: Meta = { versionId: "1" };
    const { container } = render(<>{renderer(m, ctx)}</>);
    const labels = Array.from(container.querySelectorAll("dt")).map((n) => n.textContent);
    expect(labels).toEqual(["Version Id"]);
  });

  it("renders an em-dash when there are no fields", () => {
    const { container } = render(<>{renderer({} as Meta, ctx)}</>);
    expect(container.querySelector("details")).toBeNull();
    expect(container.textContent).toBe("—");
  });
});

describe("DEFAULT_CODING_PRIORITY", () => {
  it("covers the common clinical paths", () => {
    const paths = Object.keys(DEFAULT_CODING_PRIORITY);
    expect(paths).toContain("Condition.code");
    expect(paths).toContain("Procedure.code");
    expect(paths).toContain("Observation.code");
    expect(paths).toContain("MedicationRequest.medicationCodeableConcept");
    expect(paths).toContain("AllergyIntolerance.code");
    expect(paths).toContain("Immunization.vaccineCode");
  });
});

describe("Dosage renderer", () => {
  const renderer = defaultTypeRenderers.Dosage!;
  const ctx = { path: "MedicationStatement.dosage", typeCode: "Dosage" };

  it("shows the authored text as the headline and a structured breakdown", () => {
    const d: Dosage = {
      text: "1 tab twice daily",
      timing: { repeat: { frequency: 2, period: 1, periodUnit: "d" } },
      doseAndRate: [
        {
          doseQuantity: {
            value: 1,
            unit: "tablet",
            system: "http://snomed.info/sct",
            code: "428673006",
          },
        },
      ],
    };
    const { container } = render(<>{renderer(d, ctx)}</>);
    expect(container.textContent).toContain("1 tab twice daily");
    expect(container.textContent).toContain("Dose");
    expect(container.textContent).toContain("1 tablet");
    expect(container.textContent).toContain("Schedule");
    expect(container.textContent).toContain("2 times per day");
  });

  it("synthesises a headline when no text is present", () => {
    const d: Dosage = {
      route: { text: "oral" },
      doseAndRate: [{ doseQuantity: { value: 400, unit: "mg" } }],
      asNeededBoolean: true,
    };
    const { container } = render(<>{renderer(d, ctx)}</>);
    expect(container.textContent).toContain("400 mg oral, as needed");
    expect(container.textContent).toContain("Route");
  });

  it("shows the dosage step number from Dosage.sequence", () => {
    const { container } = render(
      <>{renderer({ sequence: 2, text: "then..." } as Dosage, ctx)}</>,
    );
    expect(container.textContent).toContain("Step");
    expect(container.textContent).toContain("2");
  });

  it("labels dose/rate rows with their doseAndRate.type", () => {
    const d: Dosage = {
      text: "infusion",
      doseAndRate: [
        { type: { text: "ordered" }, doseQuantity: { value: 500, unit: "mg" } },
        { type: { text: "calculated" }, doseQuantity: { value: 480, unit: "mg" } },
      ],
    };
    const { container } = render(<>{renderer(d, ctx)}</>);
    expect(container.textContent).toContain("Dose (ordered)");
    expect(container.textContent).toContain("Dose (calculated)");
  });

  it("surfaces bounds variants and the lifetime max dose", () => {
    const duration: Dosage = {
      text: "course",
      timing: { repeat: { boundsDuration: { value: 10, unit: "days" } } },
      maxDosePerLifetime: { value: 4, unit: "g" },
    };
    const a = render(<>{renderer(duration, ctx)}</>);
    expect(a.container.textContent).toContain("Duration");
    expect(a.container.textContent).toContain("10");
    expect(a.container.textContent).toContain("Max / lifetime");
    expect(a.container.textContent).toContain("4");

    const range: Dosage = {
      text: "course",
      timing: { repeat: { boundsRange: { low: { value: 7, unit: "d" }, high: { value: 14, unit: "d" } } } },
    };
    const b = render(<>{renderer(range, ctx)}</>);
    expect(b.container.textContent).toContain("Duration");
    expect(b.container.textContent).toContain("7");
    expect(b.container.textContent).toContain("14");
  });

  it("renders an em-dash for an empty dosage", () => {
    const { container } = render(<>{renderer({} as Dosage, ctx)}</>);
    expect(container.textContent).toBe("—");
  });
});

describe("Timing renderer", () => {
  const renderer = defaultTypeRenderers.Timing!;
  const ctx = { path: "ServiceRequest.occurrenceTiming", typeCode: "Timing" };

  it("renders a plain-English summary", () => {
    const { container } = render(
      <>{renderer({ repeat: { frequency: 1, period: 8, periodUnit: "h" } }, ctx)}</>,
    );
    expect(container.textContent).toBe("once every 8 hours");
  });

  it("renders an em-dash when empty", () => {
    const { container } = render(<>{renderer({}, ctx)}</>);
    expect(container.textContent).toBe("—");
  });
});
