# 0002 Use Linear Only if GitHub Projects Break Down

## Status
Accepted

## Context
Maintaining both GitHub Issues and Linear too early can create duplicate state
and conflicting workflows.

## Decision
Default to GitHub Issues + GitHub Projects first.
Introduce Linear only if roadmap/prioritization needs exceed GitHub workflows.
If adopted, Linear is product-planning layer while GitHub Issues/PRs remain tied
to technical execution.

## Consequences
- Lower tooling overhead while project scope is still evolving.
- Fewer synchronization mistakes between trackers.
- A future migration path remains open if collaboration load increases.
