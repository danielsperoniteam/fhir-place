import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AgentAnswerRenderer } from "./AgentAnswerRenderer.js";
import { SAMPLE_AGENT_ANSWER } from "./fixtures.js";
import type { AgentAnswer } from "./answer-schema.js";

function render(answer: AgentAnswer): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AgentAnswerRenderer answer={answer} />
    </MemoryRouter>,
  );
}

describe("AgentAnswerRenderer", () => {
  it("renders the prompt, summary, and section counts", () => {
    const html = render(SAMPLE_AGENT_ANSWER);
    expect(html).toContain("Summarise this patient.");
    expect(html).toContain("78-year-old female");
    expect(html).toMatch(/data-testid="claims-section"/);
    expect(html).toMatch(/data-testid="missing-data-section"/);
    expect(html).toMatch(/data-testid="cannot-determine-section"/);
    expect(html).toMatch(/data-testid="tool-calls-section"/);
  });

  it("renders one <li data-testid=claim> per supported claim", () => {
    const html = render(SAMPLE_AGENT_ANSWER);
    const matches = html.match(/data-testid="claim"/g);
    expect(matches).toHaveLength(SAMPLE_AGENT_ANSWER.claims.length);
  });

  it("links every evidence chip to the resource viewer", () => {
    const html = render(SAMPLE_AGENT_ANSWER);
    expect(html).toContain(
      'href="/connections/conn-sample/patients/pat-sample/Condition/cond-dm2"',
    );
    expect(html).toContain(
      'href="/connections/conn-sample/patients/pat-sample/MedicationRequest/mr-metformin"',
    );
    expect(html).toContain(
      'href="/connections/conn-sample/patients/pat-sample/Encounter/enc-2024-10"',
    );
  });

  it(
    "renders missing-data and cannot-determine entries (first-class, not " +
      "buried in a free-text blob)",
    () => {
      const html = render(SAMPLE_AGENT_ANSWER);
      expect(html).toContain("no allergy data recorded");
      expect(html).toContain("Is the patient&#x27;s diabetes well controlled?");
    },
  );

  it("renders an empty-state hint when a section has zero entries", () => {
    const blank: AgentAnswer = {
      ...SAMPLE_AGENT_ANSWER,
      claims: [],
      missingData: [],
      cannotDetermine: [],
      toolCalls: [],
    };
    const html = render(blank);
    expect(html).toContain('data-testid="claims-section-empty"');
    expect(html).toContain('data-testid="missing-data-section-empty"');
    expect(html).toContain('data-testid="cannot-determine-section-empty"');
    expect(html).toContain('data-testid="tool-calls-section-empty"');
  });

  it("shows ok / error badges in the tool-call timeline", () => {
    const answer: AgentAnswer = {
      ...SAMPLE_AGENT_ANSWER,
      toolCalls: [
        {
          tool: "getPatient",
          toolVersion: "1",
          ok: true,
          durationMs: 5,
        },
        {
          tool: "searchObservationsForPatient",
          toolVersion: "1",
          ok: false,
          reason: "upstream_error",
          durationMs: 9,
        },
      ],
    };
    const html = render(answer);
    expect(html).toContain("ok ·");
    expect(html).toContain("upstream_error · 9ms");
  });

  it("never renders raw Markdown — supported claims appear as text + chips", () => {
    const html = render(SAMPLE_AGENT_ANSWER);
    expect(html).not.toContain("**");
    expect(html).not.toContain("#### ");
  });
});
