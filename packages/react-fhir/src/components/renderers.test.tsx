import type { CodeableConcept, Meta } from "fhir/r4";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render as rtlRender,
  type RenderOptions,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import {
  codeSystemLabel,
  DEFAULT_CODING_PRIORITY,
  defaultTypeRenderers,
  preferredCoding,
} from "./renderers.js";
import { preloadCoreLookups } from "../structure/core/valuesets.js";

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

describe("CodeableConcept renderer", () => {
  // The definition tooltip test relies on codesystems.generated which is now
  // lazy-loaded.  Preload before the suite so lookupCoreDefinition works.
  beforeAll(() => preloadCoreLookups());

  const renderer = defaultTypeRenderers.CodeableConcept!;
  const ctx = { path: "Observation.code", typeCode: "CodeableConcept" };

  it("renders the text alongside the preferred coding's code", () => {
    const cc: CodeableConcept = {
      text: "Diastolic blood pressure",
      coding: [
        { system: "http://loinc.org", code: "8462-4", display: "Diastolic blood pressure" },
      ],
    };
    const { container } = render(<>{renderer(cc, ctx)}</>);
    expect(container.textContent).toContain("Diastolic blood pressure");
    expect(container.textContent).toContain("8462-4");
    expect(container.textContent).toContain("LOINC");
  });

  it("falls back to plain text when no coding is present", () => {
    const cc: CodeableConcept = { text: "free text only" };
    const { container } = render(<>{renderer(cc, ctx)}</>);
    expect(container.textContent).toBe("free text only");
    expect(container.querySelector("code")).toBeNull();
  });

  it("renders just the coding when text is missing", () => {
    const cc: CodeableConcept = {
      coding: [{ system: "http://loinc.org", code: "8462-4", display: "Diastolic blood pressure" }],
    };
    const { container } = render(<>{renderer(cc, ctx)}</>);
    expect(container.textContent).toContain("Diastolic blood pressure");
    expect(container.textContent).toContain("8462-4");
  });

  it("hides non-preferred codings behind a +N more toggle", () => {
    const cc: CodeableConcept = {
      text: "Diastolic blood pressure",
      coding: [
        { system: "http://loinc.org", code: "8462-4" },
        { system: "http://snomed.info/sct", code: "271650006" },
        { system: "http://example.org/custom", code: "DBP-9" },
      ],
    };
    const { container, getByRole } = render(<>{renderer(cc, ctx)}</>);
    // preferred coding visible
    expect(container.textContent).toContain("8462-4");
    // extras hidden initially
    expect(container.textContent).not.toContain("271650006");
    expect(container.textContent).not.toContain("DBP-9");
    // expand toggle visible
    const toggle = getByRole("button", { name: /show 2 other codings/i });
    expect(toggle.textContent).toBe("+2 more");
    fireEvent.click(toggle);
    // extras now visible
    expect(container.textContent).toContain("271650006");
    expect(container.textContent).toContain("DBP-9");
    expect(toggle.textContent).toBe("hide");
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
    const { container } = render(
      <>{renderer(cc, { ...ctx, path: "AllergyIntolerance.clinicalStatus" })}</>,
    );
    expect(container.textContent).toContain("Active");
    expect(container.querySelector("code")?.textContent).toBe("active");
  });

  it("surfaces the bundled CodeSystem definition in the chip tooltip", () => {
    const cc: CodeableConcept = {
      coding: [
        {
          system:
            "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
          code: "active",
        },
      ],
    };
    const { container } = render(
      <>{renderer(cc, { ...ctx, path: "AllergyIntolerance.clinicalStatus" })}</>,
    );
    const title = container.querySelector("code")?.getAttribute("title") ?? "";
    expect(title).toContain(
      "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical#active",
    );
    expect(title).toContain(
      "The subject is currently experiencing, or is at risk of, a reaction to the identified substance.",
    );
  });

  it("omits the system label in the pill for unknown code systems", () => {
    const cc: CodeableConcept = {
      coding: [
        {
          system:
            "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
          code: "active",
        },
      ],
    };
    const { container } = render(<>{renderer(cc, { ...ctx, path: "AllergyIntolerance.clinicalStatus" })}</>);
    const chip = container.querySelector("code");
    expect(chip?.textContent).toBe("active");
    expect(chip?.getAttribute("title")).toContain(
      "allergyintolerance-clinical",
    );
  });

  it("does not render the toggle when there is only one coding", () => {
    const cc: CodeableConcept = {
      text: "Diastolic blood pressure",
      coding: [{ system: "http://loinc.org", code: "8462-4" }],
    };
    const { container } = render(<>{renderer(cc, ctx)}</>);
    expect(container.querySelector("button")).toBeNull();
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
