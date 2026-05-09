import rootReadme from "../../../../../README.md?raw";
import demoReadme from "../../../README.md?raw";
import reactFhirReadme from "../../../../../packages/react-fhir/README.md?raw";
import goalsTasksReadme from "../../../../../apps/goals-tasks/README.md?raw";

import fhirServerSetup from "../../../../../docs/fhir-server-setup.md?raw";
import qaAgent from "../../../../../docs/qa-agent.md?raw";
import testPatientStrategy from "../../../../../docs/test-patient-strategy.md?raw";
import testPlanFhirUi from "../../../../../docs/test-plan-fhir-ui.md?raw";

import adr0001 from "../../../../../docs/decisions/0001-use-github-issues-as-source-of-truth.md?raw";
import adr0002 from "../../../../../docs/decisions/0002-use-linear-only-if-github-projects-break-down.md?raw";
import adr0003 from "../../../../../docs/decisions/0003-agent-safety-rules.md?raw";
import adr0004 from "../../../../../docs/decisions/0004-positioning.md?raw";
import adr0005 from "../../../../../docs/decisions/0005-competitive-analysis-response.md?raw";

import sdlcReadme from "../../../../../docs/sdlc/README.md?raw";
import sdlcAgents from "../../../../../docs/sdlc/agents.md?raw";
import sdlcLifecycle from "../../../../../docs/sdlc/lifecycle.md?raw";
import sdlcLoops from "../../../../../docs/sdlc/loops.md?raw";
import sdlcSafety from "../../../../../docs/sdlc/safety.md?raw";
import sdlcGaps from "../../../../../docs/sdlc/gaps.md?raw";

import spikePackageBoundaries from "../../../../../docs/spikes/package-vs-demo-boundaries.md?raw";
import spikeProfileCodegen from "../../../../../docs/spikes/profile-codegen.md?raw";

export type DocCategory =
  | "Overview"
  | "Guides"
  | "Architecture decisions"
  | "SDLC"
  | "Spikes";

export interface DocEntry {
  slug: string;
  title: string;
  category: DocCategory;
  source: string;
  content: string;
}

export const DOCS: DocEntry[] = [
  // Overview
  {
    slug: "overview",
    title: "fhir-place — overview",
    category: "Overview",
    source: "README.md",
    content: rootReadme,
  },
  {
    slug: "demo-app",
    title: "Demo app (fhir-ui)",
    category: "Overview",
    source: "apps/demo/README.md",
    content: demoReadme,
  },
  {
    slug: "react-fhir",
    title: "@fhir-place/react-fhir",
    category: "Overview",
    source: "packages/react-fhir/README.md",
    content: reactFhirReadme,
  },
  {
    slug: "goals-tasks",
    title: "Goals & Tasks sample app",
    category: "Overview",
    source: "apps/goals-tasks/README.md",
    content: goalsTasksReadme,
  },

  // Guides
  {
    slug: "fhir-server-setup",
    title: "FHIR server setup",
    category: "Guides",
    source: "docs/fhir-server-setup.md",
    content: fhirServerSetup,
  },
  {
    slug: "qa-agent",
    title: "QA agent",
    category: "Guides",
    source: "docs/qa-agent.md",
    content: qaAgent,
  },
  {
    slug: "test-patient-strategy",
    title: "Test patient strategy",
    category: "Guides",
    source: "docs/test-patient-strategy.md",
    content: testPatientStrategy,
  },
  {
    slug: "test-plan-fhir-ui",
    title: "Test plan — fhir-ui",
    category: "Guides",
    source: "docs/test-plan-fhir-ui.md",
    content: testPlanFhirUi,
  },

  // ADRs
  {
    slug: "adr-0001-github-issues",
    title: "ADR 0001 — GitHub Issues as source of truth",
    category: "Architecture decisions",
    source: "docs/decisions/0001-use-github-issues-as-source-of-truth.md",
    content: adr0001,
  },
  {
    slug: "adr-0002-linear-fallback",
    title: "ADR 0002 — Linear only if GitHub Projects breaks down",
    category: "Architecture decisions",
    source: "docs/decisions/0002-use-linear-only-if-github-projects-break-down.md",
    content: adr0002,
  },
  {
    slug: "adr-0003-agent-safety-rules",
    title: "ADR 0003 — Agent safety rules",
    category: "Architecture decisions",
    source: "docs/decisions/0003-agent-safety-rules.md",
    content: adr0003,
  },
  {
    slug: "adr-0004-positioning",
    title: "ADR 0004 — Positioning",
    category: "Architecture decisions",
    source: "docs/decisions/0004-positioning.md",
    content: adr0004,
  },
  {
    slug: "adr-0005-competitive-analysis",
    title: "ADR 0005 — Competitive analysis response",
    category: "Architecture decisions",
    source: "docs/decisions/0005-competitive-analysis-response.md",
    content: adr0005,
  },

  // SDLC
  {
    slug: "sdlc",
    title: "SDLC overview",
    category: "SDLC",
    source: "docs/sdlc/README.md",
    content: sdlcReadme,
  },
  {
    slug: "sdlc-agents",
    title: "Agents",
    category: "SDLC",
    source: "docs/sdlc/agents.md",
    content: sdlcAgents,
  },
  {
    slug: "sdlc-lifecycle",
    title: "Lifecycle",
    category: "SDLC",
    source: "docs/sdlc/lifecycle.md",
    content: sdlcLifecycle,
  },
  {
    slug: "sdlc-loops",
    title: "Loops",
    category: "SDLC",
    source: "docs/sdlc/loops.md",
    content: sdlcLoops,
  },
  {
    slug: "sdlc-safety",
    title: "Safety",
    category: "SDLC",
    source: "docs/sdlc/safety.md",
    content: sdlcSafety,
  },
  {
    slug: "sdlc-gaps",
    title: "Gaps",
    category: "SDLC",
    source: "docs/sdlc/gaps.md",
    content: sdlcGaps,
  },

  // Spikes
  {
    slug: "spike-package-boundaries",
    title: "Spike — package vs. demo boundaries",
    category: "Spikes",
    source: "docs/spikes/package-vs-demo-boundaries.md",
    content: spikePackageBoundaries,
  },
  {
    slug: "spike-profile-codegen",
    title: "Spike — profile codegen",
    category: "Spikes",
    source: "docs/spikes/profile-codegen.md",
    content: spikeProfileCodegen,
  },
];

export const DOC_CATEGORIES: DocCategory[] = [
  "Overview",
  "Guides",
  "Architecture decisions",
  "SDLC",
  "Spikes",
];

export const DEFAULT_DOC_SLUG = "overview";

export function findDoc(slug: string | undefined): DocEntry | undefined {
  if (!slug) return undefined;
  return DOCS.find((d) => d.slug === slug);
}
