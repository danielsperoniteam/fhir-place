import { describe, expect, it } from "vitest";
import { labelFromPath, labelsForPaths, paramsFromUrl } from "./ResourceListPage.js";

// Regression for the #145 review finding: repeated FHIR params
// (identifier=a&identifier=b — AND semantics) must survive URL→search
// hydration instead of collapsing to the last value.
describe("paramsFromUrl", () => {
  it("collapses repeated keys to arrays and keeps single keys as strings", () => {
    const url = new URLSearchParams("identifier=a&identifier=b&gender=female");
    expect(paramsFromUrl(url, 20)).toEqual({
      _count: 20,
      identifier: ["a", "b"],
      gender: "female",
    });
  });

  it("still injects the patient compartment id and page size", () => {
    const url = new URLSearchParams("patient=ignored&name=smith");
    expect(paramsFromUrl(url, 10, "ada")).toEqual({
      _count: 10,
      name: "smith",
      patient: "ada",
    });
  });
});

// Regression for #400: `labelFromPath` previously picked the last dotted
// segment unconditionally, so any path ending in a FHIR structural element
// (`reference`, `display`, `code`, `system`, `value`, `text`, `coding`)
// got a generic label. CommunicationRequest auto-derived columns ended
// up with three "Reference" headers and a bare "System".
describe("labelFromPath", () => {
  it("returns the humanized segment for a single-segment path", () => {
    expect(labelFromPath("status")).toBe("Status");
    expect(labelFromPath("id")).toBe("Id");
  });

  it("splits camelCase parent on word boundaries", () => {
    expect(labelFromPath("basedOn")).toBe("Based On");
    expect(labelFromPath("partOf")).toBe("Part Of");
  });

  it("uses the parent segment when the leaf is a structural FHIR element", () => {
    expect(labelFromPath("basedOn.reference")).toBe("Based On");
    expect(labelFromPath("partOf.reference")).toBe("Part Of");
    expect(labelFromPath("subject.reference")).toBe("Subject");
    expect(labelFromPath("recipient.display")).toBe("Recipient");
  });

  it("walks past multiple structural segments for deeply nested coding paths", () => {
    expect(labelFromPath("category.coding.system")).toBe("Category");
    expect(labelFromPath("category.coding.code")).toBe("Category");
    expect(labelFromPath("category.coding.display")).toBe("Category");
  });

  it("strips choice-type `[x]` suffix from the leaf segment", () => {
    expect(labelFromPath("value[x]")).toBe("Value");
    expect(labelFromPath("Observation.effective[x]")).toBe("Effective");
  });

  it("strips numeric array indices from path segments", () => {
    expect(labelFromPath("name[0].family")).toBe("Family");
    expect(labelFromPath("basedOn[0].reference")).toBe("Based On");
    expect(labelFromPath("category[0].coding[1].system")).toBe("Category");
  });

  it("falls back to the leaf when every segment is structural", () => {
    // Defensive: a path like a bare `reference` shouldn't disappear.
    expect(labelFromPath("reference")).toBe("Reference");
  });
});

describe("labelsForPaths", () => {
  it("preserves a single-segment label when there are no collisions", () => {
    expect(labelsForPaths(["status", "id", "subject.reference"])).toEqual({
      status: "Status",
      id: "Id",
      "subject.reference": "Subject",
    });
  });

  it("disambiguates sibling coding leaves with the structural leaf as a suffix", () => {
    // Two sibling coding fields would both collapse to "Category".
    // Once collision is detected, qualify each with its actual leaf so
    // the user can tell `.system` from `.code`.
    const result = labelsForPaths([
      "category.coding.system",
      "category.coding.code",
    ]);
    expect(result["category.coding.system"]).toBe("Category System");
    expect(result["category.coding.code"]).toBe("Category Code");
  });

  it("disambiguates with the next-outer domain segment when one is available", () => {
    // Two different parents collapse to the same primary "Reference"
    // (defensive case — `labelFromPath` already prefers the parent, so
    // the realistic collision is two different parents with identical
    // names from different sub-trees).
    const result = labelsForPaths(["a.subject.reference", "b.subject.reference"]);
    expect(result["a.subject.reference"]).toBe("A Subject");
    expect(result["b.subject.reference"]).toBe("B Subject");
  });

  it("disambiguates the first-seen path retroactively, not just later ones", () => {
    // The first path produced "Status" plainly; once a second "Status"
    // shows up, both should be qualified, otherwise the first one stays
    // bare and the user still can't tell them apart.
    const result = labelsForPaths(["a.status", "b.status"]);
    expect(result["a.status"]).not.toBe(result["b.status"]);
    expect(result["a.status"]).toBe("A Status");
    expect(result["b.status"]).toBe("B Status");
  });

  it("keeps non-colliding labels unchanged when others collide", () => {
    const result = labelsForPaths([
      "status",
      "basedOn.reference",
      "partOf.reference",
      "id",
    ]);
    expect(result.status).toBe("Status");
    expect(result.id).toBe("Id");
    expect(result["basedOn.reference"]).toBe("Based On");
    expect(result["partOf.reference"]).toBe("Part Of");
  });
});
