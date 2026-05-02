import type { CodeableConcept } from "fhir/r4";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  codeSystemLabel,
  DEFAULT_CODING_PRIORITY,
  defaultTypeRenderers,
  preferredCoding,
} from "./renderers.js";

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

  it("does not render the toggle when there is only one coding", () => {
    const cc: CodeableConcept = {
      text: "Diastolic blood pressure",
      coding: [{ system: "http://loinc.org", code: "8462-4" }],
    };
    const { container } = render(<>{renderer(cc, ctx)}</>);
    expect(container.querySelector("button")).toBeNull();
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
