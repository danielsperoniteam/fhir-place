# Changes Summary: `market-gap-comparison.md`

This file summarizes what was changed so you can push/cherry-pick elsewhere.

## File Added

- `packages/react-fhir/docs/market-gap-comparison.md`

## What the new document contains

1. **Scope correction (package/demo only)**
   - Explicitly limits analysis to:
     - `packages/react-fhir`
     - `apps/demo`
   - Explicitly states it is not workbench-focused.

2. **Positioning statement**
   - Defines the wedge as:
     - Easy-to-use React library
     - For building experiences/CX
     - On top of any FHIR backend

3. **Repo-grounded baseline**
   - Captures current strengths already visible in code:
     - layered architecture (`client`, `structure`, `hooks`, `components`)
     - subpath exports
     - TanStack Query hooks/client ergonomics
     - reusable components
     - existing tests/integration coverage
   - Captures demo strengths:
     - route coverage (list/detail/create/edit/index)
     - MSW mock mode
     - Playwright screenshot/e2e coverage

4. **Gap analysis vs PM memo**
   - Product narrative consistency gap
   - Competitive proof/matrix gap
   - Search DX differentiation gap
   - Interop demo-matrix gap

5. **Actionable roadmap cards (A–E)**
   - PR A: Positioning pass
   - PR B: Honest competitive matrix
   - PR C: Search DX flagship
   - PR D: Interop demo matrix
   - PR E: Distribution-ready artifacts
   - Each includes goal + acceptance criteria.

6. **Copy/paste insertion block**
   - Provides a ready markdown section for a package/demo backlog.

## Why this version should be used

- Aligns to requested focus (react-fhir + demo only).
- Keeps strategic recommendations actionable for coding-agent execution.
- Avoids coupling roadmap guidance to workbench Phase A constraints.
